import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { allocateSourceCharBudget, condenseSourceText, detectLiteratureMaterial, generate, generateBatch, jobStatus, stripPaperReferenceTail } from '../server/pipeline.js'
import { indexHtml, refreshLearningCenter, scanCourseLocations } from '../server/archive.js'
import { SYS } from '../server/embedded.mjs'

function mockAnswer(prompt) {
  if (prompt.includes('【第一步】')) {
    return JSON.stringify({ title: '测试课程', difficulty: '入门', sections: [{ heading: '核心概念', keyPoints: ['理解输入与输出分离'] }] })
  }
  if (prompt.includes('【当前任务】') || prompt.includes('【重试兜底】')) {
    return JSON.stringify([
      { title: '直觉', blocks: [{ type: 'intuition', content: '输入资料只负责读取。' }, { type: 'analogy', content: '像图书馆借书，不在原书上写笔记。' }] },
      { title: '自己试试', blocks: [{ type: 'example', content: '选择一个文本文件并生成课程。' }, { type: 'note', content: '结果应进入内部资料库。' }] },
    ])
  }
  if (prompt.includes('【最后一步】')) {
    return JSON.stringify({ title: '小结', blocks: [{ type: 'intuition', content: '输入与输出已经分离。' }, { type: 'bullets', items: ['输入目录只读', '输出进入内部资料库'] }] })
  }
  if (prompt.includes('重写这一页')) {
    return JSON.stringify({ title: '直觉（已修复）', blocks: [{ type: 'intuition', content: '输入资料只读取，结果统一归档。' }, { type: 'note', content: '这是局部修复后的页面。' }] })
  }
  if (prompt.includes('你是学生审稿员')) return JSON.stringify({ problems: [{ page: 3, kind: 'dense', note: '测试局部修复' }] })
  if (prompt.includes('请把下面课件正文')) return JSON.stringify({ glossary: [] })
  return JSON.stringify({ problems: [] })
}

