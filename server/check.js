// 渲染自检：可选的无头浏览器逐页检查（找不到浏览器或关闭开关则跳过）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import WebSocket from 'ws'
import { withTimeout, fileExists } from './util.js'

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]

export function findBrowser(cfgEdgePath) {
  if (cfgEdgePath && fileExists(cfgEdgePath)) return cfgEdgePath
  for (const p of EDGE_CANDIDATES) if (fileExists(p)) return p
  return null
}

export function collectLayoutProblems(metrics) {
  const problems = []
  for (const p of metrics.per || []) {
    if (p.page > 1 && p.fill < 35 && !['本讲内容', '学习目标', '小结', '资料来源'].includes(p.title) && !String(p.title || '').startsWith('术语表')) problems.push('第' + p.page + '页内容占比' + p.fill + '%（太空）')
    if (!p.scrollableY && (p.overflowY > 16 || p.clipBottom > 3 || p.clipTop > 3)) problems.push('第' + p.page + '页内容占比' + p.fill + '%（垂直溢出，需拆页）')
    if (p.overflowX > 16 || p.clipLeft > 3 || p.clipRight > 3) problems.push('第' + p.page + '页横向溢出 ' + Math.max(p.overflowX, p.clipLeft, p.clipRight) + 'px')
  }
  return problems
}

/**
 * 渲染自检：返回 { ok, skipped?, metrics?, problems? }
 */
