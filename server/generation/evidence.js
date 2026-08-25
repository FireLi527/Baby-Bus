// 表格与图片证据的筛选、绑定和定向修复。
import { findFigureTeachingProblems, normalizeCourseSlides } from '../parse.js'

export function cleanEvidenceText(value, limit = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function visualHashDistance(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(String(left || '')) || !/^[0-9a-f]{64}$/i.test(String(right || ''))) return Infinity
  let distance = 0
  const a = String(left).toLowerCase()
  const b = String(right).toLowerCase()
  for (let index = 0; index < a.length; index++) {
    let value = parseInt(a[index], 16) ^ parseInt(b[index], 16)
    while (value) { distance += value & 1; value >>= 1 }
  }
  return distance
}

/** 连续原页里的近似渐进图只保留最后（信息最完整）的一张作为讲解资源。 */
export function representativeFigureAssets(value, maxPageGap = 2, maxHashDistance = 8) {
  const assets = (Array.isArray(value) ? value : []).map((asset, index) => ({ ...asset, __index: index }))
    .sort((left, right) => (Number(left.page) || 0) - (Number(right.page) || 0) || left.__index - right.__index)
  const result = []
  for (const raw of assets) {
    const asset = { ...raw }
    delete asset.__index
    const previous = result[result.length - 1]
    const pageGap = previous ? (Number(asset.page) || 0) - (Number(previous.page) || 0) : Infinity
    if (previous && pageGap >= 0 && pageGap <= maxPageGap && visualHashDistance(previous.visualHash, asset.visualHash) <= maxHashDistance) {
      const mergedAssetIds = [...new Set([...(previous.mergedAssetIds || [previous.id]), asset.id].filter(Boolean))]
      result[result.length - 1] = { ...asset, mergedAssetIds }
    } else {
      result.push({ ...asset, mergedAssetIds: asset.id ? [asset.id] : [] })
    }
  }
  return result
}

/**
 * 图片证据是候选教学资源，不是必须逐张使用的清单。这里只排除明确的目录、封面、
 * 路线图、致谢等装饰性页面；信息不明确时仍保留，避免误删真正的图表或推导图。
 */
export function isInstructionalFigureAsset(asset) {
  if (!asset || typeof asset !== 'object') return false
  const caption = cleanEvidenceText(asset.caption, 600)
  const alt = cleanEvidenceText(asset.alt, 600)
  const context = cleanEvidenceText(asset.context, 1200)
  const label = (caption + ' ' + alt).trim()
  const genericAlt = /^(?:第\s*\d+\s*页资料原图|资料原图|原图|image|figure)$/i.test(label)
  const decorative = /(?:^|[\s：:·—-])(?:agenda|outline|table of contents|contents|course overview|course roadmap|learning path|section overview|title slide|thank you|questions?|目录|课程大纲|课程提纲|本讲内容|本节内容|学习路线|学习路径|章节导航|标题页|封面|过渡页|谢谢|提问)(?:$|[\s：:·—-])/i
  const structural = /(?:figure\s*\d+|fig\.?\s*\d+|table\s*\d+|图\s*\d+|表\s*\d+|矩阵|坐标轴|曲线|散点|柱状|直方|流程图|架构图|结构图|网络图|公式|方程|推导|损失函数|概率分布|matrix|axis|curve|plot|scatter|histogram|flowchart|architecture|equation|derivation|loss function|probability distribution)/i
  if (decorative.test(label) && !structural.test(label)) return false
  const heading = context.slice(0, 260)
  if (decorative.test(heading) && (genericAlt || !caption) && !structural.test(caption)) return false
  return true
}

