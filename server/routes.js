// HTTP 路由：把插件的全部接口移植为标准 http 服务
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { queryParam, readJsonBody, json, CT, SUPPORTED, extOf, fileExists, basename, join, isPathInside } from './util.js'
import { generate, generateBatch } from './pipeline.js'
import { activeJobCount, completeJob, jobStatus, rejectJob, report } from './jobs.js'
import { scanCourses, scanCourseLocations, indexHtml, findCourseFile, refreshLearningCenter } from './archive.js'
import { buildGlossaryHtml, glossaryStoreFile, glossaryVersion, readGlossaryStore } from './glossary.js'
import { publicConfig, saveConfig } from './config.js'
import { testLlm } from './llm.js'

let currentCfg = null
export function setRuntimeCfg(cfg) { currentCfg = cfg }
let shutdownHandler = null
export function setShutdownHandler(handler) { shutdownHandler = typeof handler === 'function' ? handler : null }
let folderPicker = null
export function setFolderPicker(handler) { folderPicker = typeof handler === 'function' ? handler : null }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR_FILES = new Map([
  ['/vendor/katex/katex.min.css', path.join(ROOT, 'node_modules', 'katex', 'dist', 'katex.min.css')],
  ['/vendor/katex/katex.min.js', path.join(ROOT, 'node_modules', 'katex', 'dist', 'katex.min.js')],
  ['/vendor/katex/auto-render.min.js', path.join(ROOT, 'node_modules', 'katex', 'dist', 'contrib', 'auto-render.min.js')],
  ['/vendor/reveal/reveal.css', path.join(ROOT, 'node_modules', 'reveal.js', 'dist', 'reveal.css')],
  ['/vendor/reveal/reveal.min.js', path.join(ROOT, 'node_modules', 'reveal.js', 'dist', 'reveal.js')],
])

function vendorAsset(pathname) {
  if (VENDOR_FILES.has(pathname)) return VENDOR_FILES.get(pathname)
  const prefix = '/vendor/katex/fonts/'
  if (!pathname.startsWith(prefix)) return null
  let name = ''
  try { name = decodeURIComponent(pathname.slice(prefix.length)) } catch (e) { return null }
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') return null
  return path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts', name)
}