export async function checkHtml(htmlPath, browserPath, pageUrl = '') {
  if (!browserPath) return { ok: true, skipped: true, problems: [] }
  // 交给 URL 标准库编码中文、空格、# 等字符；直接拼 file:/// 会被浏览器截断或打开错误页。
  const fileUrl = pathToFileURL(path.resolve(htmlPath)).href
  const targetUrl = pageUrl || fileUrl
  const port = 9340 + Math.floor(Math.random() * 400)
  const profile = path.join(os.tmpdir(), 'dsh-check-' + Date.now())
  const proc = spawn(browserPath, ['--headless=new', '--edge-skip-compat-layer-relaunch', '--remote-debugging-port=' + port, '--remote-allow-origins=*', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-gpu', '--window-size=1440,900', targetUrl], { stdio: 'ignore', windowsHide: true })
  let spawnErr = null
  let phase = '启动浏览器'
  const cdpTrace = []
  proc.on('error', e => { spawnErr = e })
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  try {
    if (spawnErr) return { ok: false, error: '浏览器启动失败: ' + spawnErr.message, problems: [] }
    let wsUrl = null
    let targetTrace = []
    const discoveryDeadline = Date.now() + 30000
    while (Date.now() < discoveryDeadline) {
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/json')
        const list = await res.json()
        targetTrace = list.slice(0, 8).map(t => String(t.type || '?') + ':' + String(t.url || ''))
        // Edge 可能同时创建 edge://newtab；必须绑定到这次请求的课件页，不能取列表中的第一个 page。
        const normalizeTarget = value => {
          try { return decodeURIComponent(String(value || '').split('#')[0]).replaceAll('\\', '/') }
          catch (e) { return String(value || '').split('#')[0].replaceAll('\\', '/') }
        }
        const wanted = normalizeTarget(targetUrl)
        const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl && normalizeTarget(t.url) === wanted)
          || list.find(t => t.type === 'page' && t.webSocketDebuggerUrl && /^(?:file|https?):/.test(String(t.url || '')))
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl
          break
        }
      } catch (e) {}
      await sleep(300)
    }
    if (!wsUrl) return { ok: false, error: 'no CDP target' + (targetTrace.length ? '：' + targetTrace.join(' | ') : ''), problems: [] }
    phase = '连接 CDP'
    const wsTarget = wsUrl.replace(/^ws:\/\/localhost:/, 'ws://127.0.0.1:')
    const ws = new WebSocket(wsTarget)
    await withTimeout(new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) }), 15000, 'cdp-connect')
    ws.on('close', (code) => { if (cdpTrace.length < 8) cdpTrace.push('close:' + code) })
    ws.on('error', (error) => { if (cdpTrace.length < 8) cdpTrace.push('error:' + String(error && error.message || error)) })
    let id = 0
    const pending = new Map()
    const exceptions = []
    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch (e) { return }
      if (cdpTrace.length < 8) cdpTrace.push(msg.id ? 'id:' + msg.id : String(msg.method || 'event'))
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      if (msg.method === 'Runtime.exceptionThrown' && msg.params && msg.params.exceptionDetails) {
        const d = msg.params.exceptionDetails
        exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown')
      }
    })
    const send = (method, params) => withTimeout(new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })) }), 15000, 'CDP 命令超时')
    phase = '启用 Runtime'
    await send('Runtime.enable', {})
    await sleep(2500)
    phase = '读取页面布局'
    const ev = await send('Runtime.evaluate', {
      expression: `(async () => {
        const slides = Array.from(document.querySelectorAll('.slides > section.dsh-slide'))
        const hasReveal = !!window.Reveal
        const hasKatex = !!window.katex
        const hasAutoRender = typeof window.renderMathInElement === 'function'
        // 自检时关闭切页/入场动画，否则测到的是过渡过程中的临时位置。
        const checkStyle = document.createElement('style')
        checkStyle.textContent = '.reveal .slides section,.reveal .slides section *{transition:none!important;animation:none!important}'
        document.head.appendChild(checkStyle)
        const cfg = hasReveal && window.Reveal.getConfig ? window.Reveal.getConfig() : {}
        const canvasH = Number(cfg.height) || 800
        const canvasW = Number(cfg.width) || 1280
        const initialSlide = hasReveal && window.Reveal.getIndices ? window.Reveal.getIndices() : null
        const per = []
        for (let i = 0; i < slides.length; i++) {
          // Reveal 会隐藏离当前页较远的 section；直接批量测量会把隐藏页误报为 0%。
          // 逐页切到 present 后等待两帧，测到的才是用户实际看到的布局。
          if (hasReveal && window.Reveal.slide) {
            window.Reveal.slide(i, 0, 0)
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          }
          const s = slides[i]
          const inner = s.querySelector('.slide-in')
          const h2 = s.querySelector('h2')
          const contentH = inner ? inner.scrollHeight : 0
          const contentW = inner ? inner.scrollWidth : 0
          const slideClientH = s.clientHeight || canvasH
          const slideClientW = s.clientWidth || canvasW
          const slideRect = s.getBoundingClientRect()
          const visible = inner ? [inner].concat(Array.from(inner.children)).filter(el => {
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            return cs.display !== 'none' && r.width > 0 && r.height > 0
          }) : []
          const rects = visible.map(el => el.getBoundingClientRect())
          const minLeft = rects.length ? Math.min(...rects.map(r => r.left)) : 0
          const maxRight = rects.length ? Math.max(...rects.map(r => r.right)) : 0
          const minTop = rects.length ? Math.min(...rects.map(r => r.top)) : 0
          const maxBottom = rects.length ? Math.max(...rects.map(r => r.bottom)) : 0
          per.push({
            page: i + 1,
            title: h2 ? h2.textContent : '',
            fill: canvasH > 0 ? Math.round(contentH / canvasH * 100) : 0,
            overflowY: Math.max(0, s.scrollHeight - slideClientH),
            scrollableY: ['auto', 'scroll'].includes(getComputedStyle(s).overflowY),
            overflowX: Math.max(0, contentW - slideClientW),
            clipLeft: Math.max(0, Math.round(slideRect.left - minLeft)),
            clipRight: Math.max(0, Math.round(maxRight - slideRect.right)),
            clipTop: Math.max(0, Math.round(slideRect.top - minTop)),
            clipBottom: Math.max(0, Math.round(maxBottom - slideRect.bottom))
          })
        }
        if (initialSlide && window.Reveal.slide) window.Reveal.slide(initialSlide.h || 0, initialSlide.v || 0, initialSlide.f)
        let dollars = 0
        slides.forEach(s => { dollars += (s.textContent.match(/\\$/g) || []).length })
        return { slides: slides.length, hasReveal, hasKatex, hasAutoRender, fallbackMode: document.body.classList.contains('dsh-fallback'), formulaBlocks: document.querySelectorAll('.b-formula').length, katexOk: document.querySelectorAll('.katex').length, katexErrors: document.querySelectorAll('.katex-error').length, leftoverDollar: dollars, bodyReady: document.body.classList.contains('ready'), per }
      })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    ws.close()
    const v = ev.result && ev.result.result && ev.result.result.value
    if (!v) return { ok: false, error: 'check eval failed', problems: [] }
    const problems = []
    if (v.slides === 0) problems.push('页面渲染出 0 张幻灯片（渲染器报错' + (exceptions.length ? '：' + String(exceptions[0]).slice(0, 300) : '') + '）')
    if (!v.bodyReady) problems.push('渲染失败：页面未激活（脚本异常' + (exceptions.length ? '：' + String(exceptions[0]).slice(0, 200) : '') + '）')
    if (!v.hasReveal || v.fallbackMode) problems.push('Reveal.js 未加载，课件已退化成长页面，无法按幻灯片正确缩放')
    problems.push(...collectLayoutProblems(v))
    if (v.katexErrors > 0) problems.push('有 ' + v.katexErrors + ' 个公式渲染失败')
    if (v.formulaBlocks > 0 && (!v.hasKatex || !v.hasAutoRender)) problems.push('KaTeX 未加载，公式仍是原始 LaTeX 文本')
    if (v.leftoverDollar > 0) problems.push('仍有 ' + v.leftoverDollar + ' 个未渲染的 $ 定界符')
    return { ok: true, metrics: v, problems }
  } catch (e) {
    return { ok: false, error: phase + '：' + String(e && e.message || e) + (cdpTrace.length ? '（CDP: ' + cdpTrace.join(', ') + '）' : '（CDP 无消息）'), problems: [] }
  } finally {
    try {
      if (process.platform === 'win32' && proc.pid) {
        // Edge 是多进程程序；只 kill 主进程会长期遗留 renderer/gpu 子进程并拖垮后续批量检查。
        spawnSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } else proc.kill()
    } catch (e) {}
    try {
      const tempRoot = path.resolve(os.tmpdir())
      const resolvedProfile = path.resolve(profile)
      if (path.dirname(resolvedProfile) === tempRoot && path.basename(resolvedProfile).startsWith('dsh-check-')) {
        fs.rmSync(resolvedProfile, { recursive: true, force: true })
      }
    } catch (e) {}
  }
}
