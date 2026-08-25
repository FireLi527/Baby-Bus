// 稳健 JSON 解析：逐个扫描平衡括号候选 + 尾逗号兜底。
// 模型偶尔会在最终 JSON 前输出“分析 [第1步]”，不能只尝试第一个括号。
function balancedAt(s, start, open, close) {
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return { text: s.slice(start, i + 1), end: i }
    }
  }
  return null
}

function parseBalanced(raw, open, close, accept) {
  const source = String(raw || '').trim()
  let cursor = 0
  while (cursor < source.length) {
    const start = source.indexOf(open, cursor)
    if (start < 0) return null
    const candidate = balancedAt(source, start, open, close)
    if (!candidate) { cursor = start + 1; continue }
    const variants = [candidate.text, candidate.text.replace(/,\s*([}\]])/g, '$1')]
    for (const text of variants) {
      try {
        const value = JSON.parse(text)
        if (accept(value)) return value
      } catch (e) {}
    }
    cursor = candidate.end + 1
  }
  return null
}

export function parseCourse(raw) {
  return parseBalanced(raw, '{', '}', value => value !== null && typeof value === 'object' && !Array.isArray(value))
}

export function parseCourseArray(raw) {
  return parseBalanced(raw, '[', ']', Array.isArray)
}

function textValue(value) { return typeof value === 'string' ? value.trim() : '' }

function lineCount(value, width = 52) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return Math.max(1, Math.ceil(text.length / width))
}

function stepText(step) {
  if (typeof step === 'string') return step
  if (!step || typeof step !== 'object') return ''
  return [step.text, step.latex, step.why].filter(Boolean).join(' ')
}

function figureGuideText(item) {
  if (!item || typeof item !== 'object') return ''
  return [item.label, item.content].filter(Boolean).join(' ')
}

export function estimateBlockHeight(block) {
  if (!block || typeof block !== 'object') return 0
  if (['text', 'intuition', 'analogy', 'note'].includes(block.type)) return 46 + lineCount(block.content) * 30 + (block.title ? 24 : 0)
  if (block.type === 'bullets') return 16 + (block.items || []).reduce((sum, item) => sum + 34 + (lineCount(item) - 1) * 28, 0)
  if (block.type === 'formula') return 92 + lineCount(block.latex, 70) * 22 + (block.note ? lineCount(block.note) * 24 : 0)
  if (block.type === 'table') {
    const rows = Array.isArray(block.rows) ? block.rows : []
    const rowHeight = row => 34 + (Math.max(1, ...row.map(cell => lineCount(cell, 28))) - 1) * 22
    return 42 + rows.reduce((sum, row) => sum + rowHeight(row), 0) + (block.caption ? lineCount(block.caption) * 24 : 0)
  }
  if (block.type === 'figure') {
    const guideHeight = (block.guide || []).reduce((sum, item) => sum + 34 + (lineCount(figureGuideText(item), 44) - 1) * 24, 0)
    return 390 + guideHeight + (block.caption ? lineCount(block.caption) * 24 : 0) + (block.takeaway ? 34 + lineCount(block.takeaway, 44) * 24 : 0)
  }
  if (block.type === 'derivation') return 16 + (block.steps || []).reduce((sum, step) => sum + 50 + (lineCount(stepText(step)) - 1) * 26, 0)
  if (block.type === 'walkthrough') return 42 + (block.steps || []).reduce((sum, step) => sum + 48 + (lineCount(stepText(step)) - 1) * 26, 0)
  if (block.type === 'example') return 70 + lineCount(block.problem) * 26 + (block.steps || []).reduce((sum, step) => sum + 44 + (lineCount(stepText(step)) - 1) * 24, 0) + (block.answer ? 38 + lineCount(block.answer) * 22 : 0) + (block.note ? lineCount(block.note) * 24 : 0)
  return 80
}

