import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { SYS } from '../server/embedded.mjs'
import { finalizeSlides, problemSectionIndexes } from '../server/generation/finalize-slides.js'
import { createScheduler } from '../server/generation/llm-scheduler.js'
import { assignmentSections, enforceAssignmentProblems, normalizeAssignmentInventory } from '../server/generation/assignment.js'
import { detectAssignmentMaterial } from '../server/generation/source-material.js'
import { buildHtmlDoc } from '../server/html.js'
import { safeSystemPrompt } from '../server/prompts/base.js'
import { assignmentInventoryAuditPrompt, assignmentInventoryPrompt } from '../server/prompts/assignment.js'
import { glossaryPrompts } from '../server/prompts/glossary.js'
import { outlinePrompt } from '../server/prompts/outline.js'
import { deckReviewPrompt, slideRepairPrompt } from '../server/prompts/review.js'
import { renderRetryFeedback, sectionPrompt } from '../server/prompts/section.js'

test('shared scheduler limits nested model-call concurrency', async () => {
  const schedule = createScheduler(2)
  let active = 0
  let maximum = 0

  const results = await Promise.all(Array.from({ length: 7 }, (_, index) => schedule(async () => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 8))
    active--
    return index
  })))

  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6])
  assert.equal(maximum, 2)
  assert.deepEqual(schedule.stats(), { active: 0, queued: 0, limit: 2 })
})

test('self-check page numbers map against the final paginated deck', () => {
  const denseSection = {
    title: '第一节',
    agendaIndex: 0,
    blocks: [{
      type: 'bullets',
      items: Array.from({ length: 18 }, (_, index) => `需要保留并讲清楚的知识点 ${index + 1}：${'解释内容'.repeat(12)}`),
    }],
  }
  const secondSection = {
    title: '第二节',
    agendaIndex: 1,
    blocks: [{ type: 'text', content: '第二节的独立教学内容。' }],
  }

  const finalSlides = finalizeSlides([{ kind: 'cover', title: '课程' }, denseSection, secondSection])
  const secondPage = finalSlides.findIndex(slide => slide.agendaIndex === 1) + 1

  assert.ok(finalSlides.length > 3, '密集页面应在最终化阶段被拆页')
  assert.ok(secondPage > 2, '第二节页码应反映第一节拆页后的偏移')
  assert.deepEqual(
    problemSectionIndexes([`第${secondPage}页缺少解释`], finalSlides, [[denseSection], [secondSection]]),
    [1],
  )
})

test('HTML renderer serializes final pages verbatim instead of paginating again', () => {
  const slides = [{
    title: '最终页面',
    agendaIndex: 0,
    blocks: [{
      type: 'bullets',
      items: Array.from({ length: 18 }, (_, index) => `已经定稿的条目 ${index + 1}`),
    }],
  }]
  const html = buildHtmlDoc({ title: '分页回归测试', slides, outline: [], glossary: [], assets: [] })
  const payload = /id='course-data'>([^<]+)</.exec(html)

  assert.ok(payload, 'HTML 应内嵌课程数据')
  const decoded = JSON.parse(Buffer.from(payload[1], 'base64').toString('utf8'))
  assert.equal(decoded.slides.length, slides.length)
  assert.deepEqual(decoded.slides, slides)
})

test('stage prompts own their JSON shape instead of inheriting an object-only contract', () => {
  const system = safeSystemPrompt(SYS)
  const outline = outlinePrompt('课程', '1~3')
  const review = deckReviewPrompt({ materialType: '教材课件', reviewSources: '资料', glossaryText: '术语', serial: '课件' })
  const section = sectionPrompt({
    sectionContext: '资料正文',
    outlineTitles: ['第一节'],
    index: 0,
    section: { heading: '第一节', keyPoints: ['知识点'] },
    slideRange: '按讲清内容所需生成页面',
    teachingRules: '',
    extraHint: '',
  })

  assert.match(system, /当前任务末尾声明的对象或数组契约/)
  assert.doesNotMatch(system.trimEnd(), /只输出 JSON 对象本体。$/)
  assert.match(outline, /JSON 对象/)
  assert.match(outline, /sourceRanges 描述每个小节需要阅读的资料范围/)
  assert.match(section, /JSON 数组/)
  assert.match(section, /原页编号用于定位资料/)
  assert.match(section, /sourceAnchors 是可选溯源信息/)
  assert.match(section, /formula\.latex 只写一条完整的独立公式/)
  assert.match(section, /LaTeX 反斜线按 JSON 语法转义/)
  assert.doesNotMatch(section, /每个锚点至少出现一次|逐页覆盖清单/)
  assert.match(review, /sourceAnchors 仅是溯源元数据，不参与完整性判断/)
  assert.match(review, /裸露的 LaTeX 命令/)
  assert.doesNotMatch([system, outline, section, review].join('\n'), /不设 150 字|页数没有上限|不能缩减为 2~3 页|铁律|最高优先级/)
})

test('outgoing model instructions use canonical rules instead of historical rebuttals', () => {
  const glossary = glossaryPrompts('', '课件正文')
  const repair = slideRepairPrompt({
    problem: { kind: 'dense', note: '页面过密' },
    materialType: '教材课件',
    evidence: '资料',
    slide: { title: '页面', sourceAnchors: [], blocks: [] },
  })
  const renderRetry = renderRetryFeedback(['第3页内容溢出'])
  const pipelineSource = fs.readFileSync(new URL('../server/pipeline.js', import.meta.url), 'utf8')
  const outgoing = [SYS, glossary.primary, glossary.retry, repair, renderRetry, pipelineSource].join('\n')

  assert.doesNotMatch(outgoing, /不设 150 字|不使用 150 字|页数没有上限|不能缩减为 2~3 页|铁律|硬性要求|最高优先级/)
  assert.match(SYS, /页面数量由知识结构决定/)
  assert.match(repair, /内容密集时按清晰的逻辑层次组织/)
})

