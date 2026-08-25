import path from 'node:path'
import { createHash } from 'node:crypto'
import { standaloneKatexAssets } from '../html.js'
import { xmlEsc } from '../util.js'
import { glossaryLabel, normalizeGlossaryList } from './model.js'

export function glossaryViewFile(root) { return path.join(root, '术语库.html') }

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
