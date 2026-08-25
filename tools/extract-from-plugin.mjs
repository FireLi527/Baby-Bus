// 包含并修改自 @linxin666/dsh-study-assistant 0.1.0（Apache-2.0）的模板片段。
// 修改与许可证说明见 NOTICE、THIRD_PARTY_NOTICES.md 和 LICENSES/Apache-2.0.txt。
// 一次性脚手架工具：把 DSH 插件里沉淀的纯 JS 资产（提示词/渲染器/PPTX 等）抽取为独立 ESM 模块。
// 默认只写入待审阅候选文件，避免覆盖已经维护过的正式模板。
// 用法: node tools/extract-from-plugin.mjs [--plugin <lib/index.js>] [--replace-live]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

function parseArgs(args) {
  let plugin = ''
  let replaceLive = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--replace-live') {
      replaceLive = true
    } else if (arg === '--plugin') {
      plugin = args[++i] || ''
      if (!plugin) throw new Error('--plugin 需要一个 lib/index.js 路径')
    } else if (arg.startsWith('--plugin=')) {
      plugin = arg.slice('--plugin='.length)
      if (!plugin) throw new Error('--plugin 需要一个 lib/index.js 路径')
    } else {
      throw new Error('未知参数: ' + arg)
    }
  }
  return { plugin, replaceLive }
}

function discoverPlugin() {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@linxin666/dsh-study-assistant')
  } catch {
    throw new Error('未在本项目的 Node 模块搜索路径中找到 @linxin666/dsh-study-assistant；请使用 --plugin <lib/index.js> 显式指定来源')
  }
}

const options = parseArgs(process.argv.slice(2))
const PLUGIN = path.resolve(options.plugin || discoverPlugin())
if (!fs.statSync(PLUGIN).isFile()) throw new Error('插件入口不是文件: ' + PLUGIN)
const replaceLive = options.replaceLive
const OUT = fileURLToPath(new URL(replaceLive ? '../server/embedded.mjs' : '../server/embedded.candidate.mjs', import.meta.url))
const src = fs.readFileSync(PLUGIN, 'utf8')

function grabTemplate(name) {
  const i = src.indexOf('const ' + name + ' = `')
  if (i < 0) throw new Error('missing template: ' + name)
  const start = src.indexOf('`', i) + 1
  // 闭合反引号 = 其后紧跟换行的那个（行首或行尾反引号都能命中）
  let end = -1
  let from = start
  while (true) {
    const p = src.indexOf('`', from)
    if (p < 0) break
    const nx = src[p + 1]
    if (nx === '\n' || nx === '\r') { end = p; break }
    from = p + 1
  }
  if (end < 0) throw new Error('unterminated template: ' + name)
  return src.slice(start, end)
}
function grabCommentConst(name) {
  // 提取 `const X = '...'`（单行字符串常量）
  const i = src.indexOf('const ' + name + ' = ')
  if (i < 0) throw new Error('missing const: ' + name)
  const j = src.indexOf("'", i)
  const k = src.indexOf("'\n", j)
  return src.slice(j + 1, k)
}

function replaceRequired(body, from, to, label) {
  if (!body.includes(from)) throw new Error('plugin asset changed; cannot apply standalone override: ' + label)
  // 用函数返回替换文本，避免 `$&`、`$'` 等被 String.replace 当成特殊占位符。
  return body.replace(from, () => to)
}

function removeRequiredRange(body, startMarker, endMarker, label) {
  const start = body.indexOf(startMarker)
  const end = start < 0 ? -1 : body.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error('plugin asset changed; cannot remove standalone range: ' + label)
  return body.slice(0, start) + body.slice(end)
}

