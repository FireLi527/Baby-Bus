import { normalizeSourceRanges, splitStructuredSource } from './source-material.js'

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function comparable(value) {
  return text(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, quote => quote === '“' || quote === '”' ? '"' : "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function questionLocation(problem, sources, preferredRefs) {
  const needle = comparable(problem)
  if (!needle) return null
  const preferred = new Set((preferredRefs || []).map(value => String(value || '').toUpperCase()))
  const ordered = [...(sources || [])].sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)))
  for (const source of ordered) {
    const units = splitStructuredSource(source.modelText || source.text)
    for (const unit of units) {
      if (unit.number != null && comparable(unit.body).includes(needle)) {
        return { source: source.id, range: { source: source.id, kind: unit.kind, from: unit.number, to: unit.number } }
      }
    }
    if (units.length && comparable(units.map(unit => unit.body).join(' ')).includes(needle)) {
      const head = needle.slice(0, Math.min(80, needle.length))
      const tail = needle.slice(-Math.min(80, needle.length))
      const first = units.find(unit => comparable(unit.body).includes(head))
      const last = [...units].reverse().find(unit => comparable(unit.body).includes(tail))
      const range = first && last && first.number != null && last.number != null
        ? { source: source.id, kind: first.kind === last.kind ? first.kind : '', from: Math.min(first.number, last.number), to: Math.max(first.number, last.number) }
        : null
      return { source: source.id, range }
    }
    if (comparable(source.modelText || source.text).includes(needle)) return { source: source.id, range: null }
  }
  return null
}

/** 只接受能在提取文本中逐字定位的题干，防止清单阶段自己总结或补题。 */
export function normalizeAssignmentInventory(value, sources = []) {
  const raw = value && Array.isArray(value.questions) ? value.questions : []
  const sourceIds = new Set((sources || []).map(source => source.id))
  const seen = new Set()
  const questions = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = text(item.id || item.questionId)
    const problem = text(item.problem || item.verbatim)
    if (!id || problem.length < 4) continue
    const key = comparable(id)
    if (!key || seen.has(key)) continue
    const refs = Array.isArray(item.sourceRefs)
      ? [...new Set(item.sourceRefs.map(value => String(value || '').toUpperCase()).filter(value => sourceIds.has(value)))]
      : []
    const located = questionLocation(problem, sources, refs)
    if (!located) continue
    if (!refs.includes(located.source)) refs.push(located.source)
    let sourceRanges = normalizeSourceRanges(item.sourceRanges, sourceIds)
    if (located.range && !sourceRanges.some(range => range.source === located.range.source && range.from <= located.range.from && range.to >= located.range.to)) sourceRanges.unshift(located.range)
    const answerStatus = /^(?:worked|final_only|none)$/.test(text(item.answerStatus)) ? text(item.answerStatus) : 'none'
    seen.add(key)
    questions.push({ id, title: text(item.title), problem, answerStatus, sourceRefs: refs, sourceRanges })
  }
  return questions
}

export function assignmentSections(questions) {
  return (questions || []).map(question => ({
    heading: question.title ? `${question.id}：${question.title}` : `题目 ${question.id}`,
    keyPoints: [
      `完整呈现并讲解 ${question.id}`,
      question.answerStatus === 'worked' ? '资料提供了解答过程' : (question.answerStatus === 'final_only' ? '资料仅提供最终答案' : '资料未提供答案'),
    ],
    questionRefs: [question.id],
    questions: [question],
    sourceRefs: [...question.sourceRefs],
    sourceRanges: [...question.sourceRanges],
  }))
}

function labeledProblem(question) {
  const problem = text(question && question.problem)
  const id = text(question && question.id)
  return id && !comparable(problem).startsWith(comparable(id)) ? `${id}：${problem}` : problem
}

function questionSlide(question) {
  const id = text(question && question.id)
  return {
    title: id ? `${id}：原题` : '原题',
    assignmentQuestion: true,
    assignmentQuestionId: id,
    sourceRefs: Array.isArray(question && question.sourceRefs) ? [...question.sourceRefs] : [],
    sourceAnchors: [],
    blocks: [{
      type: 'example',
      problem: labeledProblem(question),
      steps: [],
      answer: '',
      note: '',
    }],
  }
}

/**
 * 模型只负责讲解；程序把已验证的逐字题干插入为独立原题页。
 * 这样题目一定先于思路、步骤和答案出现，也不会被模型的概括句替代。
 */
export function enforceAssignmentProblems(slides, questions) {
  const output = (Array.isArray(slides) ? slides : []).map(slide => ({ ...slide, blocks: Array.isArray(slide.blocks) ? slide.blocks.map(block => ({ ...block })) : [] }))
  const expected = Array.isArray(questions) ? questions : []
  if (!expected.length) return output
  return [...expected.map(questionSlide), ...output]
}
