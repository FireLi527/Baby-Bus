// 资料识别、字符预算与结构化页锚点。保持为无 I/O 的纯函数，便于独立测试。

/** 识别论文/学术文献；模型声明优先，声明缺失时再使用正文结构特征。 */
export function detectLiteratureMaterial(outline, sources = []) {
  const declared = String(outline && outline.materialType || '').trim()
  if (/论文|文献|学术|research\s*paper|academic\s*(?:paper|article)|journal\s*article/i.test(declared)) return true
  if (/教材|课件|讲义|技术文档|说明书|手册|其他/.test(declared)) return false
  return (sources || []).some(source => {
    const text = String(source && (source.modelText || source.text) || '')
    const name = String(source && source.name || '')
    let signals = 0
    if (/\.(?:pdf|tex)$/i.test(name)) signals++
    if (/^\s*(?:abstract|摘要)\s*[:：]?\s*$/im.test(text)) signals++
    if (/^\s*(?:introduction|引言|绪论)\s*[:：]?\s*$/im.test(text)) signals++
    if (/^\s*(?:conclusions?|结论)\s*[:：]?\s*$/im.test(text)) signals++
    if (/^\s*(?:references|bibliography|works cited|参考文献)\s*[:：]?\s*$/im.test(text)) signals++
    if (/\bdoi\s*:|https?:\/\/doi\.org\/|\b(?:received|accepted)\s+\d/i.test(text)) signals++
    return signals >= 3
  })
}