// 系统「选择文件夹」对话框（Windows）
async function pickFolderDialog() {
  if (folderPicker) return await folderPicker()
  const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '选择资料文件夹（宝宝巴士）'
$d.ShowNewFolderButton = $true
$d.RootFolder = [System.Environment+SpecialFolder]::MyComputer
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }`
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let done = false
    ps.stdout.setEncoding('utf8')
    ps.stdout.on('data', d => { out += d })
    const timer = setTimeout(() => { try { ps.kill() } catch (e) {} }, 600000)
    ps.on('error', e => { clearTimeout(timer); if (!done) { done = true; resolve({ ok: false, error: e.message }) } })
    ps.on('close', () => {
      clearTimeout(timer)
      if (done) return
      done = true
      const dir = String(out).split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop()
      if (dir) resolve({ ok: true, dir })
      else resolve({ ok: false, cancelled: true })
    })
  })
}

function isDir(p) { try { return fs.statSync(p).isDirectory() } catch (e) { return false } }
function startGeneration(res, args, prefix, runner, failureDetail) {
  const job = String(args.job || prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6))
  const request = { ...args, job }
  report(job, 'queued', '任务已提交')
  json(res, { ok: true, started: true, job })
  Promise.resolve()
    .then(() => runner(currentCfg, request))
    .then(result => completeJob(job, result, failureDetail ? failureDetail(result) : ''))
    .catch(error => rejectJob(job, error))
}

export async function handle(req, res) {
  const url = String(req.url || '')
  const pathname = url.split('?')[0]
  try {
    // 启动器通过应用标识确认本地服务。
    if (pathname === '/api/health' && req.method === 'GET') {
      json(res, { ok: true, app: 'baobao-bus', pid: process.pid, activeJobs: activeJobCount() })
      return
    }
    if (pathname === '/api/shutdown' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const activeJobs = activeJobCount()
      if (activeJobs > 0 && body.force !== true) {
        json(res, { ok: false, activeJobs, error: '仍有 ' + activeJobs + ' 个生成任务正在运行' })
        return
      }
      if (!shutdownHandler) {
        json(res, { ok: false, error: '当前运行模式不支持网页关闭服务' })
        return
      }
      json(res, { ok: true, activeJobs })
      setTimeout(() => { try { shutdownHandler() } catch (e) {} }, 120)
      return
    }

    // 课件运行时依赖固定从本机提供，避免 CDN/离线失败后公式和幻灯片模式静默失效。
    if (req.method === 'GET' && pathname.startsWith('/vendor/')) {
      const file = vendorAsset(pathname)
      if (!file || !fileExists(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404
        res.end('vendor asset not found')
        return
      }
      res.setHeader('Content-Type', CT[extOf(file)] || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(fs.readFileSync(file))
      return
    }

    // ── 配置 ──
    if (pathname === '/api/config' && req.method === 'GET') {
      json(res, publicConfig(currentCfg))
      return
    }
    if (pathname === '/api/config' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const next = {
        ...currentCfg,
        llm: { ...currentCfg.llm, ...(body.llm || {}) },
        storageDir: currentCfg.storageDir,
        enableSelfCheck: body.enableSelfCheck !== undefined ? !!body.enableSelfCheck : currentCfg.enableSelfCheck,
        edgePath: body.edgePath !== undefined ? body.edgePath : currentCfg.edgePath,
      }
      if (body.llm && body.llm.apiKey) next.llm.apiKey = body.llm.apiKey // 只覆盖非空 key
      if (body.test) {
        try { await testLlm(next.llm); saveConfig(next); currentCfg = next; json(res, { ok: true, tested: true, config: publicConfig(next) }) }
        catch (e) { json(res, { ok: false, tested: false, error: e && e.message || String(e) }) }
      } else {
        saveConfig(next); currentCfg = next
        json(res, { ok: true, tested: false, config: publicConfig(next) })
      }
      return
    }

    // ── 生成相关 ──
    if (pathname === '/api/study-assistant/list' && req.method === 'POST') {
      const args = await readJsonBody(req)
      let dir = String(args.dir || '')
      if (!dir) dir = currentCfg.inputDir
      else if (!path.isAbsolute(dir)) dir = path.resolve(currentCfg.inputDir, dir)
      // 输入浏览器不进入内部资料库，避免旧版记忆路径继续混淆输入与输出。
      if (isPathInside(dir, currentCfg.storageDir)) dir = currentCfg.inputDir
      const parent = path.dirname(dir)
      const entries = []
      if (fileExists(dir) && isDir(dir)) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue
          const full = join(dir, e.name)
          if (e.isDirectory()) entries.push({ name: e.name, isDir: true, path: full })
          else {
            const ext = extOf(e.name)
            if (SUPPORTED.indexOf(ext) >= 0) entries.push({ name: e.name, isDir: false, ext, path: full })
          }
        }
      }
      entries.sort((a, b) => a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh') : (a.isDir ? -1 : 1))
      json(res, { dir, parent: parent === dir ? null : parent, entries })
      return
    }
    if (pathname === '/api/study-assistant/pick-folder' && req.method === 'GET') {
      json(res, await pickFolderDialog())
      return
    }
    if (pathname === '/api/study-assistant/generate' && req.method === 'POST') {
      const args = await readJsonBody(req)
      startGeneration(res, args, 'gen', generate)
      return
    }
    if (pathname === '/api/study-assistant/generate-batch' && req.method === 'POST') {
      const args = await readJsonBody(req)
      startGeneration(res, args, 'bat', generateBatch, result => {
        if (result && result.error) return result.error
        return '多文件生成完成：失败 ' + Number(result && result.failCount || 0) + ' 份'
      })
      return
    }
    if (pathname === '/api/study-assistant/status') {
      const job = queryParam(req, 'job')
      const rec = job ? jobStatus.get(job) : null
      if (!rec) { json(res, { found: false }); return }
      json(res, { found: true, stage: rec.stage, detail: rec.detail, currentFile: rec.currentFile || '', started: rec.started, elapsed: Date.now() - rec.started, timeline: rec.timeline, result: rec.result || null })
      return
    }

    // ── 归档与文件 ──
    if (pathname === '/api/study-assistant/learning-center') {
      const pick = currentCfg.storageDir
      refreshLearningCenter(pick)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(indexHtml(scanCourses(pick), pick, { dynamic: true }))
      return
    }
    if (pathname === '/api/study-assistant/archive-taxonomy') {
      const courses = scanCourseLocations(currentCfg.storageDir)
        .map(course => ({ name: course.course, rel: course.rel }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      json(res, { courses })
      return
    }
    if (pathname === '/api/study-assistant/rename' && req.method === 'POST') {
      const args = await readJsonBody(req)
      const from = String(args.from || '')
      const to = String(args.to || '')
      if (!from || !to) { json(res, { ok: false, error: '缺少 from/to' }); return }
      const fromAbs = path.isAbsolute(from) ? from : join(currentCfg.storageDir, from)
      const cleanTo = to.trim()
      if (cleanTo !== path.basename(cleanTo) || cleanTo === '.' || cleanTo === '..') { json(res, { ok: false, error: '新名称不能包含路径' }); return }
      const toAbs = join(path.dirname(fromAbs), cleanTo)
      if (!isPathInside(fromAbs, currentCfg.storageDir) || !isPathInside(toAbs, currentCfg.storageDir) || path.resolve(fromAbs) === path.resolve(currentCfg.storageDir)) {
        json(res, { ok: false, error: '只能重命名内部资料库中的内容' })
        return
      }
      if (!fileExists(fromAbs)) { json(res, { ok: false, error: '原路径不存在' }); return }
      if (fileExists(toAbs)) { json(res, { ok: false, error: '目标名称已存在' }); return }
      try {
        fs.renameSync(fromAbs, toAbs)
        refreshLearningCenter(currentCfg.storageDir)
        json(res, { ok: true, to: toAbs })
      } catch (e) { json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }) }
      return
    }
    if (pathname === '/api/study-assistant/resolve-course') {
      const p = queryParam(req, 'p')
      const found = p ? findCourseFile(currentCfg.dataDir, currentCfg.storageDir, p) : null
      json(res, found ? { url: '/study-assistant/file?p=' + encodeURIComponent(found) } : { url: null })
      return
    }
    if (pathname === '/api/study-assistant/glossary-data' && req.method === 'GET') {
      const courseRel = queryParam(req, 'course')
      const location = courseRel ? scanCourseLocations(currentCfg.storageDir).find(course => course.rel === courseRel) : null
      if (!location) { res.statusCode = 400; json(res, { ok: false, error: '请从学习中心选择课程术语库' }); return }
      const list = readGlossaryStore(location.dir)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Access-Control-Allow-Origin', '*')
      json(res, { course: location.course, version: glossaryVersion(list), glossary: list })
      return
    }
    if (pathname === '/api/study-assistant/glossary-view' && req.method === 'GET') {
      const courseRel = queryParam(req, 'course')
      const location = courseRel ? scanCourseLocations(currentCfg.storageDir).find(course => course.rel === courseRel) : null
      if (!location || !fileExists(glossaryStoreFile(location.dir))) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('本课程术语库不存在'); return }
      const list = readGlossaryStore(location.dir)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(buildGlossaryHtml(list, { courseName: location.course, dataUrl: '/api/study-assistant/glossary-data?course=' + encodeURIComponent(location.rel) }))
      return
    }

    // ── 文件服务 ──
    if (pathname.startsWith('/study-assistant/file')) {
      const p = queryParam(req, 'p')
      if (!p) { res.statusCode = 400; res.end('missing p'); return }
      const abs = findCourseFile(currentCfg.dataDir, currentCfg.storageDir, p)
      if (!abs) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('未找到文件：课件可能已被移动或改名，请重新打开/生成学习中心'); return }
      const ext = extOf(abs)
      if (!CT[ext]) { res.statusCode = 403; res.end('forbidden'); return }
      const bytes = fs.readFileSync(abs)
      res.setHeader('Content-Type', CT[ext])
      if (ext === '.html') res.setHeader('Content-Disposition', 'inline')
      else res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(basename(abs) || 'file'))
      res.end(bytes)
      return
    }

    // ── 静态前端（vite build 产物）──
    const dist = path.join(ROOT, 'dist')
    if (req.method === 'GET') {
      let relPath = pathname === '/' ? '/index.html' : pathname
      const file = path.resolve(dist, decodeURIComponent(relPath).replace(/^\/+/, ''))
      const insideDist = file === dist || file.startsWith(dist + path.sep)
      if (insideDist && fileExists(file) && fs.statSync(file).isFile()) {
        const ext = extOf(file)
        res.setHeader('Content-Type', CT[ext] || 'application/octet-stream')
        res.end(fs.readFileSync(file))
        return
      }
      if (fileExists(path.join(dist, 'index.html'))) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(fs.readFileSync(path.join(dist, 'index.html')))
        return
      }
      // 前端尚未构建：给出友好引导页
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>宝宝巴士</title><style>body{font-family:-apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;background:#f4f6fb;color:#1c2333;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:36px 44px;max-width:520px;box-shadow:0 8px 30px rgba(16,24,40,.08)}h1{font-size:22px;margin:0 0 12px}a{display:inline-block;margin-top:14px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;padding:11px 22px;font-weight:700}code{background:#eef2ff;border-radius:6px;padding:2px 8px;color:#4f46e5}</style></head><body><div class='box'><h1>宝宝巴士</h1><p>前端尚未构建。</p><p>开发模式运行 <code>npm run dev</code>，生产模式先运行 <code>npm run build</code>。</p><a href='http://127.0.0.1:5173'>打开开发页面</a></div></body></html>`)
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('not found: ' + pathname + '（开发模式请使用 npm run dev 启动 Vite 前端）')
  } catch (e) {
    if (res.headersSent) { res.destroy(); return }
    const statusCode = Number(e && e.statusCode)
    res.statusCode = statusCode >= 400 && statusCode <= 599 ? statusCode : 500
    const message = e instanceof Error ? e.message : String(e)
    if (pathname.startsWith('/api/')) json(res, { ok: false, error: message })
    else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(message)
    }
  }
}