test('assignment detection prefers explicit classification and requires multiple textual signals', () => {
  assert.equal(detectAssignmentMaterial({ materialType: '作业习题' }, []), true)
  assert.equal(detectAssignmentMaterial({ materialType: '教材课件' }, [{ name: 'lecture.pdf', modelText: '课后作业：阅读下一章。' }]), false)
  assert.equal(detectAssignmentMaterial({ materialType: '教材课件' }, [{
    name: 'Homework 1 with answers.pdf',
    modelText: '1. First question.\n2. Second question.\n3. Third question.\nAnswer: A.\nSolution: B.',
  }]), true)
  assert.equal(detectAssignmentMaterial(null, [{
    name: 'Homework 1 with solutions.pdf',
    modelText: '1. Calculate the result.\n2. Prove the statement.\n3. Compare both methods.\nSolution: first answer.\nAnswer: second answer.',
  }]), true)
})

test('homework prompts preserve question-answer pairing and reject invented steps', () => {
  const outline = outlinePrompt('资料', '2~4', 'homework')
  const section = sectionPrompt({
    sectionContext: '资料正文',
    outlineTitles: ['第1题'],
    index: 0,
    section: {
      heading: '第1题',
      keyPoints: ['资料仅提供最终答案'],
      questionRefs: ['1(a)', '1(b)'],
      questions: [{ id: '1(a)', problem: 'Calculate P(X = 1).' }, { id: '1(b)', problem: 'Explain the result.' }],
    },
    slideRange: '按题目需要生成',
    teachingRules: '【作业与习题讲解】保留答案对应关系。',
    extraHint: '',
  })
  const review = deckReviewPrompt({ assignmentMode: true, materialType: '作业习题', reviewSources: '题目与答案', glossaryText: '', serial: '' })

  assert.match(outline, /questionRefs/)
  assert.match(outline, /不把题干改写成一般知识定义/)
  assert.match(section, /1\(a\)、1\(b\)/)
  assert.match(section, /独立原题页/)
  assert.match(section, /不要再生成题干页/)
  assert.match(review, /答案对应/)
  assert.match(review, /讲解先于原题出现/)
  assert.match(review, /补写资料未提供的具体推导/)
})

test('assignment inventory only accepts verbatim source questions and inserts a dedicated question slide', () => {
  const sources = [{
    id: 'S1',
    modelText: '=== PAGE 2 ===\nQ1. Let X and Y be random variables. Prove that they are not independent.\n\n=== PAGE 3 ===\nSolution: choose a counterexample.',
  }]
  const inventory = normalizeAssignmentInventory({ questions: [
    {
      id: 'Q1',
      title: '判断独立性',
      problem: 'Q1. Let X and Y be random variables. Prove that they are not independent.',
      answerStatus: 'worked',
      sourceRefs: ['S1'],
      sourceRanges: [],
    },
    { id: 'Q2', problem: '概括后的虚构题目', sourceRefs: ['S1'] },
  ] }, sources)

  assert.equal(inventory.length, 1)
  assert.deepEqual(inventory[0].sourceRanges, [{ source: 'S1', kind: 'PAGE', from: 2, to: 2 }])
  const sections = assignmentSections(inventory)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].questions[0].problem, inventory[0].problem)

  const slides = enforceAssignmentProblems([{ title: 'Q1', blocks: [
    { type: 'text', content: '先判断联合概率。' },
    { type: 'example', problem: '证明不独立', steps: [{ text: '代入概率' }], answer: '不独立' },
  ] }], inventory)
  assert.equal(slides.length, 2)
  assert.equal(slides[0].title, 'Q1：原题')
  assert.equal(slides[0].assignmentQuestion, true)
  assert.equal(slides[0].assignmentQuestionId, 'Q1')
  assert.equal(slides[0].blocks.length, 1)
  assert.equal(slides[0].blocks[0].problem, inventory[0].problem)
  assert.deepEqual(slides[0].blocks[0].steps, [])
  assert.equal(slides[0].blocks[0].answer, '')
  assert.equal(slides[1].blocks[0].content, '先判断联合概率。')
  assert.equal(slides[1].blocks[1].answer, '不独立')
})

test('assignment question slide is still produced when the model has no explanation page', () => {
  const slides = enforceAssignmentProblems([], [{
    id: '2(a)',
    problem: 'Find the requested probability and justify every step.',
    sourceRefs: ['S2'],
  }])
  assert.equal(slides.length, 1)
  assert.equal(slides[0].title, '2(a)：原题')
  assert.equal(slides[0].blocks[0].problem, '2(a)：Find the requested probability and justify every step.')
  assert.equal(slides[0].blocks[0].answer, '')
})

test('assignment inventory prompts require a second omission audit', () => {
  const primary = assignmentInventoryPrompt('课程', 'Q1. Full problem')
  const audit = assignmentInventoryAuditPrompt('课程', 'Q1. Full problem\nQ2. Missing problem', [{ id: 'Q1', problem: 'Q1. Full problem' }])
  assert.match(primary, /逐字复制原题/)
  assert.match(primary, /每道实质题目或可独立作答的小题恰好出现一次/)
  assert.match(audit, /只找出现有清单遗漏/)
  assert.match(audit, /Q1\. Full problem/)
})