function applyStandaloneOverrides(name, body) {
  if (name === 'SYS') {
    body = replaceRequired(body,
      `每个新概念都按「五步讲懂法」展开（顺序可灵活，但五步都要覆盖）：`,
      `先判断资料类型。教材、讲义等教学资料可按需使用「五步讲懂法」；论文、综述和其他学术文献应优先忠实讲清研究问题、背景、方法、证据、结果与局限，不强制凑齐五步、例题或练习。`, 'material-aware teaching mode')
    body = replaceRequired(body,
      `4. 公式三步讲透：a) 逐符号解释（它代表什么、为什么出现在这里）；b) 讲来源——从更基本的定义完整推导，或用具体数字验证，或给直观论证；c) 代入一组具体数字，把每一步计算过程都写出来。`,
      `4. 公式按资料讲透：只有资料正文明确出现的公式才可使用；逐符号解释并说明资料给出的来源或作用。只有资料本身提供推导、数值验证或代入过程时才复现，绝不补造公式、变量、推导步骤或数字。`, 'source-grounded formulas')
    body = replaceRequired(body,
      `具体数字铁律：每张幻灯片至少要有一个带具体数字的内容（数值例题、代入计算、计数表）。严禁整页都是抽象叙述。`,
      `具体数字规则：实验数字、数值例题、代入计算和数据表只能取自资料正文，并保持原单位、条件和含义。资料没有数字时不强行添加。`, 'source-grounded numbers')
    body = replaceRequired(body,
      `类比铁律：每个新概念至少配一个生活化类比（水压、骰子、快递、考试成绩……什么贴切用什么）。`,
      `类比规则：只在确实有助于理解时使用简短生活化类比，并明确它只是解释；论文模式不强制类比，且类比不能冒充资料事实或研究证据。`, 'optional analogy')
    body = replaceRequired(body,
      `讲人话铁律：严禁照搬课件句子；原文里难懂的句子要拆开用自己的话重写；可以补充原文没有但有助于理解的背景。专业术语第一次出现时，用括号给一句白话解释。`,
      `讲人话铁律：严禁照搬课件句子；原文里难懂的句子要拆开用自己的话重写。可以增加不改变事实含义的解释和衔接，但不能补造资料未提供的事实、实验数据、例题、公式、推导或结论。专业术语第一次出现时，用括号给一句白话解释。`, 'no invented evidence')
    body = replaceRequired(body,
      `4. 术语中英对照：正文可直接使用专有名词（课件会把它们渲染成可点击查看白话解释的样式，并附文末术语表），但公式符号仍需逐个解释；末尾 1~2 页小结。`,
      `4. 术语中英对照：正文优先用中文名称，尽量不用缩写；英文全称和资料明确给出的缩写收进可点击术语提示及学习中心的独立术语库，不在单份课件末尾追加术语表页；公式符号仍需逐个解释；末尾 1~2 页小结。`, 'standalone glossary only')
    body = replaceRequired(body,
      `- formula：独立公式（latex 用 $$...$$），note 逐符号解释含义。`,
      `- formula：仅用于资料正文明确出现的独立公式（latex 用 $$...$$），note 逐符号解释含义；资料无公式则不用此块。`, 'formula block provenance')
    body = replaceRequired(body,
      `- walkthrough：代入具体数字的手算过程，steps 每步写「代入什么值 + 算得什么」，数字必须真实可算。`,
      `- walkthrough：仅复现资料正文已有的数值演算，steps 保留「代入什么值 + 算得什么」及原条件。`, 'walkthrough provenance')
    body = replaceRequired(body,
      `- example：具体数值例题，steps 分步计算，answer 给结果，note 给方法启示。`,
      `- example：仅复现资料正文已有的例题或案例；steps、answer 与条件必须来自资料，不得另编题目。`, 'example provenance')
    body = replaceRequired(body,
      `1. 每个公式必须三步讲透：逐符号解释 + 来源（推导/数值验证/直观论证）+ 代入具体数字手算。\n2. 每页至少一个具体数字内容；每个新概念至少一个类比。`,
      `1. 公式、例题、实验数字、推导和结论都必须能回指资料正文；资料没有就不要生成。\n2. 不强制每页出现数字、公式、例题或练习；类比只作解释，不能冒充资料事实或论文证据。`, 'grounding hard requirements')
    body = body.replace(`只输出 JSON 对象本体。`, `【最高优先级：资料忠实性】\n- 例题、案例、公式、实验数据、推导步骤和研究结论只能使用输入资料正文已有的内容，不得根据常识补全或自行设计。\n- 论文/文献模式不强制出题、练习、数值演算或公式；没有这些内容时，用文字、要点或资料中的表格讲清即可。\n- 遇到独立标题 References、Bibliography、Works Cited 或“参考文献”时，视为论文正文已经结束：其后的文献条目全部跳过，不进入大纲、正文、例题、公式或术语表。\n\n只输出 JSON 对象本体。`)
    return body
  }
  if (name === 'PAGE_CSS') {
    body = replaceRequired(body,
      `.dsh-slide{background:radial-gradient(1100px 620px at 88% -12%,rgba(124,58,237,.28),transparent 62%),radial-gradient(900px 520px at -12% 112%,rgba(34,211,238,.16),transparent 58%),linear-gradient(160deg,#0e1226,#111633 55%,#0d1228)!important}\n.dsh-slide .slide-in{width:100%;max-width:1060px;margin:0 auto;padding:0 8px}`,
      `.dsh-slide{background:radial-gradient(1100px 620px at 88% -12%,rgba(124,58,237,.28),transparent 62%),radial-gradient(900px 520px at -12% 112%,rgba(34,211,238,.16),transparent 58%),linear-gradient(160deg,#0e1226,#111633 55%,#0d1228)!important}\n.reveal .slides>section.dsh-slide{box-sizing:border-box;height:100%;max-height:100%;padding:36px 0 64px;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(129,140,248,.72) rgba(255,255,255,.08);touch-action:pan-y}\n.reveal .slides>section.dsh-slide::-webkit-scrollbar{width:10px}\n.reveal .slides>section.dsh-slide::-webkit-scrollbar-track{background:rgba(255,255,255,.08)}\n.reveal .slides>section.dsh-slide::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(129,140,248,.9),rgba(34,211,238,.78));border-radius:999px;border:2px solid rgba(14,18,38,.7)}\n.dsh-slide .slide-in{box-sizing:border-box;width:100%;max-width:1060px;margin:0 auto;padding:0 12px 28px}`,
      'scrollable individual slides')
    body = replaceRequired(body,
      `.dsh-stack .dsh-slide{position:static!important;top:auto!important;left:auto!important;transform:none!important;min-height:100vh;display:flex;align-items:flex-start}`,
      `.dsh-stack .dsh-slide{position:static!important;top:auto!important;left:auto!important;transform:none!important;height:auto;max-height:none;min-height:100vh;overflow:visible!important;display:flex;align-items:flex-start}`,
      'fallback remains document-scrolled')
    body = replaceRequired(body,
      `.gloss-formula{display:block;color:#94a3b8;font-size:15px;margin-top:2px}\n.gloss-static{color:#a5b4fc;font-weight:700}\n`,
      ``,
      'glossary appendix styles are unused')
    return body
  }
  if (name === 'RENDER_JS') {
    body = body.replace("txt(t1, '💡 大白话')", "txt(t1, '直觉')")
    body = replaceRequired(body,
      `if (parent.closest('.katex') || parent.closest('.gloss') || parent.closest('.gloss-static') || parent.closest('script') || parent.closest('style')) return`,
      `if (parent.closest('.katex') || parent.closest('.b-formula') || parent.closest('.b-ds-latex') || parent.closest('.gloss') || parent.closest('script') || parent.closest('style')) return`, 'glossary must skip formulas')
    body = replaceRequired(body, `if (!text || text.length < 2) return`, `if (!text || text.length < 2 || text.indexOf('$') >= 0) return`, 'glossary must skip math text')
    body = replaceRequired(body,
      `  if (glossary.length) {
    var gsec = el('section', 'dsh-slide')
    var ginner = el('div', 'slide-in')
    var gh = el('div', ANIM)
    var gh2 = el('h2'); txt(gh2, '术语表（忘了就回来查）'); gh.appendChild(gh2)
    var gbar = el('div', 'title-bar'); gh.appendChild(gbar)
    ginner.appendChild(gh)
    var gul = el('ul', 'b-bullets')
    glossary.forEach(function(g, bi){
      var li = el('li')
      var t = el('span', 'gloss-static'); txt(t, g.term); li.appendChild(t)
      txt(li, ' — ' + g.explain)
      if (g.formula) {
        var fsp = el('span', 'gloss-formula'); txt(fsp, g.formula); li.appendChild(fsp)
      }
      li.classList.add(ANIM); li.style.animationDelay = (bi * 60) + 'ms'
      gul.appendChild(li)
    })
    ginner.appendChild(gul)
    gsec.appendChild(ginner); deck.appendChild(gsec)
  }`,
      `  if (glossary.length) {
    // 术语数量可能超过 100；按条目数和文字量双重分页，避免单页被撑到数倍画布高度。
    var glossaryPages = []
    var glossaryPage = []
    var glossaryWeight = 0
    glossary.forEach(function(g){
      var itemWeight = String(g.term || '').length + String(g.explain || '').length + (g.formula ? Math.max(45, String(g.formula).length * 1.5) : 0)
      if (glossaryPage.length && (glossaryPage.length >= 10 || glossaryWeight + itemWeight > 500)) {
        glossaryPages.push(glossaryPage); glossaryPage = []; glossaryWeight = 0
      }
      glossaryPage.push(g); glossaryWeight += itemWeight
    })
    if (glossaryPage.length) glossaryPages.push(glossaryPage)
    glossaryPages.forEach(function(items, pageIndex){
      var gsec = el('section', 'dsh-slide')
      var ginner = el('div', 'slide-in')
      var gh = el('div', ANIM)
      var pageLabel = glossaryPages.length > 1 ? '（' + (pageIndex + 1) + '/' + glossaryPages.length + '）' : '（忘了就回来查）'
      var gh2 = el('h2'); txt(gh2, '术语表' + pageLabel); gh.appendChild(gh2)
      var gbar = el('div', 'title-bar'); gh.appendChild(gbar)
      ginner.appendChild(gh)
      var gul = el('ul', 'b-bullets')
      items.forEach(function(g, bi){
        var li = el('li')
        var t = el('span', 'gloss-static'); txt(t, g.term); li.appendChild(t)
        txt(li, ' — ' + g.explain)
        if (g.formula) {
          var fsp = el('span', 'gloss-formula'); txt(fsp, g.formula); li.appendChild(fsp)
        }
        li.classList.add(ANIM); li.style.animationDelay = (bi * 60) + 'ms'
        gul.appendChild(li)
      })
      ginner.appendChild(gul)
      gsec.appendChild(ginner); deck.appendChild(gsec)
    })
  }`, 'paginate glossary appendix')
    body = removeRequiredRange(body,
      `  if (glossary.length) {\n    // 术语数量可能超过 100`,
      `\n\n  if (glossary.length) { try {`,
      'course glossary appendix')
    body = body.replace('术语表页 + 术语高亮弹窗', '术语高亮弹窗；完整术语表统一放在学习中心')
    body = replaceRequired(body,
      `      pop.classList.add('show')
      var r = t.getBoundingClientRect()`,
      `      pop.classList.add('show')
      if (window.renderMathInElement) {
        try { window.renderMathInElement(pop, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ], throwOnError: false }) } catch (e) {}
      }
      var r = t.getBoundingClientRect()`,
      'render tooltip formula before positioning')
    body = replaceRequired(body,
      `      pop.style.top = top + 'px'
      if (window.renderMathInElement) {
        try { window.renderMathInElement(pop, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ], throwOnError: false }) } catch (e) {}
      }`,
      `      pop.style.top = top + 'px'`,
      'avoid tooltip size jump after positioning')
    body = replaceRequired(body,
      `    var hideTimer = null
    document.addEventListener('mouseover', function(ev){
      var t = ev.target
      if (t && t.classList && t.classList.contains('gloss')) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
        showPop(t)
      }
    })
    document.addEventListener('mouseout', function(ev){
      var t = ev.target
      if (t && t.classList && t.classList.contains('gloss')) {
        hideTimer = setTimeout(function(){ pop.classList.remove('show') }, 260)
      }
    })`,
      `    var hideTimer = null
    function cancelPopHide() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    }
    function schedulePopHide() {
      cancelPopHide()
      hideTimer = setTimeout(function(){ pop.classList.remove('show'); hideTimer = null }, 260)
    }
    pop.addEventListener('mouseenter', cancelPopHide)
    pop.addEventListener('mouseleave', schedulePopHide)
    document.addEventListener('mouseover', function(ev){
      var t = ev.target
      if (t && t.classList && t.classList.contains('gloss')) {
        cancelPopHide()
        showPop(t)
      }
    })
    document.addEventListener('mouseout', function(ev){
      var t = ev.target
      if (t && t.classList && t.classList.contains('gloss')) {
        if (!ev.relatedTarget || !pop.contains(ev.relatedTarget)) schedulePopHide()
      }
    })`,
      'keep tooltip open while pointer is inside')
    body = replaceRequired(body,
      `          hash: true, controls: true, progress: true, slideNumber: 'c/t',\n          transition: 'slide', transitionSpeed: 'default', backgroundTransition: 'fade',`,
      `          hash: true, controls: true, progress: true, slideNumber: 'c/t', center: false,\n          transition: 'slide', transitionSpeed: 'default', backgroundTransition: 'fade',`,
      'top-align scrollable slides')
    body = replaceRequired(body,
      `        window.Reveal.on('ready', function(){ setTimeout(renderMath, 80) })`,
      `        function refreshScrollState(slide){\n          if (!slide) return\n          slide.classList.toggle('dsh-scrollable', slide.scrollHeight > slide.clientHeight + 4)\n        }\n        window.Reveal.on('ready', function(event){\n          setTimeout(renderMath, 80)\n          refreshScrollState(event && event.currentSlide || document.querySelector('.slides > section.present'))\n        })\n        window.Reveal.on('slidechanged', function(event){\n          if (event && event.currentSlide) event.currentSlide.scrollTop = 0\n          refreshScrollState(event && event.currentSlide)\n          setTimeout(function(){ refreshScrollState(event && event.currentSlide) }, 100)\n        })\n        window.addEventListener('resize', function(){\n          refreshScrollState(document.querySelector('.slides > section.present'))\n        })`,
      'reset and detect slide scrolling')
    return body
  }
  if (name !== 'PY') return body

  body = replaceRequired(body,
    `    for n in names:
        root = ET.fromstring(z.read(n))`,
    `    for slide_no, n in enumerate(names, 1):
        root = ET.fromstring(z.read(n))`, 'numbered slides')
  body = replaceRequired(body,
    `        if texts:
            parts.append('=== SLIDE ===')
            parts.extend(texts)`,
    `        if texts:
            parts.append('=== SLIDE %d ===' % slide_no)
            parts.extend(texts)
        rels_name = 'ppt/slides/_rels/' + os.path.basename(n) + '.rels'
        if rels_name in z.namelist():
            rels = ET.fromstring(z.read(rels_name))
            for rel in rels:
                if str(rel.get('Type') or '').endswith('/notesSlide'):
                    target = str(rel.get('Target') or '')
                    notes_name = os.path.normpath(os.path.join('ppt/slides', target)).replace(chr(92), '/')
                    if notes_name in z.namelist():
                        notes_root = ET.fromstring(z.read(notes_name))
                        notes = [(t.text or '').strip() for t in notes_root.iter(A + 't') if (t.text or '').strip()]
                        if notes:
                            parts.append('--- SPEAKER NOTES ---')
                            parts.extend(notes)`, 'speaker notes')
  body = replaceRequired(body,
    `        if n.startswith('xl/worksheets/sheet') and n.endswith('.xml'):
            r = ET.fromstring(z.read(n))`,
    `        if n.startswith('xl/worksheets/sheet') and n.endswith('.xml'):
            parts.append('=== SHEET %s ===' % os.path.basename(n))
            r = ET.fromstring(z.read(n))`, 'sheet markers')
  body = body.replaceAll(`parts.append(val)`, `parts.append('%s: %s' % (c.get('r') or '?', val))`)
  body = body.replaceAll(`parts.append(s)`, `parts.append('%s: %s' % (c.get('r') or '?', s))`)
  body = replaceRequired(body, `    for c in data.get('cells', []):`, `    for cell_no, c in enumerate(data.get('cells', []), 1):`, 'notebook cell numbers')
  body = replaceRequired(body, `parts.append('# --- code cell ---' + NL + src + NL + '# --- end cell ---')`, `parts.append('=== CODE CELL %d ===' % cell_no + NL + src)`, 'code cell markers')
  body = replaceRequired(body, `parts.append(src)`, `parts.append('=== MARKDOWN CELL %d ===' % cell_no + NL + src)`, 'markdown cell markers')
  body = body.replaceAll(`        for p in doc:
            t = (p.get_text() or '').strip()
            if t:
                texts.append(t)`, `        for page_no, p in enumerate(doc, 1):
            t = (p.get_text() or '').strip()
            if t:
                texts.append('=== PAGE %d ===' % page_no + NL + t)`)
  body = body.replaceAll(`        for p in r.pages:
            t = (p.extract_text() or '').strip()
            if t:
                texts.append(t)`, `        for page_no, p in enumerate(r.pages, 1):
            t = (p.extract_text() or '').strip()
            if t:
                texts.append('=== PAGE %d ===' % page_no + NL + t)`)
  return body
}

