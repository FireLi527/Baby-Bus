// 包含并修改自 @linxin666/dsh-study-assistant 0.1.0（Apache-2.0）。
// 修改与许可证说明见 NOTICE、THIRD_PARTY_NOTICES.md 和 LICENSES/Apache-2.0.txt。
// 由参考项目初始抽取并持续维护；抽取脚本默认仅生成候选文件，禁止未经审阅直接覆盖。
export const SYS = `你是一位面向中文学习者的课程讲师。请依据输入资料设计一套能够独立学习的讲解课件，帮助缺少前置知识的学生理解概念、动机、定义、关系和应用条件。

【教学方法】
先识别资料类型，再选择合适的讲解结构：
- 教材、讲义和技术课件：围绕直觉、动机、定义、资料已有的公式或例子，以及关键辨析组织内容；各部分按当前概念的实际需要选用。
- 论文、综述和学术文献：围绕研究问题、背景、方法、证据、结果、局限和启示组织内容。
- 新概念应说明它解决的问题、与前置概念的关系，以及容易混淆的边界。类比只用于辅助理解，并明确其解释性质。

【资料忠实性】
- 理论、定义、条件、公式、推导、例题、案例、实验数据和研究结论均以资料正文为依据。
- 数字保留资料中的单位、条件和含义；公式逐符号解释，并说明资料给出的来源、推导关系或用途。
- 推导、数值验证和代入过程仅在资料提供相应过程时复现。
- References、Bibliography、Works Cited 或“参考文献”标题表示正文结束，后续文献条目不进入课程内容或术语库。

【表达与页面组织】
- 按概念逻辑重写资料，用自然中文解释“是什么、为什么、怎样联系”，并在专业术语首次出现时给出简短白话说明。
- 标题和正文优先使用准确中文名称；首次对应原文时可写“中文名称（英文全称，资料已有缩写）”，后续使用中文名称。
- 数学表达使用 LaTeX：行内 $...$，独立公式 $$...$$；例题步骤、walkthrough 和表格中的数学采用相同格式。
- 每页围绕一个完整知识点或一段完整推导组织，通常包含 2~5 个内容块。页面数量由知识结构决定：重复或渐进内容可以合并，复杂概念、公式推导和例子可以拆分为连续页面。
- 课程末尾生成 1~2 页小结。术语解释进入可点击提示和学习中心的本课程独立术语库，同一概念统一规范名并保留别名。

【图表选择】
- TABLE ASSET 和 FIGURE ASSET 是候选教学证据。选择直接承载定义、数据、结构、推导、比较或研究证据的资源。
- Agenda、Outline、目录、封面、章节过渡、学习路线图、徽标、背景及装饰资源不作为教学图表。
- 复杂资料图可以按不同区域或推导阶段拆页讲解；每次使用应有明确焦点，并给出与该焦点对应的阅读指引和结论。
- 同一张或近似渐进图在教学信息相同时保留信息最完整的一次。

只输出 JSON 对象本体。`

