// 术语库：每门课程单独储存；同一课程的多份课件共享，课程之间完全隔离。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { buildHtmlDoc, standaloneKatexAssets } from './html.js'
import { xmlEsc } from './util.js'

export function glossaryStoreFile(root) { return path.join(root, '术语库.json') }
export function glossaryViewFile(root) { return path.join(root, '术语库.html') }

export function normalizeGlossaryItem(item) {
  if (!item || typeof item !== 'object') return null
  const term = String(item.term || item.zh || item.chinese || '').trim()
  if (!term) return null
  const aliasInput = Array.isArray(item.aliases) ? item.aliases : (typeof item.aliases === 'string' ? item.aliases.split(/[、,，;；]/) : [])
  return {
    ...item,
    term,
    english: String(item.english || item.en || item.englishName || '').trim(),
    abbr: String(item.abbr || item.abbreviation || item.acronym || '').trim(),
    aliases: [...new Set(aliasInput.map(value => String(value || '').trim()).filter(value => value && value !== term))],
    explain: String(item.explain || item.definition || item.description || item.meaning || '').trim(),
    formula: String(item.formula || '').trim(),
  }
}

function foldedTerm(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_.·‐‑‒–—-]+/g, '')
}

function identityKeys(item) {
  const keys = []
  for (const value of [item.term, ...(item.aliases || [])]) {
    const folded = foldedTerm(value)
    if (folded) keys.push('term:' + folded)
  }
  const english = foldedTerm(item.english)
  if (english) keys.push('english:' + english)
  return [...new Set(keys)]
}

function preferredCaseTerm(first, second) {
  if (foldedTerm(first) !== foldedTerm(second)) return first
  const score = value => (String(value).match(/[A-Z]/g) || []).length
  return score(second) > score(first) ? second : first
}

function combinedGlossaryItem(previous, incoming, preferIncoming) {
  let term = preferIncoming ? incoming.term : preferredCaseTerm(previous.term, incoming.term)
  if (foldedTerm(previous.term) === foldedTerm(incoming.term)) term = preferredCaseTerm(previous.term, incoming.term)
  const aliases = []
  const addAlias = value => {
    const text = String(value || '').trim()
    if (!text || foldedTerm(text) === foldedTerm(term) || aliases.some(item => foldedTerm(item) === foldedTerm(text))) return
    aliases.push(text)
  }
  for (const value of [...(previous.aliases || []), ...(incoming.aliases || [])]) addAlias(value)
  if (foldedTerm(previous.term) !== foldedTerm(incoming.term)) {
    addAlias(previous.term)
    addAlias(incoming.term)
  }
  const primary = preferIncoming ? incoming : previous
  const secondary = preferIncoming ? previous : incoming
  return {
    ...secondary,
    ...primary,
    term,
    english: primary.english || secondary.english,
    abbr: primary.abbr || secondary.abbr,
    aliases,
    explain: primary.explain || secondary.explain,
    formula: primary.formula || secondary.formula,
  }
}

function mergeNormalizedGlossary(base, incoming, preferIncoming) {
  const result = [...base]
  const keyToIndex = new Map()
  const indexItem = (item, index) => identityKeys(item).forEach(key => keyToIndex.set(key, index))
  result.forEach(indexItem)
  for (const item of incoming) {
    const match = identityKeys(item).map(key => keyToIndex.get(key)).find(index => index !== undefined)
    if (match === undefined) {
      result.push(item)
      indexItem(item, result.length - 1)
      continue
    }
    result[match] = combinedGlossaryItem(result[match], item, preferIncoming)
    indexItem(result[match], match)
  }
  return result
}

export function normalizeGlossaryList(list) {
  const normalized = (Array.isArray(list) ? list : []).map(normalizeGlossaryItem).filter(Boolean)
  return mergeNormalizedGlossary([], normalized, false)
}

function glossaryTextFragments(slides) {
  const result = []
  const visit = value => {
    if (typeof value === 'string') {
      const text = value.replace(/\s+/g, ' ').trim()
      if (text && text.length <= 1200) result.push(text)
      return
    }
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (['dataUrl', 'sourceAnchors', 'sourceRefs', 'assetId', 'sourceTableId'].includes(key)) continue
      visit(item)
    }
  }
  for (const slide of (Array.isArray(slides) ? slides : [])) {
    visit(slide && slide.blocks)
    visit(slide && slide.title)
  }
  return result
}

