// 归档与学习中心：扫描、索引页、根登记、改名后按文件名兜底找回
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { extOf, xmlEsc, join, basename, fileExists } from './util.js'
import { INDEX_CSS, IX_JS } from './learning-center-assets.js'

export function stateDir(dataDir) { return path.join(dataDir, '.state') }
export function rootsFile(dataDir) { return path.join(stateDir(dataDir), 'archive-roots.json') }
export function readArchiveRoots(dataDir) {
  try { const v = JSON.parse(fs.readFileSync(rootsFile(dataDir), 'utf8')); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch (e) { return [] }
}
export function saveArchiveRoots(dataDir, list) {
  try { fs.mkdirSync(stateDir(dataDir), { recursive: true }); fs.writeFileSync(rootsFile(dataDir), JSON.stringify([...new Set(list)], null, 2), 'utf8') } catch (e) {}
}
export function registerArchiveRoot(dataDir, root) {
  const l = readArchiveRoots(dataDir)
  if (l.indexOf(root) < 0) { l.push(root); saveArchiveRoots(dataDir, l) }
}
export function remapArchiveRoots(dataDir, from, to) {
  const l = readArchiveRoots(dataDir)
  let changed = false
  const nl = l.map(r => {
    if (r === from || r.startsWith(from + '\\') || r.startsWith(from + '/')) { changed = true; return to + r.slice(from.length) }
    return r
  })
  if (changed) saveArchiveRoots(dataDir, nl)
}

function inspectCourseDir(rootRel, dir, course) {
  const materialsByBase = new Map()
  let hasArtifacts = false
  const material = (base) => {
    if (!materialsByBase.has(base)) materialsByBase.set(base, { base, title: base, difficulty: '', html: null, pptx: null, updatedAt: 0 })
    return materialsByBase.get(base)
  }
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!file.isFile()) continue
    if (/\.(?:source\.md|plan\.json|course\.html|slides\.pptx)$/i.test(file.name)) hasArtifacts = true
    const abs = path.join(dir, file.name)
    let base = ''
    if (file.name.endsWith('.plan.json')) base = file.name.slice(0, -'.plan.json'.length)
    else if (file.name.endsWith('.course.html')) base = file.name.slice(0, -'.course.html'.length)
    else if (file.name.endsWith('.slides.pptx')) base = file.name.slice(0, -'.slides.pptx'.length)
    else if (extOf(file.name) === '.html' && !['学习中心.html', '术语库.html'].includes(file.name)) base = file.name.slice(0, -'.html'.length)
    else if (extOf(file.name) === '.pptx') base = file.name.slice(0, -'.pptx'.length)
    if (!base) continue
    const item = material(base)
    try { item.updatedAt = Math.max(item.updatedAt, fs.statSync(abs).mtimeMs) } catch (e) {}
    if (extOf(file.name) === '.html' && !['学习中心.html', '术语库.html'].includes(file.name)) item.html = { name: file.name, abs }
    if (extOf(file.name) === '.pptx') item.pptx = { name: file.name, abs }
    if (file.name.endsWith('.plan.json')) {
      try {
        const meta = JSON.parse(fs.readFileSync(abs, 'utf8'))
        item.title = meta.title || item.title
        item.difficulty = meta.difficulty || ''
      } catch (e) {}
    }
  }
  const relDir = path.relative(rootRel, dir).split(path.sep).join('/')
  const materials = [...materialsByBase.values()]
    .filter(item => item.html || item.pptx)
    .map(item => ({
      ...item,
      html: item.html ? { rel: relDir + '/' + item.html.name, abs: item.html.abs } : null,
      pptx: item.pptx ? { rel: relDir + '/' + item.pptx.name, abs: item.pptx.abs } : null,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, 'zh'))
  if (!hasArtifacts && !materials.length) return null
  return {
    course,
    rel: relDir,
    dir,
    materials,
    // 保留首份课件字段，兼容旧调用方。
    title: course,
    difficulty: materials[0]?.difficulty || '',
    html: materials[0]?.html || null,
    pptx: materials[0]?.pptx || null,
  }
}

/** 扫描新版“课程”目录，并兼容旧版“科目/课程”两层目录。 */
export function scanCourseLocations(rootRel) {
  const locations = []
  if (!fileExists(rootRel)) return locations
  for (const first of fs.readdirSync(rootRel, { withFileTypes: true })) {
    if (!first.isDirectory() || first.name.startsWith('.')) continue
    const firstDir = path.join(rootRel, first.name)
    const directCourse = inspectCourseDir(rootRel, firstDir, first.name)
    if (directCourse) {
      locations.push(directCourse)
      continue
    }
    for (const second of fs.readdirSync(firstDir, { withFileTypes: true })) {
      if (!second.isDirectory() || second.name.startsWith('.')) continue
      const legacyCourse = inspectCourseDir(rootRel, path.join(firstDir, second.name), second.name)
      if (legacyCourse) locations.push(legacyCourse)
    }
  }
  return locations
}