function normalizedEvidenceSources(sources) {
  const tables = new Map()
  const assets = new Map()
  for (const source of (sources || [])) {
    for (const raw of (Array.isArray(source.tables) ? source.tables : [])) {
      const id = cleanEvidenceText(raw && raw.id, 96)
      const headers = Array.isArray(raw && raw.headers) ? raw.headers.slice(0, 12).map(value => cleanEvidenceText(value, 320)) : []
      const rows = Array.isArray(raw && raw.rows)
        ? raw.rows.slice(0, 40).filter(Array.isArray).map(row => row.slice(0, 12).map(value => cleanEvidenceText(value, 320)))
        : []
      if (id && /^[A-Za-z0-9_-]{3,96}$/.test(id) && (headers.length || rows.length)) {
        tables.set(id, { id, headers, rows, caption: cleanEvidenceText(raw.caption, 320), page: Number(raw.page) || 0 })
      }
    }
    for (const raw of (Array.isArray(source.assets) ? source.assets : [])) {
      const id = cleanEvidenceText(raw && raw.id, 96)
      const dataUrl = String(raw && raw.dataUrl || '')
      if (!id || !/^[A-Za-z0-9_-]{3,96}$/.test(id) || !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) continue
      assets.set(id, {
        id,
        dataUrl,
        caption: cleanEvidenceText(raw.caption, 320),
        alt: cleanEvidenceText(raw.alt, 320),
        page: Number(raw.page) || 0,
        width: Number(raw.width) || 0,
        height: Number(raw.height) || 0,
        visualHash: /^[0-9a-f]{64}$/i.test(String(raw.visualHash || '')) ? String(raw.visualHash).toLowerCase() : '',
        mergedAssetIds: Array.isArray(raw.mergedAssetIds) ? raw.mergedAssetIds.map(value => cleanEvidenceText(value, 96)).filter(Boolean) : [],
      })
    }
  }
  return { tables, assets }
}

/**
 * 把模型选择的表格/图片重新绑定到解析器证据。
 * 表格数据以解析结果覆盖模型输出，图片只允许引用已提取的 data URL。
 */
export function bindEvidenceSlides(slides, sources) {
  const evidence = normalizedEvidenceSources(sources)
  return (Array.isArray(slides) ? slides : []).map(slide => ({
    ...slide,
    blocks: (slide.blocks || []).flatMap(block => {
      if (block.type === 'table' && block.sourceTableId) {
        const table = evidence.tables.get(block.sourceTableId)
        if (!table) return []
        return [{ ...block, headers: table.headers, rows: table.rows, caption: table.caption || block.caption || '' }]
      }
      if (block.type === 'figure') {
        const asset = evidence.assets.get(block.assetId)
        if (!asset) return []
        return [{ ...block, caption: block.caption || asset.caption || '', alt: block.alt || asset.alt || '' }]
      }
      return [block]
    }),
  })).filter(slide => slide.kind === 'cover' || (Array.isArray(slide.blocks) && slide.blocks.length))
}

/**
 * 图片定向修复的唯一写入口。无论模型额外返回什么，都只允许替换目标 figure 的
 * guide 与 takeaway；标题、正文、公式、图片编号、图注和其他块保持原样。
 */
export function replaceFigureTeachingOnly(slides, repair) {
  const source = Array.isArray(slides) ? slides : []
  const pageIndex = Number(repair && repair.page) - 1
  if (pageIndex < 0 || pageIndex >= source.length) return { slides: source, applied: false }
  const slide = source[pageIndex]
  const blocks = slide && Array.isArray(slide.blocks) ? slide.blocks : []
  let blockIndex = Number(repair && repair.blockIndex)
  const assetId = cleanEvidenceText(repair && repair.assetId, 96)
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= blocks.length || blocks[blockIndex]?.type !== 'figure' || (assetId && blocks[blockIndex]?.assetId !== assetId)) {
    blockIndex = blocks.findIndex(block => block && block.type === 'figure' && (!assetId || block.assetId === assetId))
  }
  if (blockIndex < 0) return { slides: source, applied: false }
  const original = blocks[blockIndex]
  const normalized = normalizeCourseSlides([{
    title: '图片定向讲解',
    blocks: [{
      type: 'figure',
      assetId: original.assetId,
      guide: repair && repair.guide,
      takeaway: repair && repair.takeaway,
    }],
  }])
  const teaching = normalized[0]?.blocks?.[0]
  if (!teaching || findFigureTeachingProblems(normalized).length) return { slides: source, applied: false }
  const nextBlocks = blocks.slice()
  nextBlocks[blockIndex] = { ...original, guide: teaching.guide, takeaway: teaching.takeaway }
  const next = source.slice()
  next[pageIndex] = { ...slide, blocks: nextBlocks }
  return { slides: next, applied: true }
}