function chunkItems(items, baseHeight, itemHeight, budget) {
  const chunks = []
  let current = []
  let height = baseHeight
  for (const item of items || []) {
    const cost = itemHeight(item)
    if (current.length && height + cost > budget) { chunks.push(current); current = []; height = baseHeight }
    current.push(item); height += cost
  }
  if (current.length) chunks.push(current)
  return chunks
}

function splitLargeBlock(block, budget) {
  if (estimateBlockHeight(block) <= budget) return [block]
  if (block.type === 'bullets') {
    return chunkItems(block.items, 16, item => 34 + (lineCount(item) - 1) * 28, budget).map(items => ({ ...block, items }))
  }
  if (block.type === 'table') {
    const rowHeight = row => 34 + (Math.max(1, ...row.map(cell => lineCount(cell, 28))) - 1) * 22
    const chunks = chunkItems(block.rows, 66, rowHeight, budget)
    return chunks.map((rows, index) => ({ ...block, rows, caption: index === chunks.length - 1 ? block.caption : '' }))
  }
  if (block.type === 'derivation' || block.type === 'walkthrough') {
    const base = block.type === 'walkthrough' ? 42 : 16
    const chunks = chunkItems(block.steps, base, step => 50 + (lineCount(stepText(step)) - 1) * 26, budget)
    return chunks.map((steps, index) => ({ ...block, title: index === 0 ? block.title : (block.title ? block.title + '（续）' : ''), steps }))
  }
  if (block.type === 'example') {
    const base = 70 + lineCount(block.problem) * 26
    const chunks = chunkItems(block.steps, base, step => 44 + (lineCount(stepText(step)) - 1) * 24, budget)
    return chunks.map((steps, index) => ({ ...block, steps, answer: index === chunks.length - 1 ? block.answer : '', note: index === chunks.length - 1 ? block.note : '' }))
  }
  return [block]
}

function splitBlockTail(block, tailNeeded, headNeeded, tailLimit) {
  const property = block.type === 'bullets' ? 'items' : block.type === 'table' ? 'rows' : ['derivation', 'walkthrough'].includes(block.type) ? 'steps' : ''
  const values = property && Array.isArray(block[property]) ? block[property] : []
  if (values.length < 2) return null
  for (let count = 1; count < values.length; count++) {
    const head = { ...block, [property]: values.slice(0, -count) }
    const tail = { ...block, [property]: values.slice(-count) }
    if (block.type === 'table') { head.caption = ''; tail.caption = block.caption }
    if (['derivation', 'walkthrough'].includes(block.type) && block.title) tail.title = block.title + '（续）'
    const headHeight = estimateBlockHeight(head)
    const tailHeight = estimateBlockHeight(tail)
    if (headHeight >= headNeeded && tailHeight >= tailNeeded && tailHeight <= tailLimit) return [head, tail]
  }
  return null
}

function rebalanceSparsePages(pages, budget, minimum = 300) {
  for (let index = 1; index < pages.length; index++) {
    const current = pages[index]
    const previous = pages[index - 1]
    const currentHeight = current.reduce((sum, block) => sum + estimateBlockHeight(block), 0)
    if (currentHeight >= minimum || previous.length === 0) continue
    const previousOtherHeight = previous.slice(0, -1).reduce((sum, block) => sum + estimateBlockHeight(block), 0)
    const split = splitBlockTail(previous[previous.length - 1], minimum - currentHeight, Math.max(80, minimum - previousOtherHeight), budget - currentHeight)
    if (!split) continue
    previous[previous.length - 1] = split[0]
    current.unshift(split[1])
  }
  return pages
}

function needsDeterministicPagination(slide) {
  const blocks = slide.blocks || []
  const maxTableRows = Math.max(0, ...blocks.filter(block => block.type === 'table').map(block => (block.rows || []).length))
  const maxBulletItems = Math.max(0, ...blocks.filter(block => block.type === 'bullets').map(block => (block.items || []).length))
  const maxWalkSteps = Math.max(0, ...blocks.filter(block => block.type === 'walkthrough').map(block => (block.steps || []).length))
  const maxStructuredSteps = Math.max(0, ...blocks.filter(block => ['walkthrough', 'derivation', 'example'].includes(block.type)).map(block => (block.steps || []).length))
  return blocks.length > 4 || maxTableRows > 12 || maxBulletItems > 10 || maxStructuredSteps > 7 || (blocks.length >= 3 && maxTableRows >= 8) || (maxBulletItems >= 6 && maxWalkSteps >= 4)
}