/**
 * 模型术语调用失败时的资料忠实兜底：只接纳课件中明确写出的“中文（英文/缩写）”。
 * 解释直接取该术语所在原句，不查外部知识，也不补造英文全称。
 */
export function deriveGlossaryFromSlides(slides) {
  const fragments = glossaryTextFragments(slides)
  const candidates = new Map()
  const pattern = /([\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9·+\-]{1,23})[（(]([A-Za-z][A-Za-z0-9 .+\/_&-]{1,72})[）)]/gu
  const stripPrefixes = value => {
    let text = value
    for (const marker of ['称之为', '我们称为', '被称为', '也称为', '称为', '叫作', '叫做', '也叫', '所谓', '基于', '叫']) {
      const index = text.lastIndexOf(marker)
      if (index >= 0) text = text.slice(index + marker.length)
    }
    return text.replace(/^(?:这就是一个|这是一个|选定一个|同一个|第一层是|最后一层是|一个|一种|一些|有些|这些|这个|会在|的|是)+/, '')
  }
  const englishMatchesTerm = (term, english) => {
    const expectations = [
      ['嵌入', /embedding/i], ['网络', /network/i], ['层', /layer/i], ['单元', /unit/i],
      ['例', /example/i], ['函数', /function/i], ['权重', /weight/i], ['窗口', /window/i],
      ['向量', /vector/i],
    ]
    return expectations.every(([suffix, expected]) => !term.endsWith(suffix) || expected.test(english))
  }
  for (const fragment of fragments) {
    for (const sentence of fragment.split(/(?<=[。！？；;])/u)) {
      pattern.lastIndex = 0
      let match = null
      while ((match = pattern.exec(sentence))) {
        const term = stripPrefixes(match[1]).trim()
        if (term.length < 2 || term.length > 10) continue
        if (/^(?:一个|一种|一些|有些|这些|这个|我们|它们|其中|以及|或者|和|与|有|无)/.test(term)) continue
        if (/(?:可以|的是|的|为|把|将|从|对)$/.test(term) || term.includes('可以') || term.includes('学期')) continue
        if (['正面', '负面', '同义', '相似', '相关'].includes(term)) continue
        const parts = match[2].split(/[\/|｜]/).map(value => value.trim()).filter(Boolean)
        const isAbbreviation = value => /^[A-Z][A-Z0-9-]{1,11}$/.test(value) || (/^[A-Za-z][A-Za-z0-9-]{1,11}$/.test(value) && (value.match(/[A-Z]/g) || []).length >= 2 && (value.match(/[a-z]/g) || []).length < 3)
        const abbr = parts.find(isAbbreviation) || ''
        const english = parts.find(value => value !== abbr && /[a-z]/.test(value)) || (!abbr && /[a-z]/.test(match[2]) ? match[2].trim() : '')
        if (!english) continue
        if (!englishMatchesTerm(term, english)) continue
        const explain = sentence.replace(/^\s+|\s+$/g, '').slice(0, 260)
        if (explain.length < term.length + english.length + 6) continue
        const key = foldedTerm(term)
        const item = { term, english, abbr, aliases: [], explain, formula: '' }
        const previous = candidates.get(key)
        if (!previous || item.explain.length > previous.explain.length) candidates.set(key, item)
      }
    }
  }
  return normalizeGlossaryList([...candidates.values()]).slice(0, 40)
}

export function glossaryLabel(item) {
  const g = normalizeGlossaryItem(item)
  if (!g) return ''
  const aliases = []
  if (g.english && g.english !== g.term) aliases.push(g.english)
  if (g.abbr && g.abbr !== g.term && !aliases.includes(g.abbr)) aliases.push(g.abbr)
  return g.term + (aliases.length ? `（${aliases.join('/')}）` : '')
}

export function readGlossaryStore(root) {
  const file = glossaryStoreFile(root)
  if (!fs.existsSync(file)) return []
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(value)) throw new Error('根节点必须是数组')
    return normalizeGlossaryList(value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('术语库读取失败，原文件已保留：' + message)
  }
}

export function glossaryVersion(list) {
  return createHash('sha1').update(JSON.stringify(list || []), 'utf8').digest('hex').slice(0, 12)
}

function safeStyle(source) { return String(source).replace(/<\/style/gi, '<\\/style') }
function safeScript(source) { return String(source).replace(/<\/script/gi, '<\\/script') }

