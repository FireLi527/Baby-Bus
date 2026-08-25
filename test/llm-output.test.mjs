import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { callLlm, parseSseLine, testLlm } from '../server/llm.js'
import { deduplicateCourseSlides, findFigureTeachingProblems, normalizeCourseSlides, normalizeDisplayLatex, paginateCourseSlides, parseCourse, parseCourseArray } from '../server/parse.js'
import { bindEvidenceSlides, replaceFigureTeachingOnly } from '../server/pipeline.js'

test('思考模型的 reasoning_content 不会污染最终 JSON', async t => {
  let requestBody = null
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '先分析 [这不是 JSON]，再组织答案。' } }] }) + '\n\n')
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '[{"title":"有效页面","blocks":[]}]' } }] }) + '\n\n')
    res.end('data: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  const output = await callLlm({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'test',
    model: 'deepseek-v4-pro',
  }, { system: 'system', user: 'user', timeoutMs: 5000 })

  assert.equal(output, '[{"title":"有效页面","blocks":[]}]')
  assert.equal(parseCourseArray(output)?.[0]?.title, '有效页面')
  assert.deepEqual(requestBody.thinking, { type: 'disabled' })
})

test('通用连接测试接受合法但被 token 上限截断的推理流', async t => {
  let requestBody = null
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '正在思考' } }] }) + '\n\n')
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] }) + '\n\n')
    res.end('data: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  const result = await testLlm({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'test',
    model: 'generic-reasoning-model',
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(requestBody.max_tokens, 64)
  assert.equal('thinking' in requestBody, false, '未知厂商模型不应收到 DeepSeek 私有参数')
})

test('DeepSeek V4 视觉实验模型关闭默认思考以保留生成预算', async t => {
  let requestBody = null
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  await testLlm({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'test',
    model: 'deepseek-v4-flash-vision-exp',
  })
  assert.deepEqual(requestBody.thinking, { type: 'disabled' })
})

test('SSE 最后一段没有换行时仍保留模型正文', async t => {
  const server = http.createServer(async (req, res) => {
    for await (const _ of req) {}
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '完整结尾' } }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const output = await callLlm({ baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'mock' }, { system: 's', user: 'u', timeoutMs: 5000 })
  assert.equal(output, '完整结尾')
  assert.equal(parseSseLine('event: ping'), null)
})

test('支持视觉的兼容接口会收到带资源编号的图片输入', async t => {
  let requestBody = null
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '看到了资料图' } }] }) + '\n\ndata: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const output = await callLlm({ baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'vision-test' }, {
    system: 's',
    user: '请讲图',
    images: [{ label: 'S1-P6-F1（原资料第 6 页）', dataUrl: 'data:image/png;base64,AA==' }],
    timeoutMs: 5000,
  })
  const content = requestBody.messages.find(message => message.role === 'user').content
  assert.equal(output, '看到了资料图')
  assert.ok(Array.isArray(content))
  assert.match(content[1].text, /S1-P6-F1/)
  assert.equal(content[2].image_url.url, 'data:image/png;base64,AA==')
})

test('纯文本兼容接口拒绝图片时只回退一次并继续生成', async t => {
  const bodies = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (bodies.length === 1) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'image input unsupported' } }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '纯文本结果' } }] }) + '\n\ndata: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const output = await callLlm({ baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'text-only-fallback-test' }, {
    system: 's', user: 'u', images: [{ label: 'S1-P1-F1', dataUrl: 'data:image/png;base64,AA==' }], timeoutMs: 5000,
  })
  assert.equal(output, '纯文本结果')
  assert.equal(bodies.length, 2)
  assert.ok(Array.isArray(bodies[0].messages[1].content))
  assert.equal(bodies[1].messages[1].content, 'u')
})

test('JSON 解析会跳过前置的无效括号文本', () => {
  const slides = parseCourseArray('分析 [第1步] 完成。最终答案：[{"title":"课件页","blocks":[]}]')
  const outline = parseCourse('说明 {不是 JSON}，最终答案：{"title":"课程","sections":[]}')
  assert.equal(slides?.[0]?.title, '课件页')
  assert.equal(outline?.title, '课程')
})