/** 论文正文在参考文献标题处结束；目录中的早期标题不会被误当成正文结尾。 */
export function stripPaperReferenceTail(value) {
  const text = String(value || '')
  const marker = /^\s*(?:#{1,6}\s*)?(?:references|bibliography|works cited|参考文献)\s*[:：]?\s*$/gim
  const matches = [...text.matchAll(marker)]
  if (!matches.length) return text
  for (const match of matches) {
    const index = match.index || 0
    const tail = text.slice(index + match[0].length)
    const lateEnough = index >= 300 || index >= text.length * 0.35
    const referenceSignals = [
      (tail.match(/\b(?:19|20)\d{2}\b/g) || []).length,
      (tail.match(/\bdoi\s*:|https?:\/\/doi\.org\//gi) || []).length * 2,
      (tail.match(/^\s*(?:\[?\d+\]?|[A-Z][\p{L}'-]+,).*$/gimu) || []).length,
    ].reduce((sum, count) => sum + count, 0)
    if (lateEnough && referenceSignals >= 2) return text.slice(0, index).trimEnd()
  }
  return text
}

/**
 * 公平分配字符预算：短资料先完整保留，剩余预算在长资料间均分。
 * 这样合并课件时不会因为第一份资料很长而把后面的资料全部挤掉。
 */
export function allocateSourceCharBudget(lengths, total) {
  const caps = (lengths || []).map(value => Math.max(0, Number(value) || 0))
  const budget = Math.max(0, Math.floor(Number(total) || 0))
  const allocated = caps.map(() => 0)
  let remaining = budget
  let active = caps.map((_, index) => index).filter(index => caps[index] > 0)
  while (active.length && remaining > 0) {
    const share = Math.floor(remaining / active.length)
    if (share <= 0) {
      for (let i = 0; i < active.length && remaining > 0; i++, remaining--) allocated[active[i]]++
      break
    }
    const short = active.filter(index => caps[index] <= share)
    if (!short.length) {
      for (const index of active) {
        const take = Math.min(caps[index], share)
        allocated[index] = take
        remaining -= take
      }
      for (const index of active) {
        if (remaining <= 0) break
        if (allocated[index] < caps[index]) { allocated[index]++; remaining-- }
      }
      break
    }
    for (const index of short) {
      allocated[index] = caps[index]
      remaining -= caps[index]
    }
    const done = new Set(short)
    active = active.filter(index => !done.has(index))
  }
  return allocated
}

const STRUCTURED_SOURCE_MARKER = /^=== (SLIDE|PAGE|SHEET|CODE CELL|MARKDOWN CELL)\s+(.+?) ===\s*$/gm

/** 把 PDF/PPTX 等提取文本拆成带稳定锚点的原始页单元。 */
export function splitStructuredSource(value) {
  const text = String(value || '')
  const matches = [...text.matchAll(STRUCTURED_SOURCE_MARKER)]
  if (!matches.length) return []
  return matches.map((match, index) => {
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length
    const marker = match[0].trim()
    const body = text.slice(start + match[0].length, end).trim()
    const numberMatch = /\d+/.exec(match[2])
    return {
      kind: match[1].toUpperCase(),
      label: String(match[2] || '').trim(),
      number: numberMatch ? Number(numberMatch[0]) : null,
      marker,
      body,
      text: marker + (body ? '\n' + body : ''),
    }
  })
}

function compactUnitBody(value, budget) {
  const text = String(value || '')
  if (text.length <= budget) return text
  if (budget <= 0) return ''
  const separator = '\n[…本页中段按预算压缩…]\n'
  const important = text.split(/\r?\n/).filter(line =>
    /(?:[=≈≠≤≥∑∏σℒ𝐿𝑃]|\b(?:loss|likelihood|probability|objective|gradient|deriv|argmin|argmax|softmax|sigmoid|cross.?entropy|公式|推导|损失|似然|概率|梯度)\b)/i.test(line)
  ).join('\n')
  const importantBudget = Math.min(Math.floor(budget * 0.45), important.length)
  const edgeBudget = Math.max(0, budget - importantBudget - separator.length * (importantBudget ? 2 : 1))
  const headSize = Math.ceil(edgeBudget * 0.6)
  const tailSize = Math.max(0, edgeBudget - headSize)
  const parts = [text.slice(0, headSize)]
  if (importantBudget) parts.push(important.slice(0, importantBudget))
  if (tailSize) parts.push(text.slice(-tailSize))
  return parts.join(separator).slice(0, budget)
}

/** 在有限预算内保留整份资料的首、中、尾；结构化资料还会保留每个页锚点及公式/推导线索。 */
export function condenseSourceText(value, maxChars) {
  const text = String(value || '')
  const budget = Math.max(0, Math.floor(Number(maxChars) || 0))
  if (text.length <= budget) return text
  if (budget <= 0) return ''

  const units = splitStructuredSource(text)
  if (units.length > 1) {
    const markerCost = units.reduce((sum, unit) => sum + unit.marker.length + 1, 0) + Math.max(0, units.length - 1)
    if (markerCost < budget) {
      const bodyBudgets = allocateSourceCharBudget(units.map(unit => unit.body.length), budget - markerCost)
      return units.map((unit, index) => unit.marker + (bodyBudgets[index] ? '\n' + compactUnitBody(unit.body, bodyBudgets[index]) : '')).join('\n\n').slice(0, budget)
    }
  }

  const windowCount = Math.min(10, Math.max(2, Math.ceil(text.length / Math.max(1, budget))))
  const separator = '\n\n[…中间内容已按均匀窗口采样…]\n\n'
  const available = Math.max(1, budget - separator.length * (windowCount - 1))
  const windowSize = Math.max(1, Math.floor(available / windowCount))
  const maxStart = Math.max(0, text.length - windowSize)
  const samples = []
  for (let index = 0; index < windowCount; index++) {
    const start = windowCount === 1 ? 0 : Math.round(maxStart * index / (windowCount - 1))
    samples.push(text.slice(start, start + windowSize))
  }
  return samples.join(separator).slice(0, budget)
}

export function normalizeSourceRanges(value, sourceIds) {
  const allowed = sourceIds instanceof Set ? sourceIds : new Set(sourceIds || [])
  return (Array.isArray(value) ? value : []).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const source = String(raw.source || raw.sourceId || '').toUpperCase()
    const from = Math.max(1, Math.floor(Number(raw.from)))
    const to = Math.max(from, Math.floor(Number(raw.to)))
    const kind = String(raw.kind || '').toUpperCase().trim()
    if (!source || (allowed.size && !allowed.has(source)) || !Number.isFinite(from) || !Number.isFinite(to)) return []
    return [{ source, from, to, kind: /^(?:SLIDE|PAGE|SHEET|CODE CELL|MARKDOWN CELL)$/.test(kind) ? kind : '' }]
  })
}

/** 按大纲返回的原页区间取证，避免用字符等分把公式和所属章节错开。 */
export function sourceTextForRanges(value, ranges, sourceId = 'S1') {
  const normalizedId = String(sourceId || '').toUpperCase()
  const selectedRanges = normalizeSourceRanges(ranges, new Set([normalizedId])).filter(range => range.source === normalizedId)
  if (!selectedRanges.length) return ''
  const units = splitStructuredSource(value)
  return units.filter(unit => unit.number != null && selectedRanges.some(range =>
    (!range.kind || range.kind === unit.kind) && unit.number >= range.from && unit.number <= range.to
  )).map(unit => unit.text).join('\n\n')
}

function unitIsAgenda(unit) {
  return /(?:^|\n)\s*(?:Agenda|目录|课程提纲)\s*(?:\n|$)/i.test(String(unit && unit.body || ''))
}

function sourceAnchor(sourceId, unit) {
  return String(sourceId || '').toUpperCase() + ':' + unit.kind + ' ' + unit.label
}

export function normalizeSourceAnchor(value) {
  const match = /^\s*(S\d+)\s*:\s*(SLIDE|PAGE|SHEET|CODE CELL|MARKDOWN CELL)\s+(.+?)\s*$/i.exec(String(value || ''))
  return match ? match[1].toUpperCase() + ':' + match[2].toUpperCase() + ' ' + match[3].trim() : ''
}

export function sourceAnchorsForSelected(sources) {
  const anchors = []
  for (const source of (sources || [])) {
    for (const unit of splitStructuredSource(source.sectionText)) {
      if (!unit.body || unitIsAgenda(unit)) continue
      anchors.push(sourceAnchor(source.id, unit))
    }
  }
  return [...new Set(anchors)]
}

export function inferSequentialSourceRanges(source, sectionCount) {
  const units = splitStructuredSource(source && source.modelText)
  if (!units.length || sectionCount <= 0 || units.some(unit => unit.number == null)) return []
  const agendaIndexes = units.map((unit, index) => unitIsAgenda(unit) ? index : -1).filter(index => index >= 0)
  let groups = []
  if (agendaIndexes.length) {
    groups = agendaIndexes.map((agendaIndex, index) => {
      const start = agendaIndex + 1
      const end = index + 1 < agendaIndexes.length ? agendaIndexes[index + 1] - 1 : units.length - 1
      return units.slice(start, end + 1).filter(unit => !unitIsAgenda(unit))
    }).filter(group => group.length)
  }
  if (!groups.length || groups.length < sectionCount) groups = units.filter(unit => !unitIsAgenda(unit)).map(unit => [unit])
  return Array.from({ length: sectionCount }, (_, index) => {
    const startIndex = Math.floor(index * groups.length / sectionCount)
    const endIndex = Math.max(startIndex, Math.floor((index + 1) * groups.length / sectionCount) - 1)
    const assigned = groups.slice(startIndex, endIndex + 1).flat()
    if (!assigned.length) return []
    const first = assigned[0]
    const last = assigned[assigned.length - 1]
    return [{ source: source.id, kind: first.kind === last.kind ? first.kind : '', from: first.number, to: last.number }]
  })
}

export function ensureSectionRangeCoverage(sections, sources) {
  for (const source of (sources || [])) {
    const units = splitStructuredSource(source.modelText)
    if (!units.length) continue
    const firstAgenda = units.findIndex(unit => unitIsAgenda(unit))
    const contentUnits = units.filter((unit, index) => unit.number != null && !unitIsAgenda(unit) && (firstAgenda < 0 || index > firstAgenda))
    const sectionIndexes = sections.map((section, index) => section.sourceRefs.includes(source.id) ? index : -1).filter(index => index >= 0)
    if (!contentUnits.length || !sectionIndexes.length) continue
    if (sectionIndexes.every(index => !sections[index].sourceRanges.some(range => range.source === source.id))) {
      const inferred = inferSequentialSourceRanges(source, sectionIndexes.length)
      sectionIndexes.forEach((sectionIndex, index) => { sections[sectionIndex].sourceRanges.push(...(inferred[index] || [])) })
    }
    const covered = unit => sections.some(section => section.sourceRanges.some(range => range.source === source.id && (!range.kind || range.kind === unit.kind) && unit.number >= range.from && unit.number <= range.to))
    for (let unitIndex = 0; unitIndex < contentUnits.length; unitIndex++) {
      const unit = contentUnits[unitIndex]
      if (covered(unit)) continue
      let bestIndex = sectionIndexes[Math.min(sectionIndexes.length - 1, Math.floor(unitIndex * sectionIndexes.length / contentUnits.length))]
      let bestDistance = Infinity
      for (const sectionIndex of sectionIndexes) {
        for (const range of sections[sectionIndex].sourceRanges.filter(item => item.source === source.id)) {
          const distance = unit.number < range.from ? range.from - unit.number : (unit.number > range.to ? unit.number - range.to : 0)
          if (distance < bestDistance) { bestDistance = distance; bestIndex = sectionIndex }
        }
      }
      sections[bestIndex].sourceRanges.push({ source: source.id, kind: unit.kind, from: unit.number, to: unit.number })
    }
  }
}

export function capSourceTexts(sources, total, field) {
  const budgets = allocateSourceCharBudget(sources.map(source => source.text.length), total)
  return sources.map((source, index) => {
    const condensed = condenseSourceText(source.text, budgets[index])
    return { ...source, [field]: condensed, [field + 'Chars']: condensed.length }
  })
}

export function sourcePacket(sources, field = 'modelText') {
  return sources.map(source => {
    const text = String(source[field] || '')
    const truncated = text.length < source.text.length ? `\n\n[${source.id} 已按页/均匀窗口压缩为 ${text.length} / ${source.text.length} 字]` : ''
    return `【${source.id}｜${source.name}】\n${text}${truncated}`
  }).join('\n\n')
}
