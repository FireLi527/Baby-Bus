// HTML 课件文档：使用本机依赖，避免 KaTeX / Reveal CDN 失败后静默降级。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGE_CSS, RENDER_JS } from './embedded.mjs'
import { paginateCourseSlides } from './parse.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const HTML_RENDERER_VERSION = 18

let runtimeCache = null

function readText(...parts) { return fs.readFileSync(path.join(ROOT, ...parts), 'utf8') }
function safeStyle(source) { return String(source).replace(/<\/style/gi, '<\\/style') }
function safeScript(source) { return String(source).replace(/<\/script/gi, '<\\/script') }

function inlineKatexFonts(css) {
  const fontDir = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts')
  const withWoff2 = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (match, name) => {
    const data = fs.readFileSync(path.join(fontDir, name)).toString('base64')
    return `url(data:font/woff2;base64,${data})`
  })
  const withoutFallbacks = withWoff2
    .replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
    .replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '')
  if (withoutFallbacks.includes('url(fonts/')) throw new Error('KaTeX 字体没有全部内嵌')
  return withoutFallbacks
}

function loadRuntimeAssets() {
  if (runtimeCache) return runtimeCache
  runtimeCache = {
    katexCss: inlineKatexFonts(readText('node_modules', 'katex', 'dist', 'katex.min.css')),
    revealCss: readText('node_modules', 'reveal.js', 'dist', 'reveal.css'),
    katexJs: readText('node_modules', 'katex', 'dist', 'katex.min.js'),
    autoRenderJs: readText('node_modules', 'katex', 'dist', 'contrib', 'auto-render.min.js'),
    revealJs: readText('node_modules', 'reveal.js', 'dist', 'reveal.js'),
    katexLicense: readText('LICENSES', 'KaTeX-MIT.txt'),
    revealLicense: readText('LICENSES', 'Reveal.js-MIT.txt'),
  }
  runtimeCache.licenses = [runtimeCache.katexLicense, runtimeCache.revealLicense].join('\n\n')
  return runtimeCache
}

/** 给术语库等独立离线页面复用的 KaTeX 单文件运行时。 */
export function standaloneKatexAssets() {
  const runtime = loadRuntimeAssets()
  return {
    css: runtime.katexCss,
    js: runtime.katexJs,
    autoRenderJs: runtime.autoRenderJs,
    license: runtime.katexLicense,
  }
}

export function buildHtmlDoc(courseData) {
  const runtime = loadRuntimeAssets()
  const renderData = { ...courseData, slides: paginateCourseSlides(courseData.slides) }
  const payload = Buffer.from(JSON.stringify(renderData), 'utf8').toString('base64')
  const titleEsc = String(courseData.title || '').split('<').join('').split('>').join('')
  return `<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='baobao-renderer-version' content='${HTML_RENDERER_VERSION}'><title>${titleEsc}</title><style data-baobao-runtime='katex'>${safeStyle(runtime.katexCss)}</style><style data-baobao-runtime='reveal'>${safeStyle(runtime.revealCss)}</style><style>${safeStyle(PAGE_CSS)}</style></head><body><div class='reveal'><div class='slides' id='deck'></div></div><script type='application/json' id='course-data'>${payload}</script><script>${safeScript(RENDER_JS)}</script><script data-baobao-runtime='katex'>${safeScript(runtime.katexJs)}</script><script data-baobao-runtime='katex-auto-render'>${safeScript(runtime.autoRenderJs)}</script><script data-baobao-runtime='reveal'>${safeScript(runtime.revealJs)}</script><!-- Third-party license notices bundled with this standalone course:\n${runtime.licenses}\n--></body></html>`
}

function findPlanFiles(dir, depth, out) {
  if (depth > 10 || !fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findPlanFiles(full, depth + 1, out)
    else if (entry.isFile() && entry.name.endsWith('.plan.json')) out.push(full)
  }
}

/**
 * 只升级已有 HTML，不为 PPT-only 课程新建 HTML，也不调用模型。
 * 内容完全来自同名 plan.json，人工修改过的未知 HTML 不会被扫描到。
 */
export function refreshGeneratedCourseHtml(storageDir) {
  const plans = []
  findPlanFiles(storageDir, 0, plans)
  const result = { updated: 0, skipped: 0, errors: [] }
  const versionMarker = `name='baobao-renderer-version' content='${HTML_RENDERER_VERSION}'`
  for (const planFile of plans) {
    const htmlFile = planFile.slice(0, -'.plan.json'.length) + '.course.html'
    if (!fs.existsSync(htmlFile)) { result.skipped++; continue }
    try {
      const current = fs.readFileSync(htmlFile, 'utf8')
      if (current.includes(versionMarker)) { result.skipped++; continue }
      const courseData = JSON.parse(fs.readFileSync(planFile, 'utf8'))
      if (!courseData || !Array.isArray(courseData.slides)) throw new Error('plan.json 缺少 slides')
      fs.writeFileSync(htmlFile, buildHtmlDoc(courseData), 'utf8')
      result.updated++
    } catch (error) {
      result.errors.push({ file: planFile, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