export function referencedAssets(slides, sources) {
  const evidence = normalizedEvidenceSources(sources)
  const ids = new Set()
  for (const slide of (slides || [])) for (const block of (slide.blocks || [])) if (block.type === 'figure' && block.assetId) ids.add(block.assetId)
  return Object.fromEntries([...ids].filter(id => evidence.assets.has(id)).map(id => [id, evidence.assets.get(id)]))
}

export function evidenceCatalogForSources(sources, maxChars = 24000) {
  const lines = []
  for (const source of (sources || [])) {
    for (const table of (Array.isArray(source.tables) ? source.tables : [])) {
      const id = cleanEvidenceText(table && table.id, 96)
      if (!id) continue
      const headers = Array.isArray(table.headers) ? table.headers.slice(0, 12).map(value => cleanEvidenceText(value, 120)) : []
      const preview = Array.isArray(table.rows) ? table.rows.slice(0, 3).map(row => Array.isArray(row) ? row.slice(0, 12).map(value => cleanEvidenceText(value, 120)) : []) : []
      lines.push('TABLE ASSET id=' + id + ' page=' + (Number(table.page) || '?') + (table.caption ? ' caption=' + cleanEvidenceText(table.caption, 220) : '') + ' headers=' + JSON.stringify(headers) + ' preview=' + JSON.stringify(preview))
    }
    for (const asset of (Array.isArray(source.assets) ? source.assets : [])) {
      const id = cleanEvidenceText(asset && asset.id, 96)
      if (!id) continue
      const context = [...new Set([asset.caption, asset.context, asset.alt].map(value => cleanEvidenceText(value, 1800)).filter(Boolean))].join('；')
      const size = Number(asset.width) > 0 && Number(asset.height) > 0 ? ' size=' + Number(asset.width) + 'x' + Number(asset.height) : ''
      const merged = Array.isArray(asset.mergedAssetIds) && asset.mergedAssetIds.length > 1 ? ' mergedProgressive=' + asset.mergedAssetIds.join(',') : ''
      lines.push('FIGURE ASSET id=' + id + ' page=' + (Number(asset.page) || '?') + size + merged + (context ? ' pageContext=' + context : ''))
    }
  }
  return lines.length ? '\n\n【可用结构化证据目录（编号必须逐字复制）】\n' + lines.join('\n').slice(0, maxChars) : ''
}

/**
 * 把本小节的资料图与资源编号一起交给兼容视觉输入的模型。
 * 数量过多时均匀抽样，确保章节首尾图都不会因“只取前几张”而永远看不到。
 */
export function figureInputsForSources(sources, wantedIds = null, maxImages = 12, maxDataChars = 18 * 1024 * 1024) {
  const wanted = wantedIds ? new Set(wantedIds) : null
  const candidates = []
  for (const source of (sources || [])) for (const asset of (source.assets || [])) {
    const id = cleanEvidenceText(asset && asset.id, 96)
    const dataUrl = String(asset && asset.dataUrl || '')
    if (!id || (wanted && !wanted.has(id)) || !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) continue
    candidates.push({ label: id + '（原资料第 ' + (Number(asset.page) || '?') + ' 页）', dataUrl })
  }
  let selected = candidates
  if (candidates.length > maxImages) {
    const indexes = new Set()
    for (let i = 0; i < maxImages; i++) indexes.add(Math.round(i * (candidates.length - 1) / Math.max(1, maxImages - 1)))
    selected = [...indexes].sort((a, b) => a - b).map(index => candidates[index])
  }
  const result = []
  let chars = 0
  for (const image of selected) {
    if (result.length && chars + image.dataUrl.length > maxDataChars) continue
    if (!result.length && image.dataUrl.length > maxDataChars) continue
    result.push(image)
    chars += image.dataUrl.length
  }
  return result
}