export const PAGE_CSS = `:root{--bg:#0e1226;--panel:rgba(255,255,255,.055);--line:rgba(255,255,255,.14);--ink:#e8ebf7;--mut:#a5adc9;--acc:#8b5cf6;--acc2:#6366f1;--cyan:#22d3ee;--ok:#34d399;--warn:#fbbf24;--bad:#f87171}
html,body{margin:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif;background:var(--bg);color:var(--ink);opacity:0;transition:opacity .25s}
body.ready{opacity:1}
.reveal{color:var(--ink);font-family:inherit;font-size:30px}
.reveal .slides{text-align:left}
.dsh-slide{background:radial-gradient(1100px 620px at 88% -12%,rgba(124,58,237,.28),transparent 62%),radial-gradient(900px 520px at -12% 112%,rgba(34,211,238,.16),transparent 58%),linear-gradient(160deg,#0e1226,#111633 55%,#0d1228)!important}
.reveal .slides>section.dsh-slide{box-sizing:border-box;height:100%;max-height:100%;padding:36px 0 64px;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(129,140,248,.72) rgba(255,255,255,.08);touch-action:pan-y}
.reveal .slides>section.dsh-slide::-webkit-scrollbar{width:10px}
.reveal .slides>section.dsh-slide::-webkit-scrollbar-track{background:rgba(255,255,255,.08)}
.reveal .slides>section.dsh-slide::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(129,140,248,.9),rgba(34,211,238,.78));border-radius:999px;border:2px solid rgba(14,18,38,.7)}
.dsh-slide .slide-in{box-sizing:border-box;width:100%;max-width:1060px;margin:0 auto;padding:0 12px 28px}
.dsh-cover{display:flex;align-items:center;justify-content:center;text-align:center}
.dsh-cover .slide-in{max-width:880px}
.dsh-cover h1{font-size:56px;line-height:1.22;margin:0 0 18px;font-weight:800;letter-spacing:.5px;background:linear-gradient(92deg,#c4b5fd 5%,#818cf8 45%,#67e8f9 95%);-webkit-background-clip:text;background-clip:text;color:transparent}
.dsh-cover .sub{font-size:20px;color:#c7cde8;margin-bottom:26px;line-height:1.7}
.dsh-cover .chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.dsh-cover .chip{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);padding:6px 16px;border-radius:999px;font-size:14px;color:#dfe4f8;backdrop-filter:blur(6px)}
.dsh-cover .orb{position:absolute;border-radius:50%;filter:blur(2px);pointer-events:none}
.dsh-cover .orb1{width:340px;height:340px;right:-90px;top:-80px;background:radial-gradient(circle at 30% 30%,rgba(139,92,246,.5),transparent 70%);animation:orbFloat 9s ease-in-out infinite}
.dsh-cover .orb2{width:260px;height:260px;left:-70px;bottom:-70px;background:radial-gradient(circle at 60% 60%,rgba(34,211,238,.35),transparent 70%);animation:orbFloat 11s ease-in-out infinite reverse}
@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(26px,-22px) scale(1.08)}}
.dsh-slide h2{font-size:32px;line-height:1.35;margin:0;font-weight:800;color:#fff}
.title-bar{height:4px;width:64px;border-radius:4px;margin:10px 0 22px;background:linear-gradient(90deg,var(--acc),var(--cyan))}
.dsh-cover h2{font-size:40px}
.b-text{font-size:19px;line-height:1.9;color:#dde2f6;margin:10px 0}
.b-bullets{list-style:none;padding:0;margin:8px 0}
.b-bullets li{font-size:18.5px;line-height:1.75;padding:8px 0 8px 30px;position:relative;color:#e6e9f8}
.b-bullets li::before{content:'';position:absolute;left:4px;top:18px;width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--cyan));box-shadow:0 0 10px rgba(139,92,246,.55)}
.b-formula{background:#080b1c;border:1px solid rgba(139,92,246,.4);border-left:4px solid var(--acc);border-radius:14px;padding:14px 20px;margin:12px 0;overflow-x:auto;box-shadow:0 8px 26px rgba(0,0,0,.35)}
.b-formula .katex{color:#e2e8f0;font-size:1.12em}
.b-note{color:#96a0c4;font-size:14.5px;margin-top:8px;line-height:1.6}
.b-derive{margin:10px 0}
.b-ds{display:flex;gap:14px;padding:10px 0;border-bottom:1px dashed rgba(255,255,255,.1)}
.b-ds:last-child{border-bottom:none}
.b-ds-num{width:30px;height:30px;flex:none;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;margin-top:3px;box-shadow:0 4px 12px rgba(139,92,246,.4)}
.b-ds-body{flex:1;font-size:17.5px;line-height:1.7;color:#e3e7f8}
.b-ds-latex{overflow-x:auto}
.b-ds-latex .katex{font-size:1.08em}
.b-ds-why{color:var(--mut);font-size:14px;margin-top:4px}
.b-example{background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.28);border-radius:14px;margin:10px 0;overflow:hidden}
.b-ex-p{background:rgba(251,191,36,.1);padding:12px 16px;font-weight:700;font-size:17.5px;line-height:1.65;color:#fde68a}
.b-ex-row{display:flex;gap:12px;padding:8px 16px;border-top:1px solid rgba(251,191,36,.15);align-items:flex-start}
.b-ex-row:first-of-type{border-top:none}
.b-ex-num{flex:none;color:#fbbf24;font-weight:700;font-size:13.5px;padding-top:3px;min-width:52px}
.b-ex-body{flex:1;font-size:15.5px;color:#d7dcee;line-height:1.65;white-space:pre-wrap}
.b-ex-answer{background:rgba(52,211,153,.1);border-top:1px solid rgba(52,211,153,.3);padding:10px 16px;font-weight:700;font-size:16.5px;color:#6ee7b7}
.b-ex-note{color:var(--mut);font-size:14px;padding:2px 16px 11px;line-height:1.6}
.b-note-box{background:rgba(34,211,238,.07);border:1px solid rgba(34,211,238,.22);border-left:4px solid var(--cyan);border-radius:12px;padding:14px 18px;margin:10px 0;font-size:16.5px;line-height:1.75;color:#dff4f8}
.b-note-box b{display:block;color:var(--cyan);margin-bottom:4px}
.b-table-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:rgba(129,140,248,.72) rgba(255,255,255,.08)}
.b-table{border-collapse:collapse;margin:10px 0;font-size:16.5px;min-width:300px;color:#e2e6f7}
.b-table th,.b-table td{border:1px solid var(--line);padding:8px 14px;text-align:center}
.b-table th{background:rgba(139,92,246,.18);font-weight:700;color:#e9e3ff}
.b-table-cap{color:var(--mut);font-size:14px;margin-top:4px}
.b-figure{margin:12px auto 8px;max-width:100%;text-align:center}
.b-figure-frame{display:flex;align-items:center;justify-content:center;min-height:120px;max-height:410px;padding:10px;background:rgba(255,255,255,.96);border:1px solid rgba(139,92,246,.38);border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.3)}
.b-figure img{display:block;max-width:100%;max-height:390px;width:auto;height:auto;object-fit:contain}
.b-figure figcaption{margin-top:7px;color:var(--mut);font-size:14px;line-height:1.55}
.b-figure-guide{margin:10px 0 2px;padding:12px 14px;text-align:left;background:rgba(99,102,241,.09);border:1px solid rgba(129,140,248,.3);border-radius:12px}
.b-figure-guide-title{color:#c7d2fe;font-size:15px;font-weight:800;margin-bottom:6px}
.b-figure-guide-row{display:grid;grid-template-columns:minmax(92px,auto) 1fr;gap:10px;padding:7px 0;border-bottom:1px dashed rgba(165,180,252,.18);font-size:15px;line-height:1.65}
.b-figure-guide-row:last-of-type{border-bottom:none}
.b-figure-guide-label{color:#67e8f9;font-weight:750}
.b-figure-guide-content{color:#dbe3f7}
.b-figure-takeaway{margin-top:8px;padding-top:8px;border-top:1px solid rgba(52,211,153,.25);color:#a7f3d0;font-size:15px;line-height:1.65}
.katex{font-size:1.06em;color:inherit}
.katex-display{margin:.55em 0}
.present .dsh-anim{animation:dshUp .55s cubic-bezier(.22,.61,.36,1) both}
@keyframes dshUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
.reveal .progress{color:var(--acc);height:3px}
.reveal .controls{color:var(--acc)}
.reveal .controls button:hover{color:var(--cyan)}
.reveal .slide-number{background:rgba(255,255,255,.08);color:var(--mut);font-size:12px;border-radius:8px;padding:2px 10px}
body.dsh-fallback{overflow:auto}
.dsh-stack{display:block!important}
.dsh-stack .dsh-slide{position:static!important;top:auto!important;left:auto!important;transform:none!important;height:auto;max-height:none;min-height:100vh;overflow:visible!important;display:flex;align-items:flex-start}
.dsh-stack .dsh-slide .slide-in{padding:56px 28px}
.b-intuition{background:linear-gradient(135deg,rgba(251,113,133,.14),rgba(251,191,36,.08));border:1px solid rgba(251,113,133,.4);border-left:4px solid #fb7185;border-radius:14px;padding:14px 18px;margin:10px 0;font-size:17.5px;line-height:1.85;color:#ffe4e9}
.b-intuition b{display:block;color:#fda4af;margin-bottom:4px}
.b-analogy{background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.32);border-left:4px solid var(--cyan);border-radius:14px;padding:14px 18px;margin:10px 0;font-size:17px;line-height:1.85;color:#d9f6fb}
.b-analogy b{display:block;color:#67e8f9;margin-bottom:4px}
.b-walk{margin:10px 0;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.28);border-radius:14px;padding:12px 16px}
.b-walk-t{color:#6ee7b7;font-weight:700;font-size:15.5px;margin-bottom:8px}
.b-walk-row{display:flex;gap:12px;padding:7px 0;border-bottom:1px dashed rgba(52,211,153,.16)}
.b-walk-row:last-child{border-bottom:none}
.b-walk-num{width:26px;height:26px;flex:none;border-radius:50%;background:linear-gradient(135deg,#10b981,#34d399);color:#052e1f;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:2px}
.b-walk-body{flex:1;font-size:16.5px;line-height:1.75;color:#d5f5e6}
.gloss{color:#a5b4fc;border-bottom:1px dashed rgba(165,180,252,.55);cursor:help}
.gloss:hover{color:#c7d2fe}
.gloss-pop{position:fixed;display:none;max-width:440px;background:#1a2040;border:1px solid rgba(139,92,246,.55);color:#e8ebf7;border-radius:12px;padding:10px 14px;z-index:70;box-shadow:0 10px 30px rgba(0,0,0,.55)}
.gloss-pop.show{display:block}
.gloss-pop-ambiguous{font-size:12px;color:#a5b4fc;margin-bottom:7px}
.gloss-pop-item+.gloss-pop-item{margin-top:9px;padding-top:9px;border-top:1px solid rgba(139,92,246,.35)}
.gloss-pop-explain{font-size:14px;line-height:1.6;color:#e8ebf7}
.gloss-pop-formula{margin-top:8px;padding-top:8px;border-top:1px solid rgba(139,92,246,.35)}
.gloss-pop-formula .katex{color:#e2e8f0;font-size:1.05em}
.agenda-nav{position:fixed;z-index:80;left:14px;top:14px;bottom:14px;width:284px;box-sizing:border-box;padding:18px 14px 14px;background:rgba(10,14,34,.94);border:1px solid rgba(139,92,246,.38);border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.48);backdrop-filter:blur(14px);transform:translateX(calc(-100% - 24px));transition:transform .22s ease;overflow:auto;overscroll-behavior:contain}
body.agenda-open .agenda-nav{transform:none}
.agenda-title{font-size:14px;font-weight:800;color:#f3f0ff;margin:0 42px 12px 4px;letter-spacing:.04em}
.agenda-list{display:flex;flex-direction:column;gap:8px}
.agenda-item{appearance:none;width:100%;border:1px solid transparent;border-radius:11px;padding:10px 11px;text-align:left;background:transparent;color:#cbd2eb;cursor:pointer;font:inherit;transition:background .16s,border-color .16s,color .16s}
.agenda-item:hover{background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.25);color:#fff}
.agenda-item.active{background:linear-gradient(135deg,rgba(139,92,246,.24),rgba(34,211,238,.11));border-color:rgba(129,140,248,.55);color:#fff}
.agenda-item-title{display:block;font-size:14px;font-weight:750;line-height:1.45}
.agenda-item-meta{display:block;margin-top:4px;color:#8f99be;font-size:11px;line-height:1.35}
.agenda-item-points{display:block;margin-top:5px;color:#aeb6d3;font-size:11px;line-height:1.45;white-space:normal}
.agenda-toggle{position:fixed;z-index:82;left:14px;top:18px;width:42px;height:42px;border:1px solid rgba(139,92,246,.48);border-radius:12px;background:rgba(13,18,40,.94);color:#e8ebf7;cursor:pointer;font-size:20px;line-height:1;box-shadow:0 8px 22px rgba(0,0,0,.32);transition:left .22s ease,background .16s}
body.agenda-open .agenda-toggle{left:242px;background:rgba(49,46,129,.9)}
.agenda-toggle:hover{background:rgba(79,70,229,.9)}
@media(min-width:1400px){body.agenda-open .reveal{width:calc(100% - 310px);margin-left:310px}}
@media(max-width:780px){.agenda-nav{width:min(86vw,320px)}body.agenda-open .agenda-toggle{left:min(calc(86vw - 42px),278px)}}
@media print{.agenda-nav,.agenda-toggle{display:none!important}}
`

