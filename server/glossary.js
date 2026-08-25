// 术语库：按归档根单独储存，跨课件复用与持续积累
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { standaloneKatexAssets } from './html.js'
import { xmlEsc } from './util.js'

export function glossaryStoreFile(root) { return path.join(root, '术语库.json') }
export function glossaryViewFile(root) { return path.join(root, '术语库.html') }

export function normalizeGlossaryItem(item) {
  if (!item || typeof item !== 'object') return null
  const term = String(item.term || item.zh || item.chinese || '').trim()
  if (!term) return null
  return {
    ...item,
    term,
    english: String(item.english || item.en || item.englishName || '').trim(),
    abbr: String(item.abbr || item.abbreviation || item.acronym || '').trim(),
    explain: String(item.explain || '').trim(),
    formula: String(item.formula || '').trim(),
  }
}

export function normalizeGlossaryList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeGlossaryItem).filter(Boolean)
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
    cards += `<article class='gx-card'><div class='gx-term'>${xmlEsc(glossaryLabel(g))}</div><div class='gx-explain'>${xmlEsc(g.explain || '')}</div>${g.formula ? `<div class='gx-formula'>${xmlEsc(g.formula)}</div>` : ''}</article>`
  }
  return cards || `<div class='gx-empty'>暂无术语。生成课件后会自动显示在这里。</div>`
}

/** 同一模板同时服务动态路由与可双击打开的静态术语库。 */
export function buildGlossaryHtml(list, options = {}) {
  const glossary = normalizeGlossaryList(list)
  const version = glossaryVersion(glossary)
  const dataUrl = String(options.dataUrl || '/api/study-assistant/glossary-data')
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
    function render(next){list=Array.isArray(next)?next:[];cards.replaceChildren();count.textContent=list.length+' 个术语';if(!list.length){cards.appendChild(el('div','gx-empty','暂无术语。生成课件后会自动显示在这里。'));return}list.forEach(function(g){var card=el('article','gx-card');card.appendChild(el('div','gx-term',label(g)));card.appendChild(el('div','gx-explain',g.explain||''));if(g.formula)card.appendChild(el('div','gx-formula',g.formula));cards.appendChild(card)});math()}
    function apply(data){if(data&&data.version!==version){version=data.version;document.documentElement.setAttribute('data-glossary-version',version);render(data.glossary)}}
    function sync(){if(document.hidden)return;fetch(dataUrl,{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(apply).catch(function(){})}
    window.addEventListener('load',function(){render(list);sync();setInterval(sync,2000)})
    window.addEventListener('focus',sync)
    window.addEventListener('baobao:glossary-update',function(event){apply(event.detail)})
    document.addEventListener('visibilitychange',function(){if(!document.hidden)sync()})
  })()`
  return `<!DOCTYPE html><html lang='zh-CN' data-glossary-version='${version}'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='Cache-Control' content='no-store'><title>术语库 · 宝宝巴士</title><style data-baobao-runtime='katex'>${safeStyle(runtime.css)}</style><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;background:#f7f8fb;color:#1c2333;margin:0;line-height:1.7}.wrap{max-width:980px;margin:0 auto;padding:32px 20px}h1{font-size:26px;margin-bottom:4px}.gx-status{color:#6b7280;font-size:13px;margin-bottom:18px}.gx-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px;margin:10px 0;box-shadow:0 1px 3px rgba(16,24,40,.04)}.gx-term{font-weight:800;color:#4f46e5;font-size:16px;margin-bottom:6px}.gx-explain{color:#374151;font-size:14px}.gx-formula{margin-top:8px;color:#1e293b;overflow-x:auto}.gx-empty{color:#6b7280;padding:18px 0}</style></head><body><main class='wrap'><h1>宝宝巴士 · 术语库</h1><div class='gx-status'><span id='gx-count'>${xmlEsc(String(glossary.length))} 个术语</span> · 自动更新</div><section id='gx-cards'>${glossaryCards(glossary)}</section></main><script data-baobao-runtime='katex'>${safeScript(runtime.js)}</script><script data-baobao-runtime='katex-auto-render'>${safeScript(runtime.autoRenderJs)}</script><script>${safeScript(client)}</script><!-- KaTeX license bundled with this standalone glossary:\n${runtime.license}\n--></body></html>`
}

export function refreshGlossaryView(root, list, options = {}) {
  fs.mkdirSync(root, { recursive: true })
  const glossary = Array.isArray(list) ? list : readGlossaryStore(root)
  const dataUrl = options.port ? `http://127.0.0.1:${Number(options.port)}/api/study-assistant/glossary-data` : '/api/study-assistant/glossary-data'
  const target = glossaryViewFile(root)
  const next = buildGlossaryHtml(glossary, { dataUrl })
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
  const map = new Map()
  for (const g of normalizeGlossaryList(store)) map.set(g.term, g)
  for (const g of normalizeGlossaryList(fresh)) {
    const old = map.get(g.term)
    if (!old) map.set(g.term, g)
    else if (preferFresh) map.set(g.term, {
      ...old,
      ...g,
      english: g.english || old.english,
      abbr: g.abbr || old.abbr,
      explain: g.explain || old.explain,
      formula: g.formula || old.formula,
    })
    else map.set(g.term, {
      ...g,
      ...old,
      english: old.english || g.english,
      abbr: old.abbr || g.abbr,
      explain: old.explain || g.explain,
      formula: old.formula || g.formula,
    })
  }
  return [...map.values()]
}
