import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { callLlm, parseSseLine } from '../server/llm.js'
import { normalizeCourseSlides, paginateCourseSlides, parseCourse, parseCourseArray } from '../server/parse.js'

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