export const RENDER_JS = `(function(){
  // 安全网：任何脚本错误都强制显示页面并给出错误条，绝不允许"白屏"
  window.addEventListener('error', function(ev){
    document.body.classList.add('ready')
    var ex = document.getElementById('dsh-render-error')
    if (!ex) {
      ex = document.createElement('div')
      ex.id = 'dsh-render-error'
      ex.style.cssText = 'position:fixed;left:16px;top:16px;z-index:9999;background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:10px;font-family:monospace;font-size:13px;max-width:90vw;white-space:pre-wrap'
      document.body.appendChild(ex)
    }
    ex.textContent = '课件渲染出错：' + ((ev && (ev.message || (ev.error && ev.error.message))) || '未知错误')
  })

  function $id(i){ return document.getElementById(i) }
  function el(tag, cls){ var e = document.createElement(tag); if (cls) e.className = cls; return e }
  function txt(p, s){ if (s == null) return; p.appendChild(document.createTextNode(String(s))) }
  function displayMath(s){
    var value = String(s || '').trim()
    if (!value) return ''
    if (value.slice(0, 2) === '$$' && value.slice(-2) === '$$') return value
    if (value.slice(0, 2) === '\\\\[' && value.slice(-2) === '\\\\]') return value
    if (value.charAt(0) === '$' && value.charAt(value.length - 1) === '$') return '$$' + value.slice(1, -1).trim() + '$$'
    if (value.slice(0, 2) === '\\\\(' && value.slice(-2) === '\\\\)') return '$$' + value.slice(2, -2).trim() + '$$'
    if (value.indexOf('$') >= 0 || value.indexOf('\\\\[') >= 0 || value.indexOf('\\\\(') >= 0) return value
    return '$$' + value + '$$'
  }
  function mathOptions(){
    return { delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\\\[', right: '\\\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\\\(', right: '\\\\)', display: false }
    ], throwOnError: false }
  }

  var dataEl = $id('course-data')
  var raw = ((dataEl && dataEl.textContent) || '').trim()
  var course
  if (raw.charCodeAt(0) === 123) { course = JSON.parse(raw) }
  else { var bin = atob(raw); var bytes = Uint8Array.from(bin, function(c){ return c.charCodeAt(0) }); course = JSON.parse(new TextDecoder().decode(bytes)) }

  var deck = $id('deck')
  var slides = course.slides || []
  var assets = course.assets && typeof course.assets === 'object' ? course.assets : {}
  var ANIM = 'dsh-anim'

  function block(b, inner, bi) {
    var wrap = el('div', ANIM)
    wrap.style.animationDelay = (bi * 70) + 'ms'
    if (b.type === 'text') {
      var p = el('div', 'b-text'); txt(p, b.content || ''); wrap.appendChild(p); inner.appendChild(wrap)
    } else if (b.type === 'bullets') {
      var ul = el('ul', 'b-bullets'); ;(b.items || []).forEach(function(it){ var li = el('li'); txt(li, it); ul.appendChild(li) }); wrap.appendChild(ul); inner.appendChild(wrap)
    } else if (b.type === 'formula') {
      var f = el('div', 'b-formula'); txt(f, displayMath(b.latex)); wrap.appendChild(f)
      if (b.note) { var n = el('div', 'b-note'); txt(n, b.note); wrap.appendChild(n) }
      inner.appendChild(wrap)
    } else if (b.type === 'derivation') {
      var d = el('div', 'b-derive')
      ;(b.steps || []).forEach(function(st, si){ var row = el('div', 'b-ds'); var num = el('div', 'b-ds-num'); txt(num, String(si + 1)); row.appendChild(num); var bd = el('div', 'b-ds-body'); if (st.latex) { var math = el('div', 'b-ds-latex'); txt(math, displayMath(st.latex)); bd.appendChild(math) } else { txt(bd, st.text || '') } if (st.why) { var why = el('div', 'b-ds-why'); txt(why, st.why); bd.appendChild(why) } row.appendChild(bd); d.appendChild(row) })
      wrap.appendChild(d); inner.appendChild(wrap)
    } else if (b.type === 'example') {
      var ex = el('div', 'b-example')
      var ep = el('div', 'b-ex-p'); txt(ep, b.problem || ''); ex.appendChild(ep)
      ;(b.steps || []).forEach(function(st, si){ var row = el('div', 'b-ex-row'); var num = el('div', 'b-ex-num'); txt(num, '第 ' + (si + 1) + ' 步'); row.appendChild(num); var body = el('div', 'b-ex-body'); txt(body, st); row.appendChild(body); ex.appendChild(row) })
      if (b.answer) { var an = el('div', 'b-ex-answer'); txt(an, '答案：' + b.answer); ex.appendChild(an) }
      if (b.note) { var nt = el('div', 'b-ex-note'); txt(nt, '启示：' + b.note); ex.appendChild(nt) }
      wrap.appendChild(ex); inner.appendChild(wrap)
    } else if (b.type === 'table') {
      var tbl = el('table', 'b-table')
      if (b.headers) { var thead = el('thead'); var tr = el('tr'); b.headers.forEach(function(h){ var th = el('th'); txt(th, h); tr.appendChild(th) }); thead.appendChild(tr); tbl.appendChild(thead) }
      var tbody = el('tbody')
      ;(b.rows || []).forEach(function(r){ var tr2 = el('tr'); r.forEach(function(c){ var td = el('td'); txt(td, c); tr2.appendChild(td) }); tbody.appendChild(tr2) })
      tbl.appendChild(tbody)
      var tableScroll = el('div', 'b-table-scroll'); tableScroll.appendChild(tbl); wrap.appendChild(tableScroll)
      if (b.caption) { var cap = el('div', 'b-table-cap'); txt(cap, b.caption); wrap.appendChild(cap) }
      inner.appendChild(wrap)
    } else if (b.type === 'figure') {
      var asset = assets[b.assetId]
      var dataUrl = asset && String(asset.dataUrl || '')
      if (dataUrl.indexOf('data:image/') === 0 && /;base64,/i.test(dataUrl)) {
        var fig = el('figure', 'b-figure')
        var frame = el('div', 'b-figure-frame')
        var img = el('img')
        img.src = dataUrl
        img.alt = b.alt || asset.alt || b.caption || asset.caption || '资料原图'
        frame.appendChild(img); fig.appendChild(frame)
        var caption = b.caption || asset.caption || ''
        if (caption) { var fc = el('figcaption'); txt(fc, caption); fig.appendChild(fc) }
        var guide = Array.isArray(b.guide) ? b.guide : []
        if (guide.length || b.takeaway) {
          var guideBox = el('div', 'b-figure-guide')
          var guideTitle = el('div', 'b-figure-guide-title'); txt(guideTitle, '怎么看这张图'); guideBox.appendChild(guideTitle)
          guide.forEach(function(item){
            var row = el('div', 'b-figure-guide-row')
            var label = el('div', 'b-figure-guide-label'); txt(label, item && item.label || '图中部分'); row.appendChild(label)
            var content = el('div', 'b-figure-guide-content'); txt(content, item && item.content || ''); row.appendChild(content)
            guideBox.appendChild(row)
          })
          if (b.takeaway) { var takeaway = el('div', 'b-figure-takeaway'); txt(takeaway, '图中结论：' + b.takeaway); guideBox.appendChild(takeaway) }
          fig.appendChild(guideBox)
        }
        wrap.appendChild(fig); inner.appendChild(wrap)
      }
    } else if (b.type === 'intuition') {
      var ib = el('div', 'b-intuition')
      var t1 = el('b'); txt(t1, '直觉'); ib.appendChild(t1)
      txt(ib, b.content || ''); wrap.appendChild(ib); inner.appendChild(wrap)
    } else if (b.type === 'analogy') {
      var ab = el('div', 'b-analogy')
      var t2 = el('b'); txt(t2, '🎯 打个比方'); ab.appendChild(t2)
      txt(ab, b.content || ''); wrap.appendChild(ab); inner.appendChild(wrap)
    } else if (b.type === 'walkthrough') {
      var wb = el('div', 'b-walk')
      if (b.title) { var wt = el('div', 'b-walk-t'); txt(wt, '🔢 ' + b.title); wb.appendChild(wt) }
      ;(b.steps || []).forEach(function(st, si){ var wr = el('div', 'b-walk-row'); var wn = el('div', 'b-walk-num'); txt(wn, String(si + 1)); wr.appendChild(wn); var wc = el('div', 'b-walk-body'); txt(wc, st.text || ''); wr.appendChild(wc); wb.appendChild(wr) })
      wrap.appendChild(wb); inner.appendChild(wrap)
    } else if (b.type === 'note') {
      var nb = el('div', 'b-note-box'); if (b.title) { var t = el('b'); txt(t, b.title); nb.appendChild(t) } txt(nb, b.content || ''); wrap.appendChild(nb); inner.appendChild(wrap)
    }
  }

  slides.forEach(function(s, i){
    var sec = el('section', 'dsh-slide'); sec.dataset.index = String(i)
    var inner = el('div', 'slide-in')
    if (s.kind === 'cover') {
      sec.classList.add('dsh-cover')
      var o1 = el('div', 'orb orb1'); sec.appendChild(o1)
      var o2 = el('div', 'orb orb2'); sec.appendChild(o2)
      var h1 = el('h1'); h1.className = ANIM; txt(h1, course.title || ''); inner.appendChild(h1)
      if (course.subtitle) { var sub = el('div', 'sub'); sub.className = ANIM; sub.style.animationDelay = '120ms'; txt(sub, course.subtitle); inner.appendChild(sub) }
      var chips = el('div', 'chips'); chips.className = ANIM; chips.style.animationDelay = '240ms'
      function chip(t){ var b = el('span', 'chip'); txt(b, t); chips.appendChild(b) }
      if (course.subject) chip('学科：' + course.subject)
      if (course.difficulty) chip(course.difficulty)
      if (course.estimateMinutes) chip('预计 ' + course.estimateMinutes + ' 分钟')
      if (course.subject || course.difficulty || course.estimateMinutes) inner.appendChild(chips)
    } else {
      var head = el('div', ANIM)
      var h2 = el('h2'); txt(h2, s.title || ''); head.appendChild(h2)
      var bar = el('div', 'title-bar'); head.appendChild(bar)
      inner.appendChild(head)
      ;(s.blocks || []).forEach(function(b, bi){ block(b, inner, bi + 1) })
    }
    sec.appendChild(inner); deck.appendChild(sec)
  })

  // ── 语义目录：按课程 agenda 跳转，不把每一页都塞进侧栏 ──
  var setAgendaActive = function(){}
  ;(function buildAgenda(){
    var outline = Array.isArray(course.outline) ? course.outline.filter(function(item){ return item && item.heading }) : []
    if (!outline.length) return
    var contentIndexes = []
    slides.forEach(function(slide, index){
      if (index < 2 || slide.kind === 'cover' || slide.title === '小结' || slide.title === '资料来源') return
      contentIndexes.push(index)
    })
    var firstIndexes = outline.map(function(_, agendaIndex){
      for (var i = 0; i < slides.length; i++) if (Number(slides[i].agendaIndex) === agendaIndex) return i
      if (!contentIndexes.length) return Math.min(slides.length - 1, agendaIndex + 1)
      return contentIndexes[Math.min(contentIndexes.length - 1, Math.floor(agendaIndex * contentIndexes.length / outline.length))]
    })
    var lastIndexes = firstIndexes.map(function(first, index){
      return index + 1 < firstIndexes.length ? Math.max(first, firstIndexes[index + 1] - 1) : (contentIndexes.length ? contentIndexes[contentIndexes.length - 1] : first)
    })
    var nav = el('aside', 'agenda-nav')
    nav.setAttribute('aria-label', '课程目录')
    var title = el('div', 'agenda-title'); txt(title, '课程目录'); nav.appendChild(title)
    var list = el('div', 'agenda-list'); nav.appendChild(list)
    var buttons = []
    outline.forEach(function(item, agendaIndex){
      var button = el('button', 'agenda-item')
      button.type = 'button'
      button.setAttribute('data-agenda-index', String(agendaIndex))
      var itemTitle = el('span', 'agenda-item-title'); txt(itemTitle, (agendaIndex + 1) + '. ' + item.heading); button.appendChild(itemTitle)
      var pageMeta = el('span', 'agenda-item-meta')
      var firstPage = firstIndexes[agendaIndex] + 1
      var lastPage = lastIndexes[agendaIndex] + 1
      txt(pageMeta, firstPage === lastPage ? '第 ' + firstPage + ' 页' : '第 ' + firstPage + '-' + lastPage + ' 页')
      button.appendChild(pageMeta)
      var points = Array.isArray(item.keyPoints) ? item.keyPoints.filter(Boolean).slice(0, 3) : []
      if (points.length) { var detail = el('span', 'agenda-item-points'); txt(detail, points.join(' · ')); button.appendChild(detail) }
      button.addEventListener('click', function(){
        var target = firstIndexes[agendaIndex]
        if (window.Reveal && window.Reveal.slide) window.Reveal.slide(target, 0, 0)
        else if (deck.children[target]) deck.children[target].scrollIntoView({ behavior: 'smooth', block: 'start' })
        if (window.innerWidth < 1400) setOpen(false)
      })
      buttons.push(button); list.appendChild(button)
    })
    var toggle = el('button', 'agenda-toggle')
    toggle.type = 'button'; toggle.setAttribute('aria-label', '打开或关闭课程目录'); toggle.setAttribute('aria-expanded', 'false'); txt(toggle, '☰')
    function setOpen(open){
      document.body.classList.toggle('agenda-open', open)
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggle.textContent = open ? '×' : '☰'
      if (window.Reveal && window.Reveal.layout) setTimeout(function(){ window.Reveal.layout() }, 240)
    }
    toggle.addEventListener('click', function(){ setOpen(!document.body.classList.contains('agenda-open')) })
    document.body.appendChild(nav); document.body.appendChild(toggle)
    setOpen(window.innerWidth >= 1400)
    setAgendaActive = function(slideIndex){
      var slide = slides[slideIndex] || {}
      var agendaIndex = Number.isInteger(Number(slide.agendaIndex)) ? Number(slide.agendaIndex) : -1
      if (agendaIndex < 0) {
        for (var i = firstIndexes.length - 1; i >= 0; i--) if (slideIndex >= firstIndexes[i] && slideIndex <= lastIndexes[i]) { agendaIndex = i; break }
      }
      buttons.forEach(function(button, index){ button.classList.toggle('active', index === agendaIndex) })
      if (agendaIndex >= 0 && buttons[agendaIndex]) buttons[agendaIndex].scrollIntoView({ block: 'nearest' })
    }
  })()

  // ── 术语高亮弹窗；完整术语表统一放在学习中心 ──
  var glossary = Array.isArray(course.glossary) ? course.glossary.filter(function(g){ return g && g.term && g.explain }) : []
  function glossLabel(g) {
    var aliases = []
    if (g.english && g.english !== g.term) aliases.push(g.english)
    if (g.abbr && g.abbr !== g.term && aliases.indexOf(g.abbr) < 0) aliases.push(g.abbr)
    return String(g.term || '') + (aliases.length ? '（' + aliases.join('/') + '）' : '')
  }
  if (glossary.length) { try {
    var aliasSet = new Set()
    glossary.forEach(function(g){
      ;[g.term, g.english, g.abbr].concat(Array.isArray(g.aliases) ? g.aliases : []).forEach(function(alias){ alias = String(alias || '').trim(); if (alias.length >= 2) aliasSet.add(alias) })
    })
    var terms = Array.from(aliasSet).sort(function(a, b){ return b.length - a.length })
    var escRe = function(s) {
      // 纯字符码实现：源码里不出现反斜杠，避免模板字符串转义吃掉一层
      var out = ''
      for (var ci = 0; ci < s.length; ci++) {
        var ch = s.charAt(ci)
        var cc = ch.charCodeAt(0)
        if (cc === 92 || (cc >= 36 && cc <= 46) || cc === 94 || cc === 91 || cc === 93 || cc === 123 || cc === 124 || cc === 125) out += String.fromCharCode(92)
        out += ch
      }
      return out
    }
    if (!terms.length) throw new Error('没有可标注的术语别名')
    var re = new RegExp('(' + terms.map(escRe).join('|') + ')', 'gi')
    var infoByTerm = new Map()
    var glossKey = function(alias){ return String(alias || '').trim().toLocaleLowerCase() }
    glossary.forEach(function(g){
      var seenAliases = new Set()
      ;[g.term, g.english, g.abbr].concat(Array.isArray(g.aliases) ? g.aliases : []).forEach(function(alias){
        alias = String(alias || '').trim()
        var key = glossKey(alias)
        if (alias.length < 2 || seenAliases.has(key)) return
        seenAliases.add(key)
        var items = infoByTerm.get(key) || []
        items.push({ label: glossLabel(g), explain: g.explain, formula: g.formula || '' })
        infoByTerm.set(key, items)
      })
    })
    var pop = el('div', 'gloss-pop'); document.body.appendChild(pop)
    function showPop(t) {
      var key = t.getAttribute('data-term') || t.textContent || ''
      var infos = infoByTerm.get(glossKey(key)) || []
      pop.setAttribute('data-term', key)
      pop.innerHTML = ''
      if (infos.length > 1) {
        var ambiguity = el('div', 'gloss-pop-ambiguous'); txt(ambiguity, '“' + key + '”在本术语库中有 ' + infos.length + ' 个含义：'); pop.appendChild(ambiguity)
      }
      infos.forEach(function(info){
        var item = el('div', 'gloss-pop-item')
        var e = el('div', 'gloss-pop-explain'); txt(e, info.label + '：' + info.explain); item.appendChild(e)
        if (info.formula) {
          var f = el('div', 'gloss-pop-formula'); txt(f, displayMath(info.formula)); item.appendChild(f)
        }
        pop.appendChild(item)
      })
      pop.classList.add('show')
      if (window.renderMathInElement) {
        try { window.renderMathInElement(pop, mathOptions()) } catch (e) {}
      }
      var r = t.getBoundingClientRect()
      var pw = pop.offsetWidth
      var ph = pop.offsetHeight
      var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2))
      var top = r.top - ph - 10
      if (top < 8) top = r.bottom + 10
      pop.style.left = left + 'px'
      pop.style.top = top + 'px'
    }
    function walkText(node) {
      var parent = node.parentNode
      if (!parent || !parent.closest) return
      if (parent.closest('.katex') || parent.closest('.b-formula') || parent.closest('.b-ds-latex') || parent.closest('.gloss') || parent.closest('script') || parent.closest('style')) return
      var text = node.nodeValue
      if (!text || text.length < 2 || text.indexOf('$') >= 0) return
      var frag = document.createDocumentFragment()
      var last = 0
      var matched = false
      var m
      re.lastIndex = 0
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue }
        matched = true
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
        var sp = el('span', 'gloss')
        sp.setAttribute('data-term', m[1])
        txt(sp, m[1])
        frag.appendChild(sp)
        last = m.index + m[1].length
      }
      if (!matched) return
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
      parent.replaceChild(frag, node)
    }
    var slideInList = deck.querySelectorAll('.slide-in')
    for (var si2 = 0; si2 < slideInList.length; si2++) {
      var walker = document.createTreeWalker(slideInList[si2], NodeFilter.SHOW_TEXT, null)
      var list = []
      while (walker.nextNode()) list.push(walker.currentNode)
      for (var wi = 0; wi < list.length; wi++) walkText(list[wi])
    }
    var hideTimer = null
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
    })
    document.addEventListener('click', function(ev){
      var t = ev.target
      if (t && t.classList && t.classList.contains('gloss')) {
        ev.stopPropagation()
        if (pop.classList.contains('show') && pop.getAttribute('data-term') === (t.getAttribute('data-term') || '')) {
          pop.classList.remove('show')
        } else {
          showPop(t)
        }
      } else if (pop.classList.contains('show')) {
        pop.classList.remove('show')
      }
    })
  } catch (annErr) { /* 术语注释失败不影响课件显示，错误由全局错误条报告 */ }
  }

  function renderMath(){
    if (window.renderMathInElement) {
      try { window.renderMathInElement(document.body, mathOptions()) } catch(e) {}
    }
  }

  function fallback(){
    document.body.classList.add('dsh-fallback')
    var s = document.querySelector('.slides'); if (s) s.classList.add('dsh-stack')
    document.body.classList.add('ready')
  }

  function boot(){
    renderMath()
    if (window.Reveal) {
      try {
        window.Reveal.initialize({
          hash: true, controls: true, progress: true, slideNumber: 'c/t', center: false,
          transition: 'slide', transitionSpeed: 'default', backgroundTransition: 'fade',
          width: 1280, height: 800, margin: 0.05, minScale: 0.35, maxScale: 1.4,
          overview: true, touch: true, keyboard: true, hideAddressBar: false
        })
        document.body.classList.add('ready')
        function refreshScrollState(slide){
          if (!slide) return
          slide.classList.toggle('dsh-scrollable', slide.scrollHeight > slide.clientHeight + 4)
        }
        window.Reveal.on('ready', function(event){
          setTimeout(renderMath, 80)
          refreshScrollState(event && event.currentSlide || document.querySelector('.slides > section.present'))
          setAgendaActive(event && event.indexh || 0)
        })
        window.Reveal.on('slidechanged', function(event){
          if (event && event.currentSlide) event.currentSlide.scrollTop = 0
          refreshScrollState(event && event.currentSlide)
          setAgendaActive(event && event.indexh || 0)
          setTimeout(function(){ refreshScrollState(event && event.currentSlide) }, 100)
        })
        window.addEventListener('resize', function(){
          refreshScrollState(document.querySelector('.slides > section.present'))
        })
      } catch (e) { fallback() }
    } else { fallback() }
  }

  if (document.readyState === 'complete') { boot() }
  else { window.addEventListener('load', function(){ setTimeout(boot, 40) }) }
})()
`