async function createMockLlm(answer = mockAnswer) {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const prompt = body.messages?.find(message => message.role === 'user')?.content || ''
    const content = answer(prompt)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n')
    res.end('data: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return server
}

test('未选择课程时立即拒绝生成', async () => {
  const storageDir = path.join(os.tmpdir(), 'study-assistant-required-course')
  const result = await generate({ storageDir }, { rel: '不会被读取.txt', course: '' })
  assert.equal(result.ok, false)
  assert.match(result.error, /请选择已有课程或新建课程/)
})

test('多来源字符预算会完整保留短资料并公平分配长资料', () => {
  assert.deepEqual(allocateSourceCharBudget([50000, 1000, 1000], 6000), [4000, 1000, 1000])
  assert.deepEqual(allocateSourceCharBudget([10, 10, 10], 2), [1, 1, 0])
})

test('长课件压缩后仍覆盖每个幻灯片锚点和尾部资料', () => {
  const source = [1, 2, 3, 4].map(index => `=== SLIDE ${index} ===\n` + String(index).repeat(120)).join('\n')
  const condensed = condenseSourceText(source, 180)
  for (let index = 1; index <= 4; index++) assert.match(condensed, new RegExp(`=== SLIDE ${index} ===`))
  assert.ok(condensed.length <= 180)
})

test('论文识别与参考文献尾部裁剪只保留正文', () => {
  const body = `Abstract\n${'This paper studies grounded slide generation. '.repeat(10)}\nIntroduction\nWe evaluate a source-faithful method.\nConclusion\nThe method reduces unsupported content.\nReferences\n[1] Ghost, A. 2022. Invented Formula Handbook.\n[2] Phantom, B. 2023. Synthetic Exercises.`
  assert.equal(detectLiteratureMaterial(null, [{ name: 'paper.txt', text: body }]), true)
  const stripped = stripPaperReferenceTail(body)
  assert.match(stripped, /reduces unsupported content/)
  assert.doesNotMatch(stripped, /Ghost|Phantom|Invented Formula Handbook/)

  const agenda = 'Agenda\nReferences\nMethods\nResults'
  assert.equal(stripPaperReferenceTail(agenda), agenda, '目录中的 References 不应被当成正文结尾')
})

test('内嵌系统提示坚持资料忠实，不再硬性要求数字、公式或练习', () => {
  assert.match(SYS, /公式、例题、实验数字、推导和结论都必须能回指资料正文/)
  assert.match(SYS, /论文\/文献模式不强制出题、练习、数值演算或公式/)
  assert.match(SYS, /其后的文献条目全部跳过/)
  assert.doesNotMatch(SYS, /每张幻灯片至少要有一个带具体数字的内容|每个公式必须三步讲透/)
})

test('学习中心按打开方式选择静态或实时术语库地址', () => {
  const staticHtml = indexHtml([], 'D:\\资料')
  const dynamicHtml = indexHtml([], 'D:\\资料', { dynamic: true })
  assert.match(staticHtml, /href='术语库\.html'/)
  assert.doesNotMatch(staticHtml, /href='\/api\/study-assistant\/glossary-view'/)
  assert.match(dynamicHtml, /href='\/api\/study-assistant\/glossary-view'/)
})

test('论文模式不强制出题或公式，并从所有生成阶段排除参考文献尾部', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-paper-policy-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const inputFile = path.join(inputDir, 'paper.txt')
  const paper = `Abstract\n${'This paper studies evidence-grounded teaching slides without invented material. '.repeat(8)}\nIntroduction\nThe method follows the supplied evidence.\nConclusion\nThe study reports improved factual consistency.\nReferences\n[1] Ghost, A. 2022. Invented Formula Handbook.\n[2] Phantom, B. 2023. Synthetic Exercises.`
  fs.writeFileSync(inputFile, paper, 'utf8')
  const prompts = []
  const mockLlm = await createMockLlm(prompt => {
    prompts.push(prompt)
    if (prompt.includes('【第一步】')) return JSON.stringify({ title: '论文讲解', materialType: '论文文献', sections: [{ heading: '研究内容', keyPoints: ['研究问题与结论'], sourceRefs: ['S1'] }] })
    if (prompt.includes('【当前任务】') || prompt.includes('【重试兜底】')) return JSON.stringify([
      { title: '研究关注资料忠实性', blocks: [{ type: 'text', content: '研究考察如何依据输入资料生成讲解内容。' }] },
      { title: '结论报告事实一致性提升', blocks: [{ type: 'bullets', items: ['方法遵循输入证据', '结论来自论文正文'] }] },
    ])
    if (prompt.includes('【最后一步】')) return JSON.stringify({ title: '小结', blocks: [{ type: 'bullets', items: ['研究问题', '研究结论'] }] })
    if (prompt.includes('请把下面课件正文')) return JSON.stringify({ glossary: [] })
    if (prompt.includes('你是学生审稿员')) return JSON.stringify({ problems: [] })
    return JSON.stringify({ problems: [] })
  })
  t.after(() => {
    mockLlm.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generate({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: false,
    browserPath: '',
  }, {
    rel: inputFile,
    course: '论文策略',
    html: false,
    pptx: false,
    job: 'paper-policy-test',
  })

  assert.equal(result.ok, true, result.error)
  const outlinePrompt = prompts.find(prompt => prompt.includes('【第一步】'))
  const sectionPrompt = prompts.find(prompt => prompt.includes('【当前任务】'))
  const reviewPrompt = prompts.find(prompt => prompt.includes('你是学生审稿员'))
  const glossaryPrompt = prompts.find(prompt => prompt.includes('请把下面课件正文'))
  assert.doesNotMatch(outlinePrompt, /Ghost|Phantom|Invented Formula Handbook/)
  assert.match(sectionPrompt, /【资料类型】论文文献/)
  assert.match(sectionPrompt, /不强制出题、练习、例题、公式/)
  assert.match(sectionPrompt, /标题和正文优先使用中文术语，尽量不要使用英文缩写/)
  assert.doesNotMatch(sectionPrompt, /至少 1 张带具体数字|本小节必须包含（缺一不可）/)
  assert.doesNotMatch(sectionPrompt, /Ghost|Phantom|Invented Formula Handbook/)
  assert.match(reviewPrompt, /unsupported/)
  assert.doesNotMatch(reviewPrompt, /no-practice|Ghost|Phantom/)
  assert.match(glossaryPrompt, /正文没有公式就必须填写空字符串/)
  assert.match(glossaryPrompt, /"english": "英文全称"/)
  assert.match(glossaryPrompt, /"abbr": "资料中明确出现的缩写/)
  assert.match(glossaryPrompt, /允许 abbr 重复/)
  const plan = JSON.parse(fs.readFileSync(path.join(storageDir, '论文策略', 'paper.plan.json'), 'utf8'))
  assert.equal(plan.materialType, '论文文献')
  assert.match(fs.readFileSync(path.join(storageDir, '论文策略', 'paper.source.md'), 'utf8'), /Ghost/, '归档保留原始参考文献，只从生成上下文排除')
})

test('生成结果只写入内部资料库，不修改输入目录', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-storage-'))
  const inputDir = path.join(tempRoot, '用户输入')
  const dataDir = path.join(tempRoot, 'project', 'data')
  const storageDir = path.join(dataDir, '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const inputFile = path.join(inputDir, '示例.txt')
  fs.writeFileSync(inputFile, '这是一份用于验证输入目录和输出目录分离的学习资料。', 'utf8')
  const inputBefore = fs.readdirSync(inputDir)
  const mockLlm = await createMockLlm()
  t.after(() => {
    mockLlm.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generate({
    dataDir,
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: true,
    browserPath: 'mock-browser',
  }, {
    rel: inputFile,
    outputDir: inputDir, // 模拟旧客户端传参：后端也必须忽略它。
    course: '测试课程',
    html: true,
    pptx: false,
    job: 'storage-test',
  }, {
    checkHtml: async () => ({ ok: false, error: '模拟浏览器自检不可用', problems: [] }),
  })

  assert.equal(result.ok, true, result.error)
  assert.deepEqual(fs.readdirSync(inputDir), inputBefore)
  assert.equal(fs.existsSync(path.join(inputDir, '学习资料')), false)
  assert.equal(fs.existsSync(path.join(storageDir, '学习中心.html')), true)
  assert.equal(fs.existsSync(path.join(storageDir, '测试课程', '示例.course.html')), true)
  assert.equal(fs.existsSync(path.join(storageDir, '测试课程', '示例.source.md')), true)
  assert.equal(fs.existsSync(path.join(storageDir, '术语库.html')), true)
  assert.equal(result.indexUrl, '/api/study-assistant/learning-center')
  assert.match(result.files.html.url, /^\/study-assistant\/file\?p=/)
  assert.equal(result.performance.rounds, 1, '自检基础设施失败不应触发第二轮生成')
  assert.equal(result.performance.llmCalls, 6, '大纲、小节、小结、术语、审稿、局部修复各调用一次')
  assert.equal(result.performance.reviewProblems, 1)
  assert.equal(result.performance.fixesApplied, 1)
  assert.equal(result.check.skipped, true)
  assert.match(result.check.error, /模拟浏览器自检不可用/)
  let centerHtml = fs.readFileSync(path.join(storageDir, '学习中心.html'), 'utf8')
  assert.match(centerHtml, /测试课程\/示例\.course\.html/)
  assert.match(centerHtml, /href='术语库\.html'/)
  assert.match(centerHtml, /<summary><span class='ix-title'>测试课程<\/span>/)
  assert.match(centerHtml, /打开 HTML/)

  const pptOnlyDir = path.join(storageDir, '旧科目', '仅PPT课程')
  fs.mkdirSync(pptOnlyDir, { recursive: true })
  fs.writeFileSync(path.join(pptOnlyDir, '仅PPT.slides.pptx'), 'test', 'utf8')
  fs.writeFileSync(path.join(pptOnlyDir, '仅PPT.plan.json'), JSON.stringify({ title: '仅 PPT 课程', difficulty: '入门' }), 'utf8')
  refreshLearningCenter(storageDir)
  centerHtml = fs.readFileSync(path.join(storageDir, '学习中心.html'), 'utf8')
  assert.match(centerHtml, /旧科目\/仅PPT课程\/仅PPT\.slides\.pptx/)
  assert.match(centerHtml, /下载 PPTX/)
  assert.deepEqual(scanCourseLocations(storageDir).map(item => item.rel).sort(), ['旧科目/仅PPT课程', '测试课程'])

  fs.writeFileSync(path.join(storageDir, '测试课程', '第二份.course.html'), '<html></html>', 'utf8')
  fs.writeFileSync(path.join(storageDir, '测试课程', '第二份.plan.json'), JSON.stringify({ title: '第二份课件', difficulty: '进阶' }), 'utf8')
  refreshLearningCenter(storageDir)
  centerHtml = fs.readFileSync(path.join(storageDir, '学习中心.html'), 'utf8')
  assert.equal((centerHtml.match(/<details class='ix-course'>/g) || []).length, 2, '每门课程只显示一张课程卡')
  assert.match(centerHtml, /2 份课件/)
  assert.match(centerHtml, /第二份课件/)
})

test('单个小节最多调用两次，失败后不进入嵌套补生成', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-retry-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const inputFile = path.join(inputDir, 'retry.txt')
  fs.writeFileSync(inputFile, '测试失败重试上限。', 'utf8')
  let sectionCalls = 0
  const mockLlm = await createMockLlm(prompt => {
    if (prompt.includes('【当前任务】') || prompt.includes('【重试兜底】')) {
      sectionCalls++
      return '这不是合法 JSON'
    }
    return mockAnswer(prompt)
  })
  t.after(() => {
    mockLlm.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generate({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: false,
    browserPath: '',
  }, {
    rel: inputFile,
    course: '重试',
    html: false,
    pptx: false,
    job: 'retry-test',
  })

  assert.equal(result.ok, false)
  assert.equal(sectionCalls, 2)
  assert.equal(result.performance.llmCalls, 3, '所有小节失败后应提前结束，不再空跑小结和术语调用')
  assert.match(result.error, /所有小节都无法解析/)
})

test('可定位的排版问题最多触发一轮定向重生成', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-rounds-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const inputFile = path.join(inputDir, 'rounds.txt')
  fs.writeFileSync(inputFile, '测试定向修正轮次。', 'utf8')
  const mockLlm = await createMockLlm()
  let checkCalls = 0
  t.after(() => {
    mockLlm.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generate({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: true,
    browserPath: 'mock-browser',
  }, {
    rel: inputFile,
    course: '轮次',
    html: true,
    pptx: false,
    job: 'rounds-test',
  }, {
    checkHtml: async () => {
      checkCalls++
      return checkCalls === 1
        ? { ok: true, problems: ['第3页内容占比20%（太空）'] }
        : { ok: true, problems: [] }
    },
  })

  assert.equal(result.ok, true, result.error)
  assert.equal(result.performance.rounds, 2)
  assert.equal(checkCalls, 2)
  assert.equal(result.performance.llmCalls, 11)
})

test('简明模式强制限制小节数与每节页数', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-concise-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const inputFile = path.join(inputDir, 'concise.txt')
  fs.writeFileSync(inputFile, '测试简明模式输出规模。', 'utf8')
  const sixSlides = Array.from({ length: 6 }, (_, index) => ({ title: '页面' + (index + 1), blocks: [{ type: 'text', content: '简明内容' }] }))
  const mockLlm = await createMockLlm(prompt => {
    if (prompt.includes('【第一步】')) {
      return JSON.stringify({ title: '简明课程', sections: Array.from({ length: 6 }, (_, index) => ({ heading: '小节' + (index + 1), keyPoints: ['要点'] })) })
    }
    if (prompt.includes('【当前任务】') || prompt.includes('【重试兜底】')) return JSON.stringify(sixSlides)
    if (prompt.includes('你是学生审稿员')) return JSON.stringify({ problems: [] })
    return mockAnswer(prompt)
  })
  t.after(() => {
    mockLlm.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generate({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: false,
    browserPath: '',
  }, {
    rel: inputFile,
    course: '简明',
    depth: 'concise',
    html: false,
    pptx: false,
    job: 'concise-test',
  })

  assert.equal(result.ok, true, result.error)
  const plan = JSON.parse(fs.readFileSync(path.join(storageDir, '简明', 'concise.plan.json'), 'utf8'))
  assert.equal(plan.slides.length, 15, '封面 + 大纲 + 4小节×3页 + 小结')
  assert.equal(result.performance.llmCalls, 8)
})

test('多文件任务实时上报当前文件阶段，不再产生批量队列阶段', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-progress-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const firstFile = path.join(inputDir, '第一份.txt')
  const secondFile = path.join(inputDir, '第二份.txt')
  fs.writeFileSync(firstFile, '第一份测试资料。', 'utf8')
  fs.writeFileSync(secondFile, '第二份测试资料。', 'utf8')
  const mockLlm = await createMockLlm()
  const job = 'current-file-progress-test'
  t.after(() => {
    mockLlm.close()
    jobStatus.delete(job)
    jobStatus.delete(job + '#0')
    jobStatus.delete(job + '#1')
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generateBatch({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: false,
    browserPath: '',
  }, {
    files: [firstFile, secondFile],
    course: '进度',
    html: false,
    pptx: false,
    job,
  })

  assert.equal(result.ok, true, result.error)
  const parent = jobStatus.get(job)
  assert.equal(parent.currentFile, '第二份.txt')
  assert.equal(parent.timeline.some(event => event.stage === 'batch'), false)
  assert.equal(parent.timeline.some(event => event.stage === 'outline' && event.currentFile === '第一份.txt'), true)
  assert.equal(parent.timeline.some(event => event.stage === 'sections' && event.currentFile === '第二份.txt'), true)
  assert.equal(parent.timeline.filter(event => event.stage === 'done').length, 1)
})

test('多文件可以合并为一套课件并保存来源清单', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assistant-combined-'))
  const inputDir = path.join(tempRoot, 'input')
  const storageDir = path.join(tempRoot, 'data', '学习资料')
  fs.mkdirSync(inputDir, { recursive: true })
  const firstFile = path.join(inputDir, '第一章.txt')
  const secondFile = path.join(inputDir, '第二章.txt')
  fs.writeFileSync(firstFile, 'Alpha introduces the input side of the system.', 'utf8')
  fs.writeFileSync(secondFile, 'Beta explains the output side and validation.', 'utf8')
  const mockLlm = await createMockLlm()
  const job = 'combined-sources-test'
  t.after(() => {
    mockLlm.close()
    jobStatus.delete(job)
    jobStatus.delete(job + '#combined')
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const address = mockLlm.address()
  const result = await generateBatch({
    dataDir: path.join(tempRoot, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' },
    enableSelfCheck: false,
    browserPath: '',
  }, {
    files: [firstFile, secondFile],
    mode: 'combined',
    outputName: '合并课程',
    course: '综合测试',
    html: true,
    pptx: false,
    job,
  })

  assert.equal(result.ok, true, result.error)
  assert.equal(result.batch, undefined, '合并模式应返回单套课件，而不是批量结果列表')
  assert.equal(result.performance.sourceCount, 2)
  const courseDir = path.join(storageDir, '综合测试')
  const source = fs.readFileSync(path.join(courseDir, '合并课程.source.md'), 'utf8')
  assert.match(source, /【S1｜第一章\.txt】/)
  assert.match(source, /【S2｜第二章\.txt】/)
  const plan = JSON.parse(fs.readFileSync(path.join(courseDir, '合并课程.plan.json'), 'utf8'))
  assert.deepEqual(plan.sources.map(item => item.name), ['第一章.txt', '第二章.txt'])
  assert.deepEqual(plan.outline[0].sourceRefs, ['S1', 'S2'])
  assert.equal(plan.slides.filter(slide => slide.title === '资料来源').length, 1)
  assert.equal(fs.existsSync(path.join(courseDir, '第一章.course.html')), false)
  assert.equal(fs.existsSync(path.join(courseDir, '第二章.course.html')), false)
})