function glossaryCards(list) {
  let cards = ''
  for (const g of list) {
    cards += `<article class='gx-card'><div class='gx-term'>${xmlEsc(glossaryLabel(g))}</div>${g.aliases?.length ? `<div class='gx-aliases'>别名：${xmlEsc(g.aliases.join('、'))}</div>` : ''}<div class='gx-explain'>${xmlEsc(g.explain || '')}</div>${g.formula ? `<div class='gx-formula'>${xmlEsc(g.formula)}</div>` : ''}</article>`
  }
  return cards || `<div class='gx-empty'>暂无术语。生成课件后会自动显示在这里。</div>`
}

/** 同一模板同时服务动态路由与可双击打开的静态术语库。 */
export function buildGlossaryHtml(list, options = {}) {
  const glossary = normalizeGlossaryList(list)
  const version = glossaryVersion(glossary)
  const dataUrl = String(options.dataUrl || '/api/study-assistant/glossary-data')
  const courseName = String(options.courseName || '').trim()
  const runtime = standaloneKatexAssets()
  const initial = JSON.stringify(glossary).replace(/</g, '\\u003c')
  const client = `(function(){
    var dataUrl=${JSON.stringify(dataUrl)}
    var version=${JSON.stringify(version)}
    var list=${initial}
    var cards=document.getElementById('gx-cards')
    var count=document.getElementById('gx-count')
    function el(tag, cls, value){var n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
    function label(g){var aliases=[];if(g.english&&g.english!==g.term)aliases.push(g.english);if(g.abbr&&g.abbr!==g.term&&aliases.indexOf(g.abbr)<0)aliases.push(g.abbr);return (g.term||'')+(aliases.length?'（'+aliases.join('/')+'）':'')}
    function math(){if(window.renderMathInElement){try{window.renderMathInElement(cards,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})}catch(e){}}}
    function render(next){list=Array.isArray(next)?next:[];cards.replaceChildren();count.textContent=list.length+' 个术语';if(!list.length){cards.appendChild(el('div','gx-empty','暂无术语。生成课件后会自动显示在这里。'));return}list.forEach(function(g){var card=el('article','gx-card');card.appendChild(el('div','gx-term',label(g)));if(Array.isArray(g.aliases)&&g.aliases.length)card.appendChild(el('div','gx-aliases','别名：'+g.aliases.join('、')));card.appendChild(el('div','gx-explain',g.explain||''));if(g.formula)card.appendChild(el('div','gx-formula',g.formula));cards.appendChild(card)});math()}
    function apply(data){if(data&&data.version!==version){version=data.version;document.documentElement.setAttribute('data-glossary-version',version);render(data.glossary)}}
    function sync(){if(document.hidden)return;fetch(dataUrl,{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(apply).catch(function(){})}
    window.addEventListener('load',function(){render(list);sync();setInterval(sync,2000)})
    window.addEventListener('focus',sync)
    window.addEventListener('baobao:glossary-update',function(event){apply(event.detail)})
    document.addEventListener('visibilitychange',function(){if(!document.hidden)sync()})
  })()`
  return `<!DOCTYPE html><html lang='zh-CN' data-glossary-version='${version}'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='Cache-Control' content='no-store'><title>${xmlEsc(courseName ? courseName + ' · 术语库' : '术语库')} · 宝宝巴士</title><style data-baobao-runtime='katex'>${safeStyle(runtime.css)}</style><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;background:#f7f8fb;color:#1c2333;margin:0;line-height:1.7}.wrap{max-width:980px;margin:0 auto;padding:32px 20px}h1{font-size:26px;margin-bottom:4px}.gx-status{color:#6b7280;font-size:13px;margin-bottom:18px}.gx-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px;margin:10px 0;box-shadow:0 1px 3px rgba(16,24,40,.04)}.gx-term{font-weight:800;color:#4f46e5;font-size:16px;margin-bottom:4px}.gx-aliases{color:#64748b;font-size:12px;margin-bottom:6px}.gx-explain{color:#374151;font-size:14px}.gx-formula{margin-top:8px;color:#1e293b;overflow-x:auto}.gx-empty{color:#6b7280;padding:18px 0}</style></head><body><main class='wrap'><h1>${xmlEsc(courseName ? courseName + ' · 术语库' : '宝宝巴士 · 术语库')}</h1><div class='gx-status'><span id='gx-count'>${xmlEsc(String(glossary.length))} 个术语</span> · 仅属于本课程 · 自动更新</div><section id='gx-cards'>${glossaryCards(glossary)}</section></main><script data-baobao-runtime='katex'>${safeScript(runtime.js)}</script><script data-baobao-runtime='katex-auto-render'>${safeScript(runtime.autoRenderJs)}</script><script>${safeScript(client)}</script><!-- KaTeX license bundled with this standalone glossary:\n${runtime.license}\n--></body></html>`
}

