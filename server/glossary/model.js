import { normalizeDisplayLatex } from '../parse.js'

function foldedTerm(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_.·‐‑‒–—-]+/g, '')
}

function stripRepeatedGlossaryLabel(explain, term, english, abbr) {
  const original = String(explain || '').trim()
  if (!original || !term || !original.toLocaleLowerCase().startsWith(String(term).toLocaleLowerCase())) return original
  let rest = original.slice(String(term).length).trimStart()
  let removedLabel = false
  if (/^[（(]/.test(rest)) {
    const match = /^[（(]([^）)]{1,120})[）)]/.exec(rest)
    if (match) {
      const expected = [english, abbr].map(foldedTerm).filter(Boolean)
      const actual = match[1].split(/[\/|｜]/).map(foldedTerm).filter(Boolean)
      if (expected.length && actual.some(value => expected.includes(value))) {
        rest = rest.slice(match[0].length).trimStart()
        removedLabel = true
      }
    }
  }
  if (/^[：:]/.test(rest)) {
    rest = rest.replace(/^[：:]\s*/, '')
    removedLabel = true
  } else if (removedLabel) {
    rest = rest.replace(/^[，,、—-]\s*/, '')
  }
  return removedLabel && rest ? rest : original
}

export function normalizeGlossaryItem(item) {
  if (!item || typeof item !== 'object') return null
  const term = String(item.term || item.zh || item.chinese || '').trim()
  if (!term) return null
  const aliasInput = Array.isArray(item.aliases) ? item.aliases : (typeof item.aliases === 'string' ? item.aliases.split(/[、,，;；]/) : [])
  const english = String(item.english || item.en || item.englishName || '').trim()
  const abbr = String(item.abbr || item.abbreviation || item.acronym || '').trim()
  const explain = String(item.explain || item.definition || item.description || item.meaning || '').trim()
  return {
    ...item,
    term,
    english,
    abbr,
    aliases: [...new Set(aliasInput.map(value => String(value || '').trim()).filter(value => value && value !== term))],
    explain: stripRepeatedGlossaryLabel(explain, term, english, abbr),
    formula: normalizeDisplayLatex(item.formula),
  }
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
    for (const marker of ['称之为', '我们称为', '被称为', '也称为', '称为', '叫作', '叫做', '也叫', '所谓', '采用', '代表', '区分', '理解', '基于', '用了一个', '叫']) {
      const index = text.lastIndexOf(marker)
      if (index >= 0) text = text.slice(index + marker.length)
    }
    return text
      .replace(/^(?:第[一二三四五六七八九十\d]+类是|第[一二三四五六七八九十\d]+层是|最后一层是|课程没有正式的|此外还有多位|另外两本|后续的|这就是一个|这是一个|选定一个|同一个|一个|一种|一些|有些|这些|这个|会在|的|是)+/, '')
  }
  const looksLikeTechnicalTerm = (term, sentence) => {
    if (/(?:没有|不是|能够|要求|需要|负责|通过|还有|多位|一位|两本|用了|采用|代表|理解)/.test(term)) return false
    if (/^(?:课程大纲|课程提纲|课程代表|课程安排|辅导课|助教|教师|教学团队|主教材|补充阅读|正式考核|先修课|作业|考试|学期|周次)$/.test(term)) return false
    if (/(?:MyTimeTable|出版社|教学团队|作业批改|课程注册|考试安排)/i.test(sentence)) return false
    return true
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
        if (!looksLikeTechnicalTerm(term, sentence)) continue
        if (/^(?:一个|一种|一些|有些|这些|这个|我们|它们|其中|以及|或者|和|与|有|无)/.test(term)) continue
        if (/(?:可以|的是|的|为|把|将|从|对)$/.test(term) || term.includes('可以') || term.includes('学期')) continue
        if (['正面', '负面', '同义', '相似', '相关'].includes(term)) continue
        const parts = match[2].split(/[\/|｜]/).map(value => value.trim()).filter(Boolean)
        const isAbbreviation = value => /^[A-Z][A-Z0-9-]{1,11}$/.test(value) || (/^[A-Za-z][A-Za-z0-9-]{1,11}$/.test(value) && (value.match(/[A-Z]/g) || []).length >= 2 && (value.match(/[a-z]/g) || []).length < 3)
        const abbr = parts.find(isAbbreviation) || ''
        const english = parts.find(value => value !== abbr && /[a-z]/.test(value)) || (!abbr && /[a-z]/.test(match[2]) ? match[2].trim() : '')
        if (!english) continue
        if (!englishMatchesTerm(term, english)) continue
        const suffix = sentence.slice((match.index || 0) + match[0].length).replace(/^[\s：:，,、—-]+/, '').trim()
        // 兜底只接纳标签后紧跟实际解释的句子；标题里的“术语（English）”不能单独充当定义。
        if (suffix.length < 6 || /^(?:的基本思想|的定义|概述|简介)[。.]?$/.test(suffix)) continue
        const explain = suffix.slice(0, 260)
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

export function mergeGlossary(store, fresh, preferFresh) {
  return mergeNormalizedGlossary(normalizeGlossaryList(store), normalizeGlossaryList(fresh), !!preferFresh)
}
