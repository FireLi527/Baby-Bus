// PPTX 生成：结构化块 → 带配色卡片的 OOXML
import { stripLatex, xmlEsc } from './util.js'
import { stepText } from './parse.js'

export function pptxParts(course, title) {
  const slides = []
  for (const s of (course.slides || [])) {
    if (s.kind === 'cover') {
      slides.push({ kind: 'cover', title: course.title || title, subtitle: course.subtitle || '', meta: [course.subject, course.difficulty, course.estimateMinutes ? ('预计 ' + course.estimateMinutes + ' 分钟') : ''].filter(Boolean) })
      continue
    }
    const blocks = []
    for (const b of (s.blocks || [])) {
      if (b.type === 'text') blocks.push({ type: 'text', lines: [stripLatex(b.content)] })
      else if (b.type === 'bullets') blocks.push({ type: 'bullets', lines: (b.items || []).map(stripLatex) })
      else if (b.type === 'formula') blocks.push({ type: 'formula', lines: [stripLatex(b.latex)].concat(b.note ? ['说明：' + stripLatex(b.note)] : []) })
      else if (b.type === 'derivation') blocks.push({ type: 'derivation', lines: (b.steps || []).map(st => stripLatex(stepText(st))) })
      else if (b.type === 'table') blocks.push({ type: 'table', lines: [(b.headers || []).join(' | ')].concat((b.rows || []).map(r => r.join(' | '))).concat(b.caption ? [stripLatex(b.caption)] : []) })
      else if (b.type === 'example') blocks.push({ type: 'example', lines: ['题目：' + stripLatex(b.problem)].concat((b.steps || []).map((st, i) => '第' + (i + 1) + '步：' + stripLatex(stepText(st)))).concat(b.answer ? ['答案：' + stripLatex(b.answer)] : []).concat(b.note ? ['启示：' + stripLatex(b.note)] : []) })
      else if (b.type === 'note') blocks.push({ type: 'note', lines: [(b.title ? (b.title + '：') : '') + stripLatex(b.content)] })
      else if (b.type === 'intuition') blocks.push({ type: 'intuition', lines: [stripLatex(b.content)] })
      else if (b.type === 'analogy') blocks.push({ type: 'analogy', lines: [stripLatex(b.content)] })
      else if (b.type === 'walkthrough') blocks.push({ type: 'walkthrough', lines: (b.title ? ['【' + stripLatex(b.title) + '】'] : []).concat((b.steps || []).map(st => stripLatex(stepText(st)))) })
    }
    slides.push({ kind: 'content', title: s.title || '', blocks })
  }
  return slides
}