const NAMES = ['SYS', 'PAGE_CSS', 'RENDER_JS', 'PY']
let out = '// 包含并修改自 @linxin666/dsh-study-assistant 0.1.0（Apache-2.0）。\n// 修改与许可证说明见 NOTICE、THIRD_PARTY_NOTICES.md 和 LICENSES/Apache-2.0.txt。\n// 由 tools/extract-from-plugin.mjs 生成；替换正式模板前必须人工审阅差异。\n'
for (const n of NAMES) {
  const body = applyStandaloneOverrides(n, grabTemplate(n))
  // 验证：模板内容本身是合法 JS 时校验一下（CSS/PY 跳过）
  out += 'export const ' + n + ' = `' + body + '`\n\n'
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
if (!replaceLive && fs.existsSync(OUT)) {
  throw new Error('候选文件已存在，请先审阅并移走或删除后再生成: ' + OUT)
}
fs.writeFileSync(OUT, out, { encoding: 'utf8', flag: replaceLive ? 'w' : 'wx' })
console.log(replaceLive ? '正式模板已替换:' : '候选模板已生成:', OUT)
if (!replaceLive) console.log('请审阅候选文件与 server/embedded.mjs 的差异；确认后才可使用 --replace-live。')
// 校验 RENDER_JS 可解析
const generatedUrl = pathToFileURL(OUT)
generatedUrl.searchParams.set('generated', String(Date.now()))
import(generatedUrl.href).then(m => {
  new Function(m.RENDER_JS)
  console.log('RENDER_JS syntax OK')
  console.log('lengths:', NAMES.map(n => n + '=' + m[n].length).join(' '))
})