test('渲染前会过滤空白或未知内容块并兼容简写例题', () => {
  const slides = normalizeCourseSlides([
    { title: '有效页', blocks: [{ type: 'unknown', content: '不会渲染' }, { type: 'example', content: '计算 1+1' }] },
    { title: '空页', blocks: [{ type: 'unknown', content: '不会渲染' }] },
  ])
  assert.equal(slides.length, 1)
  assert.equal(slides[0].blocks.length, 1)
  assert.equal(slides[0].blocks[0].problem, '计算 1+1')
})

test('裸 LaTeX 在生成结果进入渲染前会补全展示定界符', () => {
  assert.equal(normalizeDisplayLatex('\\sigma(c \\cdot w)'), '$$\\sigma(c \\cdot w)$$')
  assert.equal(normalizeDisplayLatex('$x+y$'), '$$x+y$$')
  assert.equal(normalizeDisplayLatex('\\[x+y\\]'), '\\[x+y\\]')
  assert.equal(normalizeDisplayLatex('两个结果分别是 $x$ 和 $y$'), '两个结果分别是 $x$ 和 $y$')
  assert.equal(normalizeDisplayLatex('```latex\n\\frac{a}{b}\n```'), '$$\\frac{a}{b}$$')

  const slides = normalizeCourseSlides([{
    title: '公式归一化',
    blocks: [
      { type: 'formula', latex: '\\frac{1}{1+\\exp(-x)}', note: 'sigmoid' },
      { type: 'derivation', steps: [{ latex: '\\frac{\\partial L}{\\partial w}', why: '应用链式法则' }] },
    ],
  }])
  assert.equal(slides[0].blocks[0].latex, '$$\\frac{1}{1+\\exp(-x)}$$')
  assert.equal(slides[0].blocks[1].steps[0].latex, '$$\\frac{\\partial L}{\\partial w}$$')
})

test('表格与图片只能绑定到解析器提供的证据，表格数值由原始提取结果覆盖', () => {
  const normalized = normalizeCourseSlides([{ title: '结构化证据', blocks: [
    { type: 'table', sourceTableId: 'S1-P3-T1', headers: [], rows: [], caption: '模型说明' },
    { type: 'figure', assetId: 'S1-P5-F1', caption: '原图' },
    { type: 'figure', assetId: 'S1-P9-F9', caption: '不存在的图' },
  ] }])
  const sources = [{
    tables: [{ id: 'S1-P3-T1', headers: ['词', '次数'], rows: [['data', '7']], caption: '原始计数表' }],
    assets: [{ id: 'S1-P5-F1', dataUrl: 'data:image/png;base64,AA==', caption: '资料图' }],
  }]
  const slides = bindEvidenceSlides(normalized, sources)
  assert.deepEqual(slides[0].blocks[0].headers, ['词', '次数'])
  assert.deepEqual(slides[0].blocks[0].rows, [['data', '7']])
  assert.equal(slides[0].blocks[0].caption, '原始计数表')
  assert.equal(slides[0].blocks[1].assetId, 'S1-P5-F1')
  assert.equal(slides[0].blocks.length, 2, '不存在的资源编号必须被删除')
})

test('图片讲解结构会被保留，图注本身不能通过教学门禁', () => {
  const slides = normalizeCourseSlides([
    { title: '只贴图', blocks: [{ type: 'figure', assetId: 'S1-P1-F1', caption: '流程示意图', alt: '一张图' }] },
    { title: '逐项讲图', blocks: [{
      type: 'figure', assetId: 'S1-P2-F1', caption: '链式法则', alt: '反向传播图',
      guide: [
        { label: '前向计算', content: '从左侧输入沿黑色连线依次经过两层加权和激活，右侧得到预测值。' },
        { label: '红色求导', content: '右下角把损失对第三层权重的导数拆成两个局部导数相乘，展示链式法则。' },
      ],
      takeaway: '反向传播把一条长依赖链拆成可重复计算的局部梯度。',
    }] },
  ])
  assert.equal(slides[1].blocks[0].guide.length, 2)
  assert.deepEqual(findFigureTeachingProblems(slides).map(problem => problem.page), [1])
  assert.equal(findFigureTeachingProblems(slides)[0].blockIndex, 0)

  const before = JSON.stringify(slides[0])
  const repaired = replaceFigureTeachingOnly(slides, {
    page: 1,
    blockIndex: 0,
    assetId: 'S1-P1-F1',
    guide: [
      { label: '左侧输入框', content: '左侧输入框承接原始数据，黑色箭头把数据送入中间处理区域，表示计算从这里开始。' },
      { label: '右侧输出框', content: '右侧输出框接收中间区域的处理结果，与左侧输入形成完整的读取顺序。' },
    ],
    takeaway: '图中从左到右的连接关系说明数据经过中间处理后形成输出。',
    title: '模型试图篡改标题',
    caption: '模型试图篡改图注',
  })
  assert.equal(repaired.applied, true)
  assert.equal(JSON.stringify(slides[0]), before, '修复函数不应原地修改输入')
  assert.equal(repaired.slides[0].title, slides[0].title)
  assert.equal(repaired.slides[0].blocks[0].caption, slides[0].blocks[0].caption)
  assert.equal(repaired.slides[0].blocks[0].alt, slides[0].blocks[0].alt)
  assert.equal(repaired.slides[0].blocks[0].assetId, slides[0].blocks[0].assetId)
  assert.equal(JSON.parse(before).title, repaired.slides[0].title)
  assert.equal(repaired.slides[0].blocks[0].guide.length, 2)
})