export function buildPptxXml(slides, title) {
  const parts = {}
  const W = 12192000, H = 6858000, PT = 12700
  let shapeId = 100
  function gradFill(c1, c2) { return `<a:gradFill rotWithShape='1'><a:gsLst><a:gs pos='0'><a:srgbClr val='${c1}'/></a:gs><a:gs pos='100000'><a:srgbClr val='${c2}'/></a:gs></a:gsLst><a:lin ang='5400000' scaled='1'/></a:gradFill>` }
  function solidFill(hex, alpha) { return alpha == null ? `<a:solidFill><a:srgbClr val='${hex}'/></a:solidFill>` : `<a:solidFill><a:srgbClr val='${hex}'><a:alpha val='${alpha}'/></a:srgbClr></a:solidFill>` }
  function shp(x, y, cx, cy, fillXml, opt) {
    opt = opt || {}
    const geom = opt.ellipse ? `<a:prstGeom prst='ellipse'><a:avLst/></a:prstGeom>` : (opt.round ? `<a:prstGeom prst='roundRect'><a:avLst><a:gd name='adj' fmla='val ${opt.round}'/></a:avLst></a:prstGeom>` : `<a:prstGeom prst='rect'><a:avLst/></a:prstGeom>`)
    const ln = opt.line ? `<a:ln w='12700'><a:solidFill><a:srgbClr val='${opt.line}'/></a:solidFill></a:ln>` : `<a:ln><a:noFill/></a:ln>`
    return `<p:sp><p:nvSpPr><p:cNvPr id='${shapeId++}' name='shp'/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x='${x}' y='${y}'/><a:ext cx='${cx}' cy='${cy}'/></a:xfrm>${geom}${fillXml}${ln}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang='zh-CN'/></a:p></p:txBody></p:sp>`
  }
  function runXml(r, opt) {
    const font = r.font || opt.font || ''
    const fontXml = font ? `<a:latin typeface='${font}'/><a:ea typeface='${font}'/>` : ''
    return `<a:r><a:rPr lang='zh-CN' dirty='0' sz='${r.sz || opt.sz || 1600}' b='${r.b ? 1 : 0}'>${fontXml}<a:solidFill><a:srgbClr val='${r.color || opt.color || '1F2937'}'/></a:solidFill></a:rPr><a:t>${xmlEsc(r.t)}</a:t></a:r>`
  }
  function para(t, opt) {
    opt = opt || {}
    if (typeof t === 'string') t = [{ t }]
    const bu = opt.bu
    const marL = bu ? 228600 : 0
    const buXml = bu ? `<a:buFont typeface='Arial'/><a:buChar char='${bu}'/>` : `<a:buNone/>`
    const buClr = bu && opt.buColor ? `<a:buClr><a:srgbClr val='${opt.buColor}'/></a:buClr>` : ''
    let runsXml = ''
    for (const r of t) runsXml += runXml(r, { sz: opt.sz, color: opt.color, font: opt.font })
    return `<a:p><a:pPr marL='${marL}' indent='${bu ? -228600 : 0}' algn='${opt.align || 'l'}'><a:lnSpc><a:spcPct val='${opt.spc || 115000}'/></a:lnSpc>${buXml}${buClr}</a:pPr>${runsXml}</a:p>`
  }
  function txBox(x, y, cx, cy, ps, opt) {
    opt = opt || {}
    return `<p:sp><p:nvSpPr><p:cNvPr id='${shapeId++}' name='tx'/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x='${x}' y='${y}'/><a:ext cx='${cx}' cy='${cy}'/></a:xfrm><a:prstGeom prst='rect'><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr anchor='${opt.anchor || 't'}' wrap='square' lIns='91440' tIns='45720' rIns='91440' bIns='45720'/><a:lstStyle/>${ps}</p:txBody></p:sp>`
  }
  function chunkLine(s, n) { const r = []; let cur = ''; for (const ch of String(s || '')) { cur += ch; if (cur.length >= n && (ch === '。' || ch === '；' || ch === '，' || ch === ' ')) { r.push(cur); cur = '' } } if (cur.trim()) r.push(cur); return r }

  const LINE_H = 24000
  const FILL = { formula: 'EEF2FF', example: 'FFF7ED', note: 'EFF6FF', derivation: 'F8FAFC', table: 'F8FAFC', intuition: 'FDF2F8', analogy: 'ECFEFF', walkthrough: 'ECFDF5' }
  const LINE = { formula: 'C7D2FE', example: 'FDE68A', note: 'BFDBFE', derivation: 'E2E8F0', table: 'E5E7EB', intuition: 'FBCFE8', analogy: 'A5F3FC', walkthrough: 'A7F3D0' }
  function estHeight(blk) { return 600000 + (blk.lines || []).length * LINE_H }
  function blockBox(x, y, w, blk) {
    const type = blk.type
    let lines = blk.lines || []
    if (type === 'text' || type === 'bullets' || type === 'example' || type === 'note' || type === 'intuition' || type === 'analogy') {
      const out = []
      for (const L of lines) for (const c of chunkLine(L, 46)) out.push(c)
      lines = out
    }
    if (!lines.length) return { xml: '', h: 0 }
    const h = 600000 + lines.length * LINE_H
    let ps = ''
    for (const L of lines) {
      if (type === 'text') ps += para([{ t: L }], { sz: 1700, color: '273043', spc: 112000 })
      else if (type === 'bullets') ps += para([{ t: L }], { bu: '•', buColor: '7C3AED', sz: 1700, spc: 108000 })
      else if (type === 'formula') ps += L.indexOf('说明') === 0 ? para([{ t: L }], { sz: 1200, color: '64748B' }) : para([{ t: L }], { sz: 1500, color: '1E293B', font: 'Consolas' })
      else if (type === 'derivation') ps += para([{ t: String.fromCharCode(9312 + Math.min(lines.indexOf(L), 9)) + ' ', b: true, color: '7C3AED' }, { t: L }], { sz: 1500, color: '334155' })
      else if (type === 'table') ps += para([{ t: L }], { sz: 1400, color: '334155', font: 'Consolas' })
      else if (type === 'example') {
        if (L.indexOf('答案') === 0) ps += para([{ t: L, b: true }], { sz: 1500, color: '166534' })
        else if (L.indexOf('题目') === 0) ps += para([{ t: L, b: true }], { sz: 1600, color: '92400E' })
        else if (L.indexOf('启示') === 0) ps += para([{ t: L }], { sz: 1300, color: '9CA3AF' })
        else ps += para([{ t: L }], { sz: 1400, color: '78350F' })
      } else if (type === 'note') ps += para([{ t: '💡 ' + L }], { sz: 1500, color: '1E40AF' })
      else if (type === 'intuition') ps += para([{ t: '💡 ' + L }], { sz: 1500, color: '9D174D' })
      else if (type === 'analogy') ps += para([{ t: '🎯 ' + L }], { sz: 1500, color: '0E7490' })
      else if (type === 'walkthrough') ps += para([{ t: String.fromCharCode(9312 + Math.min(lines.indexOf(L), 9)) + ' ', b: true, color: '059669' }, { t: L }], { sz: 1500, color: '065F46' })
    }
    let xml = ''
    if (FILL[type]) {
      xml += shp(x, y, w, h, solidFill(FILL[type]), { round: 12000, line: LINE[type] })
      xml += txBox(x + 280000, y + 130000, w - 560000, h - 260000, ps, { anchor: 'ctr' })
    } else {
      xml += txBox(x + 60000, y + 60000, w - 120000, h - 120000, ps, {})
    }
    return { xml, h: h + 140000 }
  }
  function slideShell(shapesXml, bg) {
    const bgXml = bg ? `<p:bg><p:bgPr>${bg.grad ? gradFill(bg.grad[0], bg.grad[1]) : solidFill(bg.hex)}<a:effectLst/></p:bgPr></p:bg>` : ''
    return `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<p:sld xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main'>\n<p:cSld>${bgXml}<p:spTree><p:nvGrpSpPr><p:cNvPr id='1' name=''/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x='0' y='0'/><a:ext cx='0' cy='0'/><a:chOff x='0' y='0'/><a:chExt cx='0' cy='0'/></a:xfrm></p:grpSpPr>${shapesXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  }
  function coverSlide(t) {
    let xml = shp(-900000, -700000, 3600000, 3600000, solidFill('FFFFFF', 10000), { ellipse: true })
    xml += shp(W - 2200000, H - 2600000, 3400000, 3400000, solidFill('FFFFFF', 8000), { ellipse: true })
    xml += txBox(960000, 1950000, W - 1920000, 2200000, para([{ t: t.title, b: true }], { sz: 4000, color: 'FFFFFF', align: 'ctr' }), {})
    if (t.subtitle) xml += txBox(960000, 4250000, W - 1920000, 1300000, para([{ t: t.subtitle }], { sz: 1800, color: 'E9D5FF', align: 'ctr', spc: 120000 }), {})
    if (t.meta && t.meta.length) xml += txBox(960000, 5650000, W - 1920000, 600000, para([{ t: t.meta.join('  ·  ') }], { sz: 1300, color: 'C4B5FD', align: 'ctr' }), {})
    return xml
  }
  function contentSlide(t, title) {
    let xml = shp(0, 0, W, 420000, gradFill('4F46E5', '7C3AED'))
    xml += shp(0, 420000, 140000, H - 420000, solidFill('7C3AED'))
    xml += txBox(620000, 560000, W - 1240000, 1000000, para([{ t: t.title, b: true }], { sz: 2600, color: '1F2937' }), {})
    xml += txBox(620000, H - 560000, W - 2400000, 420000, para([{ t: (title || '') + ' · 宝宝巴士' }], { sz: 1000, color: '9CA3AF' }), {})
    return { xml, y: 1750000 }
  }

  const rendered = []
  for (const sl of slides) {
    if (sl.kind === 'cover') { rendered.push(slideShell(coverSlide(sl), { grad: ['4F46E5', '7C3AED'] })); continue }
    let pending = sl.blocks
    let part = 0
    while (pending.length) {
      const t = part === 0 ? (sl.title || '') : (sl.title || '') + '（续）'
      let cur = contentSlide({ title: t }, title)
      const keep = []
      let y = cur.y
      for (const blk of pending) {
        const est = estHeight(blk)
        if (keep.length && y + est > H - 950000) break
        keep.push(blk)
        y += est
      }
      y = cur.y
      for (const blk of keep) {
        const bx = blockBox(620000, y, W - 1240000, blk)
        cur.xml += bx.xml
        y += bx.h
      }
      pending = pending.slice(keep.length)
      part++
      rendered.push(slideShell(cur.xml, null))
    }
  }
  const n = rendered.length

  let overrides = ''
  for (let i = 1; i <= n; i++) overrides += `<Override PartName='/ppt/slides/slide${i}.xml' ContentType='application/vnd.openxmlformats-officedocument.presentationml.slide+xml'/>`
  parts['[Content_Types].xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>\n<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>\n<Default Extension='xml' ContentType='application/xml'/>\n<Override PartName='/ppt/presentation.xml' ContentType='application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'/>\n<Override PartName='/ppt/slideMasters/slideMaster1.xml' ContentType='application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'/>\n<Override PartName='/ppt/slideLayouts/slideLayout1.xml' ContentType='application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'/>\n<Override PartName='/ppt/theme/theme1.xml' ContentType='application/vnd.openxmlformats-officedocument.theme+xml'/>\n${overrides}\n<Override PartName='/docProps/core.xml' ContentType='application/vnd.openxmlformats-package.core-properties+xml'/>\n<Override PartName='/docProps/app.xml' ContentType='application/vnd.openxmlformats-officedocument.extended-properties+xml'/>\n</Types>`
  parts['_rels/.rels'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='ppt/presentation.xml'/>\n<Relationship Id='rId2' Type='http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties' Target='docProps/core.xml'/>\n<Relationship Id='rId3' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties' Target='docProps/app.xml'/>\n</Relationships>`
  let sldIds = ''
  for (let i = 1; i <= n; i++) sldIds += `<p:sldId id='${255 + i}' r:id='rId${i + 1}'/>`
  parts['ppt/presentation.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<p:presentation xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main'>\n<p:sldMasterIdLst><p:sldMasterId id='2147483648' r:id='rId1'/></p:sldMasterIdLst>\n<p:sldIdLst>${sldIds}</p:sldIdLst>\n<p:sldSz cx='12192000' cy='6858000'/>\n<p:notesSz cx='6858000' cy='9144000'/>\n</p:presentation>`
  let presRels = `<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster' Target='slideMasters/slideMaster1.xml'/>`
  for (let i = 1; i <= n; i++) presRels += `<Relationship Id='rId${i + 1}' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide' Target='slides/slide${i}.xml'/>`
  parts['ppt/_rels/presentation.xml.rels'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>${presRels}</Relationships>`
  parts['ppt/slideMasters/slideMaster1.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<p:sldMaster xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main'>\n<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id='1' name=''/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x='0' y='0'/><a:ext cx='0' cy='0'/><a:chOff x='0' y='0'/><a:chExt cx='0' cy='0'/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n<p:clrMap bg1='lt1' tx1='dk1' bg2='lt2' tx2='dk2' accent1='accent1' accent2='accent2' accent3='accent3' accent4='accent4' accent5='accent5' accent6='accent6' hlink='hlink' folHlink='folHlink'/>\n<p:sldLayoutIdLst><p:sldLayoutId id='2147483649' r:id='rId1'/></p:sldLayoutIdLst>\n</p:sldMaster>`
  parts['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout' Target='../slideLayouts/slideLayout1.xml'/>\n<Relationship Id='rId2' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme' Target='../theme/theme1.xml'/>\n</Relationships>`
  parts['ppt/slideLayouts/slideLayout1.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<p:sldLayout xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main' type='blank'>\n<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id='1' name=''/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x='0' y='0'/><a:ext cx='0' cy='0'/><a:chOff x='0' y='0'/><a:chExt cx='0' cy='0'/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>\n<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n</p:sldLayout>`
  parts['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster' Target='../slideMasters/slideMaster1.xml'/>\n</Relationships>`
  parts['ppt/theme/theme1.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<a:theme xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' name='DSH Theme'>\n<a:themeElements>\n<a:clrScheme name='DSH'><a:dk1><a:srgbClr val='1F2937'/></a:dk1><a:lt1><a:srgbClr val='FFFFFF'/></a:lt1><a:dk2><a:srgbClr val='4F46E5'/></a:dk2><a:lt2><a:srgbClr val='EEF2FF'/></a:lt2><a:accent1><a:srgbClr val='4F46E5'/></a:accent1><a:accent2><a:srgbClr val='7C3AED'/></a:accent2><a:accent3><a:srgbClr val='0EA5E9'/></a:accent3><a:accent4><a:srgbClr val='16A34A'/></a:accent4><a:accent5><a:srgbClr val='D97706'/></a:accent5><a:accent6><a:srgbClr val='DC2626'/></a:accent6><a:hlink><a:srgbClr val='2563EB'/></a:hlink><a:folHlink><a:srgbClr val='7C3AED'/></a:folHlink></a:clrScheme>\n<a:fontScheme name='DSH'><a:majorFont><a:latin typeface='Arial'/><a:ea typeface='Microsoft YaHei'/><a:cs typeface='Arial'/></a:majorFont><a:minorFont><a:latin typeface='Arial'/><a:ea typeface='Microsoft YaHei'/><a:cs typeface='Arial'/></a:minorFont></a:fontScheme>\n<a:fmtScheme name='DSH'><a:fillStyleLst><a:solidFill><a:schemeClr val='phClr'/></a:solidFill><a:solidFill><a:schemeClr val='phClr'/></a:solidFill><a:solidFill><a:schemeClr val='phClr'/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w='9525'><a:solidFill><a:schemeClr val='phClr'/></a:solidFill></a:ln><a:ln w='9525'><a:solidFill><a:schemeClr val='phClr'/></a:solidFill></a:ln><a:ln w='9525'><a:solidFill><a:schemeClr val='phClr'/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val='phClr'/></a:solidFill><a:solidFill><a:schemeClr val='phClr'/></a:solidFill><a:solidFill><a:schemeClr val='phClr'/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>\n</a:themeElements>\n</a:theme>`
  for (let i = 1; i <= n; i++) {
    parts[`ppt/slides/slide${i}.xml`] = rendered[i - 1]
    parts[`ppt/slides/_rels/slide${i}.xml.rels`] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout' Target='../slideLayouts/slideLayout1.xml'/>\n</Relationships>`
  }
  parts['docProps/core.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<cp:coreProperties xmlns:cp='http://schemas.openxmlformats.org/package/2006/metadata/core-properties' xmlns:dc='http://purl.org/dc/elements/1.1/' xmlns:dcterms='http://purl.org/dc/terms/' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'>\n<dc:title>${xmlEsc(title)}</dc:title><dc:creator>宝宝巴士</dc:creator></cp:coreProperties>`
  parts['docProps/app.xml'] = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Properties xmlns='http://schemas.openxmlformats.org/officeDocument/2006/extended-properties' xmlns:vt='http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'>\n<Application>宝宝巴士</Application><Slides>${n}</Slides></Properties>`
  return parts
}