function continuationBase(title) {
  return String(title || '').replace(/(?:（续）)+$/, '')
}

function coalesceSparseContinuations(slides, softLimit = 780) {
  const result = []
  for (const slide of slides) {
    const previous = result[result.length - 1]
    const currentHeight = (slide && slide.blocks || []).reduce((sum, block) => sum + estimateBlockHeight(block), 0)
    const previousHeight = (previous && previous.blocks || []).reduce((sum, block) => sum + estimateBlockHeight(block), 0)
    const sameAgenda = !previous || previous.agendaIndex == null || slide.agendaIndex == null || previous.agendaIndex === slide.agendaIndex
    const isShortContinuation = previous && /（续）$/.test(String(slide.title || '')) && continuationBase(previous.title) === continuationBase(slide.title) && currentHeight > 0 && currentHeight <= 180
    if (isShortContinuation && sameAgenda && previousHeight + currentHeight <= softLimit) {
      previous.blocks = [...(previous.blocks || []), ...(slide.blocks || [])]
      continue
    }
    result.push(slide)
  }
  return result
}

/** 用稳定的尺寸估算拆开过密页；浏览器自检仍负责捕捉字体/公式造成的真实边界问题。 */
export function paginateCourseSlides(value, budget = 620) {
  if (!Array.isArray(value)) return []
  const result = []
  for (const slide of value) {
    if (!slide || slide.kind === 'cover' || !Array.isArray(slide.blocks) || slide.blocks.length === 0) { result.push(slide); continue }
    // 一般页面交给真实浏览器自检；只对结构上必然过密的页面确定性拆分，避免把正常页拆成孤零零的注释续页。
    if (!needsDeterministicPagination(slide)) { result.push(slide); continue }
    const expanded = slide.blocks.flatMap(block => splitLargeBlock(block, budget))
    const pages = []
    let blocks = []
    let height = 0
    for (const block of expanded) {
      const cost = estimateBlockHeight(block)
      if (blocks.length && height + cost > budget) { pages.push(blocks); blocks = []; height = 0 }
      blocks.push(block); height += cost
    }
    if (blocks.length) pages.push(blocks)
    rebalanceSparsePages(pages, budget)
    if (pages.length === 1) result.push({ ...slide, blocks: pages[0] })
    else pages.forEach((pageBlocks, index) => result.push({ ...slide, title: index === 0 ? slide.title : slide.title + '（续）', blocks: pageBlocks }))
  }
  return coalesceSparseContinuations(result)
}