test('过密页会按内容块稳定拆页并保留顺序', () => {
  const slides = paginateCourseSlides([{ title: '小结', blocks: [
    { type: 'intuition', content: '直觉说明'.repeat(20) },
    { type: 'bullets', items: Array.from({ length: 7 }, (_, index) => '核心要点' + index + '，' + '详细解释'.repeat(12)) },
    { type: 'walkthrough', title: '自己试试', steps: Array.from({ length: 4 }, (_, index) => ({ text: '第' + index + '步，' + '计算过程'.repeat(15) })) },
  ] }])
  assert.ok(slides.length >= 2)
  assert.equal(slides[0].title, '小结')
  assert.match(slides[1].title, /（续）/)
  assert.ok(slides.every(slide => slide.blocks.length > 0))
})

test('很短的同标题续页会合回前页并由单页纵向滚动承载', () => {
  const slides = paginateCourseSlides([
    { title: '贝叶斯更新', blocks: [{ type: 'text', content: '先验' }, { type: 'formula', latex: '$$p(\\theta|x)$$' }, { type: 'text', content: '后验' }] },
    { title: '贝叶斯更新（续）', blocks: [{ type: 'note', title: '注意', content: '条件必须与资料一致。' }] },
  ])
  assert.equal(slides.length, 1)
  assert.equal(slides[0].blocks.length, 4)
})

test('跨小节同图同结论且没有新增原页依据时删除重复页', () => {
  const slides = deduplicateCourseSlides([
    { kind: 'cover' },
    {
      title: '给词向量加权并度量相似度：TF-IDF 加权和余弦相似度（续）',
      sourceAnchors: ['S1:PAGE 23'],
      blocks: [{
        type: 'figure', assetId: 'S1-P23-F2', caption: '二维平面上的词向量',
        guide: [{ label: '看坐标轴', content: '横轴是 data，纵轴是 computer。' }],
        takeaway: '两个词向量方向越接近，余弦相似度越高，说明两个词越相关。',
      }],
    },
    {
      title: 'TF-IDF 加权与余弦相似度（续）',
      sourceAnchors: [],
      blocks: [{
        type: 'figure', assetId: 'S1-P23-F2', caption: '二维平面上的两个词向量',
        guide: [{ label: '比较两个方向', content: '两个向量方向接近，因此余弦相似度高。' }],
        takeaway: '向量方向越接近，余弦相似度越高，表示两个词越相关。',
      }],
    },
  ])
  assert.equal(slides.length, 2)
  assert.deepEqual(slides[1].sourceAnchors, ['S1:PAGE 23'])
})

test('同一资料图讲解不同区域并产生不同结论时允许复用', () => {
  const slides = deduplicateCourseSlides([
    {
      title: '先读网络输入层', sourceAnchors: ['S1:PAGE 8'],
      blocks: [{ type: 'figure', assetId: 'S1-P8-F1', guide: [{ label: '左侧输入', content: '输入节点接收特征。' }], takeaway: '左侧表示模型接收的特征。' }],
    },
    {
      title: '再沿反向箭头计算梯度', sourceAnchors: ['S1:PAGE 9'],
      blocks: [{ type: 'figure', assetId: 'S1-P8-F1', guide: [{ label: '右侧反向箭头', content: '梯度从损失向隐藏层传播。' }], takeaway: '反向箭头表示梯度逐层传播。' }],
    },
  ])
  assert.equal(slides.length, 2)
})