export function scanCourses(rootRel) {
  return scanCourseLocations(rootRel)
    .filter(course => course.materials.length)
    .sort((a, b) => a.course.localeCompare(b.course, 'zh'))
}

export function indexHtml(courses, rootRel, options = {}) {
  let rows = ''
  for (const c of courses) {
    let materials = ''
    for (const item of c.materials) {
      let actions = ''
      if (item.html) actions += `<a class='ix-open ix-action' data-abs='` + xmlEsc(item.html.abs) + `' href='` + xmlEsc(item.html.rel) + `' target='_blank'>打开 HTML</a>`
      if (item.pptx) actions += `<a class='ix-open ix-action' data-abs='` + xmlEsc(item.pptx.abs) + `' href='` + xmlEsc(item.pptx.rel) + `' target='_blank'>下载 PPTX</a>`
      materials += `<div class='ix-material'><div><div class='ix-material-title'>` + xmlEsc(item.title) + `</div>` + (item.difficulty ? `<div class='ix-meta'>` + xmlEsc(item.difficulty) + `</div>` : '') + `</div><div class='ix-actions'>` + actions + `</div></div>`
    }
    const glossaryFile = path.join(c.dir, '术语库.html')
    const glossaryHref = options.dynamic
      ? '/api/study-assistant/glossary-view?course=' + encodeURIComponent(c.rel)
      : c.rel + '/术语库.html'
    const glossaryAction = fileExists(glossaryFile) ? `<div class='ix-course-tools'><a class='ix-gloss' href='` + xmlEsc(glossaryHref) + `' target='_blank'>本课程术语库</a></div>` : ''
    rows += `<details class='ix-course'><summary><span class='ix-title'>` + xmlEsc(c.course) + `</span><span class='ix-count'>` + xmlEsc(String(c.materials.length)) + ` 份课件</span></summary>` + glossaryAction + `<div class='ix-materials'>` + materials + `</div></details>`
  }
  if (!rows) rows = `<div class='ix-empty'>还没有课程。生成第一份课件吧。</div>`
  const version = crypto.createHash('sha1').update(JSON.stringify(courses.map(c => {
    let glossaryUpdatedAt = 0
    try { glossaryUpdatedAt = fs.statSync(path.join(c.dir, '术语库.html')).mtimeMs } catch (e) {}
    return [c.rel, glossaryUpdatedAt, c.materials.map(item => [item.base, item.updatedAt])]
  }))).digest('hex').slice(0, 12)
  return `<!DOCTYPE html><html lang='zh-CN' data-center-version='` + version + `'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>学习中心 · 宝宝巴士</title><style>` + INDEX_CSS + `</style></head><body><div class='wrap'><h1>宝宝巴士 · 学习中心</h1><div class='ix-note'>` + xmlEsc(String(courses.length)) + ` 门课程 · 每门课程使用独立术语库</div>` + rows + `</div><script>` + IX_JS + `</script></body></html>`
}

/** 创建/刷新项目内部的静态学习中心，返回 HTML 文件绝对路径。 */
export function refreshLearningCenter(rootRel) {
  fs.mkdirSync(rootRel, { recursive: true })
  const target = path.join(rootRel, '学习中心.html')
  const next = indexHtml(scanCourses(rootRel), rootRel)
  let current = ''
  try { current = fs.readFileSync(target, 'utf8') } catch (e) {}
  if (current !== next) fs.writeFileSync(target, next, 'utf8')
  return target
}

function walkForFile(dir, base, depth, out) {
  if (!fileExists(dir) || depth > 5 || out.length >= 50) return
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
  for (const e of es) {
    if (out.length >= 50) return
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walkForFile(full, base, depth + 1, out) }
    else if (e.name === base) out.push(full)
  }
}

export function findCourseFile(dataDir, storageDir, p) {
  const roots = [storageDir, ...readArchiveRoots(dataDir)].map(r => path.resolve(r))
  const inside = (candidate, root) => {
    const rel = path.relative(root, candidate)
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))
  }
  const abs = path.resolve(path.isAbsolute(p) ? p : path.join(storageDir, p))
  try {
    if (roots.some(root => inside(abs, root)) && fileExists(abs) && fs.statSync(abs).isFile()) return abs
  } catch (e) {}
  const base = basename(abs)
  const hits = []
  for (const r of roots) {
    if (hits.length) break
    if (fileExists(r)) walkForFile(r, base, 0, hits)
  }
  const uniq = []
  for (const h of hits) if (uniq.indexOf(h) < 0) uniq.push(h)
  return uniq.length === 1 ? uniq[0] : null
}