/** 把模型输出收敛到 HTML/PPTX 渲染器真正支持的块，避免“JSON 合法但页面为空”。 */
export function normalizeCourseSlides(value) {
  if (!Array.isArray(value)) return []
  const slides = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const title = textValue(candidate.title)
    if (!title || !Array.isArray(candidate.blocks)) continue
    const blocks = []
    for (const rawBlock of candidate.blocks) {
      if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue
      const type = textValue(rawBlock.type)
      if (['text', 'intuition', 'analogy'].includes(type)) {
        const content = textValue(rawBlock.content)
        if (content) blocks.push({ ...rawBlock, type, content })
      } else if (type === 'note') {
        const content = textValue(rawBlock.content)
        if (content) blocks.push({ ...rawBlock, type, title: textValue(rawBlock.title), content })
      } else if (type === 'bullets') {
        const items = Array.isArray(rawBlock.items) ? rawBlock.items.map(textValue).filter(Boolean) : []
        if (items.length) blocks.push({ ...rawBlock, type, items })
      } else if (type === 'formula') {
        const latex = textValue(rawBlock.latex)
        if (latex) blocks.push({ ...rawBlock, type, latex, note: textValue(rawBlock.note) })
      } else if (type === 'derivation') {
        const steps = Array.isArray(rawBlock.steps) ? rawBlock.steps.map(step => typeof step === 'string' ? { text: step } : step).filter(step => step && (textValue(step.latex) || textValue(step.text))) : []
        if (steps.length) blocks.push({ ...rawBlock, type, steps })
      } else if (type === 'walkthrough') {
        const steps = Array.isArray(rawBlock.steps) ? rawBlock.steps.map(step => typeof step === 'string' ? { text: step } : step).filter(step => step && textValue(step.text)) : []
        if (steps.length) blocks.push({ ...rawBlock, type, title: textValue(rawBlock.title), steps })
      } else if (type === 'table') {
        const headers = Array.isArray(rawBlock.headers) ? rawBlock.headers.map(value => String(value ?? '')) : []
        const rows = Array.isArray(rawBlock.rows) ? rawBlock.rows.filter(Array.isArray).map(row => row.map(value => String(value ?? ''))) : []
        const sourceTableId = textValue(rawBlock.sourceTableId)
        if (headers.length || rows.length || sourceTableId) blocks.push({ ...rawBlock, type, headers, rows, caption: textValue(rawBlock.caption), sourceTableId })
      } else if (type === 'figure') {
        const assetId = textValue(rawBlock.assetId)
        if (assetId && /^[A-Za-z0-9_-]{3,96}$/.test(assetId)) {
          const guide = Array.isArray(rawBlock.guide)
            ? rawBlock.guide.slice(0, 8).map(item => ({
                label: textValue(item && item.label),
                content: textValue(item && (item.content || item.explain)),
              })).filter(item => item.label && item.content)
            : []
          blocks.push({
            type,
            assetId,
            caption: textValue(rawBlock.caption),
            alt: textValue(rawBlock.alt),
            guide,
            takeaway: textValue(rawBlock.takeaway),
          })
        }
      } else if (type === 'example') {
        const problem = textValue(rawBlock.problem) || textValue(rawBlock.content)
        const steps = Array.isArray(rawBlock.steps) ? rawBlock.steps.filter(step => typeof step === 'string' ? step.trim() : step && (textValue(step.text) || textValue(step.latex))) : []
        if (problem || steps.length || textValue(rawBlock.answer)) blocks.push({ ...rawBlock, type, problem, steps, answer: textValue(rawBlock.answer), note: textValue(rawBlock.note) })
      }
    }
    if (blocks.length) slides.push({ ...candidate, title, blocks })
  }
  return slides
}

/**
 * 图片不是装饰：每张被课件引用的资料图都必须告诉学生阅读顺序、图中部分和结论。
 * 旧 plan 仍可渲染；这个门禁只在新生成流程中使用，避免静默产出“贴图 + 图注”。
 */
export function findFigureTeachingProblems(value) {
  const problems = []
  for (let slideIndex = 0; slideIndex < (Array.isArray(value) ? value.length : 0); slideIndex++) {
    const slide = value[slideIndex]
    const blocks = slide && Array.isArray(slide.blocks) ? slide.blocks : []
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex]
      if (!block || block.type !== 'figure') continue
      const guide = Array.isArray(block.guide) ? block.guide.filter(item => item && textValue(item.label) && textValue(item.content)) : []
      const guideChars = guide.reduce((sum, item) => sum + textValue(item.label).length + textValue(item.content).length, 0)
      const takeaway = textValue(block.takeaway)
      if (guide.length < 2 || guideChars < 50 || takeaway.length < 10) {
        problems.push({
          page: slideIndex + 1,
          blockIndex,
          assetId: textValue(block.assetId),
          title: textValue(slide && slide.title),
          note: '图片必须至少逐项讲解两个可见部分或步骤（合计不少于 50 字），并给出一句图中结论；图注和 alt 不算讲解。',
        })
      }
    }
  }
  return problems
}