export function refreshGlossaryView(root, list, options = {}) {
  fs.mkdirSync(root, { recursive: true })
  const glossary = Array.isArray(list) ? list : readGlossaryStore(root)
  const courseQuery = options.course ? '?course=' + encodeURIComponent(String(options.course)) : ''
  const dataUrl = options.dataUrl || (options.port ? `http://127.0.0.1:${Number(options.port)}/api/study-assistant/glossary-data${courseQuery}` : `/api/study-assistant/glossary-data${courseQuery}`)
  const target = glossaryViewFile(root)
  const next = buildGlossaryHtml(glossary, { dataUrl, courseName: options.courseName || path.basename(root) })
  let current = ''
  try { current = fs.readFileSync(target, 'utf8') } catch (e) {}
  if (current !== next) fs.writeFileSync(target, next, 'utf8')
  return target
}

export function writeGlossaryStore(root, list, options = {}) {
  const normalized = normalizeGlossaryList(list)
  fs.writeFileSync(glossaryStoreFile(root), JSON.stringify(normalized, null, 2), 'utf8')
  refreshGlossaryView(root, normalized, options)
}
export function mergeGlossary(store, fresh, preferFresh) {
  return mergeNormalizedGlossary(normalizeGlossaryList(store), normalizeGlossaryList(fresh), !!preferFresh)
}

function collectPlanFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) collectPlanFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.plan.json')) out.push(full)
  }
  return out
}

/**
 * 修复旧版本留下的空课程术语库。恢复过程完全基于已生成课件中的明确中英对照，
 * 不调用模型；同时更新 plan 与已存在的 HTML，让术语提示立刻可用。
 */
export function recoverEmptyGlossaries(storageDir, options = {}) {
  const result = { recoveredCourses: 0, recoveredTerms: 0, updatedPlans: 0, updatedHtml: 0, errors: [] }
  const plansByCourse = new Map()
  for (const planFile of collectPlanFiles(storageDir)) {
    const courseDir = path.dirname(planFile)
    if (!plansByCourse.has(courseDir)) plansByCourse.set(courseDir, [])
    plansByCourse.get(courseDir).push(planFile)
  }

  for (const [courseDir, planFiles] of plansByCourse) {
    try {
      let stored = []
      try { stored = readGlossaryStore(courseDir) } catch (error) {
        result.errors.push({ courseDir, stage: 'read-glossary', message: error instanceof Error ? error.message : String(error) })
        continue
      }
      if (stored.length) continue

      const loadedPlans = []
      let recovered = []
      for (const planFile of planFiles) {
        try {
          const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
          loadedPlans.push({ planFile, plan })
          recovered = mergeGlossary(recovered, normalizeGlossaryList(plan.glossary), false)
          recovered = mergeGlossary(recovered, deriveGlossaryFromSlides(plan.slides), false)
        } catch (error) {
          result.errors.push({ planFile, stage: 'read-plan', message: error instanceof Error ? error.message : String(error) })
        }
      }
      if (!recovered.length) continue

      const course = path.relative(storageDir, courseDir).split(path.sep).join('/')
      writeGlossaryStore(courseDir, recovered, {
        port: options.port,
        course,
        courseName: path.basename(courseDir),
      })
      result.recoveredCourses += 1
      result.recoveredTerms += recovered.length

      for (const { planFile, plan } of loadedPlans) {
        try {
          plan.glossary = recovered
          fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8')
          result.updatedPlans += 1
          const htmlFile = planFile.slice(0, -'.plan.json'.length) + '.course.html'
          if (fs.existsSync(htmlFile)) {
            fs.writeFileSync(htmlFile, buildHtmlDoc(plan), 'utf8')
            result.updatedHtml += 1
          }
        } catch (error) {
          result.errors.push({ planFile, stage: 'write-plan', message: error instanceof Error ? error.message : String(error) })
        }
      }
    } catch (error) {
      result.errors.push({ courseDir, stage: 'recover-course', message: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