export const PY = `import sys, json, os, io, zlib, zipfile, base64, contextlib
import xml.etree.ElementTree as ET

NL = chr(10)
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
X = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def pptx(path):
    z = zipfile.ZipFile(path)
    parts = []
    names = [n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')]
    def key(n):
        d = ''
        for c in n:
            if c.isdigit():
                d += c
        return int(d or '0')
    names.sort(key=key)
    for slide_no, n in enumerate(names, 1):
        root = ET.fromstring(z.read(n))
        texts = []
        for t in root.iter(A + 't'):
            if t.text:
                texts.append(t.text)
        if texts:
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
                            parts.extend(notes)
    return NL.join(parts) if parts else '(no slide text found)'

def docx(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    parts = []
    for p in root.iter(W + 'p'):
        line = ''.join((t.text or '') for t in p.iter(W + 't'))
        if line.strip():
            parts.append(line)
    return NL.join(parts) if parts else '(no paragraph text found)'

def xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        r = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in r.iter(X + 'si'):
            shared.append(''.join((t.text or '') for t in si.iter(X + 't')))
    parts = []
    for n in sorted(z.namelist()):
        if n.startswith('xl/worksheets/sheet') and n.endswith('.xml'):
            parts.append('=== SHEET %s ===' % os.path.basename(n))
            r = ET.fromstring(z.read(n))
            for c in r.iter(X + 'c'):
                v = c.find(X + 'v')
                if v is not None and v.text is not None:
                    val = v.text
                    if c.get('t') == 's':
                        try:
                            val = shared[int(val)]
                        except Exception:
                            pass
                    if val:
                        parts.append('%s: %s' % (c.get('r') or '?', val))
                isel = c.find(X + 'is')
                if isel is not None:
                    s = ''.join((t.text or '') for t in isel.iter(X + 't'))
                    if s:
                        parts.append('%s: %s' % (c.get('r') or '?', s))
    return NL.join(parts) if parts else '(no cell text found)'

def ipynb(path):
    data = json.load(open(path, encoding='utf-8'))
    parts = []
    for cell_no, c in enumerate(data.get('cells', []), 1):
        src = c.get('source', [])
        if isinstance(src, list):
            src = ''.join(src)
        if c.get('cell_type') == 'code':
            parts.append('=== CODE CELL %d ===' % cell_no + NL + src)
        else:
            parts.append('=== MARKDOWN CELL %d ===' % cell_no + NL + src)
    return NL + NL.join(parts)

def compact(value, limit=500):
    value = str(value or '').replace(chr(0), ' ').replace(chr(10), ' ').replace(chr(13), ' ')
    return ' '.join(value.split())[:limit]

def nearby_caption(page, bbox, kind):
    try:
        box = tuple(float(v) for v in bbox)
        candidates = []
        for block in page.get_text('blocks'):
            text = compact(block[4], 320)
            if not text:
                continue
            lower = text.lower()
            if kind == 'table':
                named = lower.startswith('table ') or lower.startswith('table:') or text.startswith('表')
            else:
                named = lower.startswith('figure ') or lower.startswith('fig.') or lower.startswith('fig ') or text.startswith('图')
            if not named:
                continue
            overlap = min(box[2], float(block[2])) - max(box[0], float(block[0]))
            gap = float(block[1]) - box[3]
            if overlap > 0 and -4 <= gap <= 140:
                candidates.append((abs(gap), text))
        if candidates:
            candidates.sort(key=lambda item: item[0])
            return candidates[0][1]
    except Exception:
        pass
    return ''

def table_record(table, page, page_no, table_no, source_id):
    try:
        raw_rows = table.extract() or []
        rows = []
        for raw_row in raw_rows[:41]:
            if not isinstance(raw_row, (list, tuple)):
                continue
            row = [compact(cell, 320) for cell in list(raw_row)[:12]]
            if any(row):
                rows.append(row)
        if len(rows) < 2:
            return None
        width = max(len(row) for row in rows)
        if width < 2:
            return None
        rows = [row + [''] * (width - len(row)) for row in rows]
        header = getattr(table, 'header', None)
        names = [compact(cell, 320) for cell in list(getattr(header, 'names', []) or [])[:width]]
        if len(names) == width and any(names):
            headers = names
            body = rows[1:] if rows and rows[0] == headers else rows
        else:
            headers = rows[0]
            body = rows[1:]
        if not body or sum(1 for row in body for cell in row if cell) < 2:
            return None
        asset_id = '%s-P%d-T%d' % (source_id, page_no, table_no)
        bbox = [round(float(v), 2) for v in table.bbox]
        return {
            'id': asset_id,
            'page': page_no,
            'headers': headers,
            'rows': body,
            'caption': nearby_caption(page, bbox, 'table'),
            'bbox': bbox,
        }
    except Exception:
        return None

def table_marker(record):
    lines = ['--- TABLE ASSET id=%s page=%d ---' % (record['id'], record['page'])]
    if record.get('caption'):
        lines.append('caption: ' + record['caption'])
    def cells(values):
        return '| ' + ' | '.join(compact(value, 320).replace('|', '/') for value in values) + ' |'
    if record.get('headers'):
        lines.append(cells(record['headers']))
        lines.append('| ' + ' | '.join(['---'] * len(record['headers'])) + ' |')
    for row in record.get('rows', []):
        lines.append(cells(row))
    lines.append('--- END TABLE ASSET ---')
    return NL.join(lines)

def visual_hash_for_xref(doc, xref):
    """16x16 灰度感知哈希；用于合并连续渐进动画中的近似重复大图。"""
    try:
        import pymupdf
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha > 1:
            pix = pymupdf.Pixmap(pymupdf.csGRAY, pix)
        samples = pix.samples
        stride = int(pix.stride)
        width = int(pix.width)
        height = int(pix.height)
        if width < 2 or height < 2 or not samples:
            return ''
        values = []
        for gy in range(16):
            for gx in range(16):
                cell = []
                for sy in range(4):
                    y = min(height - 1, int((gy + (sy + 0.5) / 4.0) * height / 16.0))
                    for sx in range(4):
                        x = min(width - 1, int((gx + (sx + 0.5) / 4.0) * width / 16.0))
                        cell.append(samples[y * stride + x])
                values.append(sum(cell) / float(len(cell)))
        mean = sum(values) / float(len(values))
        bits = 0
        for index, value in enumerate(values):
            if value < mean:
                bits |= (1 << index)
        return ('%064x' % bits)
    except Exception:
        return ''

def pdf(path, source_id='S1'):
    data = open(path, 'rb').read()
    texts = []
    tables = []
    assets = []
    try:
        import pymupdf
        doc = pymupdf.open(stream=data, filetype='pdf')
        image_infos = []
        xref_pages = {}
        for page_no, p in enumerate(doc, 1):
            try:
                infos = p.get_image_info(xrefs=True)
            except Exception:
                infos = []
            image_infos.append(infos)
            for info in infos:
                xref = int(info.get('xref') or 0)
                if xref > 0:
                    xref_pages.setdefault(xref, set()).add(page_no)
        total_image_bytes = 0
        for page_no, p in enumerate(doc, 1):
            t = (p.get_text() or '').strip()
            page_parts = ['=== PAGE %d ===' % page_no]
            if t:
                page_parts.append(t)
            page_tables = []
            try:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    found = p.find_tables()
                for table_no, table in enumerate(list(found.tables or [])[:8], 1):
                    record = table_record(table, p, page_no, table_no, source_id)
                    if record:
                        tables.append(record)
                        page_tables.append(record)
                        page_parts.append(table_marker(record))
            except Exception:
                pass
            table_boxes = [tuple(record['bbox']) for record in page_tables]
            figure_no = 0
            seen_page_xrefs = set()
            for info in image_infos[page_no - 1]:
                # 长课件不能让前 24 张图耗尽配额后把后半讲的公式图、函数图全部丢掉。
                # 最终 HTML 只嵌入模型实际引用的资源，这里的较高上限主要用于完整候选池。
                if len(assets) >= 96 or total_image_bytes >= 32 * 1024 * 1024:
                    break
                xref = int(info.get('xref') or 0)
                if xref <= 0 or xref in seen_page_xrefs:
                    continue
                seen_page_xrefs.add(xref)
                bbox = tuple(float(v) for v in (info.get('bbox') or (0, 0, 0, 0)))
                box_w = max(0.0, bbox[2] - bbox[0])
                box_h = max(0.0, bbox[3] - bbox[1])
                page_area = max(1.0, float(p.rect.width) * float(p.rect.height))
                coverage = box_w * box_h / page_area
                px_w = int(info.get('width') or 0)
                px_h = int(info.get('height') or 0)
                if px_w < 180 or px_h < 100 or coverage < 0.025 or coverage > 0.72:
                    continue
                aspect = box_w / max(1.0, box_h)
                if aspect < 0.14 or aspect > 7.0:
                    continue
                if len(xref_pages.get(xref, ())) >= max(3, int(len(doc) * 0.35)) and coverage < 0.20:
                    continue
                inside_table = False
                for table_box in table_boxes:
                    ix = max(0.0, min(bbox[2], table_box[2]) - max(bbox[0], table_box[0]))
                    iy = max(0.0, min(bbox[3], table_box[3]) - max(bbox[1], table_box[1]))
                    if ix * iy >= box_w * box_h * 0.55:
                        inside_table = True
                        break
                if inside_table:
                    continue
                try:
                    extracted = doc.extract_image(xref) or {}
                    image = extracted.get('image') or b''
                    ext = str(extracted.get('ext') or '').lower()
                    if ext == 'jpg':
                        ext = 'jpeg'
                    if ext not in ('png', 'jpeg', 'webp', 'gif'):
                        pix = pymupdf.Pixmap(doc, xref)
                        if pix.n - pix.alpha > 3:
                            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                        image = pix.tobytes('png')
                        ext = 'png'
                    if len(image) < 4096 or len(image) > 5 * 1024 * 1024 or total_image_bytes + len(image) > 32 * 1024 * 1024:
                        continue
                except Exception:
                    continue
                figure_no += 1
                asset_id = '%s-P%d-F%d' % (source_id, page_no, figure_no)
                caption = nearby_caption(p, bbox, 'figure')
                visual_hash = visual_hash_for_xref(doc, xref)
                assets.append({
                    'id': asset_id,
                    'page': page_no,
                    'mime': 'image/' + ext,
                    'dataUrl': 'data:image/' + ext + ';base64,' + base64.b64encode(image).decode('ascii'),
                    'caption': caption,
                    # 文本模型无法直接看见位图时，较完整的同页文字仍可帮助它忠实讲图；
                    # 支持视觉的模型会同时收到图片本身。
                    'context': compact(t, 2400),
                    'alt': caption or ('第 %d 页资料原图' % page_no),
                    'width': px_w,
                    'height': px_h,
                    'bbox': [round(v, 2) for v in bbox],
                    'visualHash': visual_hash,
                })
                total_image_bytes += len(image)
                page_parts.append('--- FIGURE ASSET id=%s page=%d size=%dx%d ---' % (asset_id, page_no, px_w, px_h))
                if caption:
                    page_parts.append('caption: ' + caption)
                page_parts.append('--- END FIGURE ASSET ---')
            if len(page_parts) > 1:
                texts.append(NL.join(page_parts))
        if texts:
            return {'text': NL + (NL + NL).join(texts), 'tables': tables, 'assets': assets}
    except Exception:
        pass
    try:
        import pypdf
        r = pypdf.PdfReader(io.BytesIO(data))
        for page_no, p in enumerate(r.pages, 1):
            t = (p.extract_text() or '').strip()
            if t:
                texts.append('=== PAGE %d ===' % page_no + NL + t)
        if texts:
            return {'text': NL + NL.join(texts), 'tables': [], 'assets': []}
    except Exception:
        pass
    return {'text': '(no extractable text; this PDF is likely image-based)', 'tables': [], 'assets': []}

def codefile(path):
    return open(path, encoding='utf-8', errors='replace').read()

def main():
    task = json.load(sys.stdin)
    action = task.get('action')
    if action == 'extract':
        f = task.get('file', '')
        source_id = str(task.get('sourceId') or 'S1')
        e = os.path.splitext(f)[1].lower()
        try:
            if e == '.pptx':
                out = pptx(f)
            elif e == '.docx':
                out = docx(f)
            elif e == '.xlsx':
                out = xlsx(f)
            elif e == '.pdf':
                out = pdf(f, source_id)
            elif e == '.ipynb':
                out = ipynb(f)
            else:
                out = codefile(f)
            if isinstance(out, dict):
                payload = {'ok': True, 'text': out.get('text', ''), 'tables': out.get('tables', []), 'assets': out.get('assets', [])}
            else:
                payload = {'ok': True, 'text': out, 'tables': [], 'assets': []}
            sys.stdout.write(json.dumps(payload))
        except Exception as ex:
            sys.stdout.write(json.dumps({'ok': False, 'error': repr(ex)}))
    elif action == 'zip':
        try:
            m = task.get('manifest', {})
            out = m.get('out', '')
            parts = m.get('parts', {})
            z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
            for name, content in parts.items():
                z.writestr(name, content)
            z.close()
            sys.stdout.write(json.dumps({'ok': True, 'out': out}))
        except Exception as ex:
            sys.stdout.write(json.dumps({'ok': False, 'error': repr(ex)}))
    else:
        sys.stdout.write(json.dumps({'ok': False, 'error': 'unknown action'}))

if __name__ == '__main__':
    main()
`
