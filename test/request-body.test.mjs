import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import test from 'node:test'
import { activeJobCount, completeJob, jobStatus, report } from '../server/jobs.js'
import { handle, setRuntimeCfg } from '../server/routes.js'
import { readJsonBody } from '../server/util.js'

function requestFrom(chunks) {
  return Readable.from(chunks)
}

test('JSON 请求体必须是对象，并为格式错误返回可识别的 400 错误', async () => {
  await assert.rejects(
    readJsonBody(requestFrom(['{broken'])),
    error => error && error.statusCode === 400 && /JSON 请求格式错误/.test(error.message),
  )
  await assert.rejects(
    readJsonBody(requestFrom(['[1,2,3]'])),
    error => error && error.statusCode === 400 && /根节点必须是对象/.test(error.message),
  )
})

test('请求体按实际字节限制大小，避免大请求无限占用内存', async () => {
  const json = '{"名称":"课件"}'
  const bytes = Buffer.byteLength(json)
  const valid = await readJsonBody(requestFrom([json]), { maxBytes: bytes })
  assert.equal(valid.名称, '课件')
  await assert.rejects(
    readJsonBody(requestFrom([json]), { maxBytes: bytes - 1 }),
    error => error && error.statusCode === 413 && /请求内容过大/.test(error.message),
  )
})

test('API 把无效 JSON 明确返回为 400，而不是模糊的服务器错误', async t => {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const response = await fetch(`http://127.0.0.1:${address.port}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  })
  const body = await response.json()
  assert.equal(response.status, 400)
  assert.equal(body.ok, false)
  assert.match(body.error, /JSON 请求格式错误/)
})

test('任务仓库清理历史记录时保留仍在运行的任务', () => {
  jobStatus.clear()
  report('active-job', 'queued', '任务已提交')
  for (let index = 0; index < 205; index++) {
    const id = 'finished-' + index
    report(id, 'running', '处理中')
    completeJob(id, { ok: true })
  }
  assert.equal(activeJobCount(), 1)
  assert.equal(jobStatus.get('active-job')?.stage, 'queued')
  assert.ok(jobStatus.size <= 200)
  jobStatus.clear()
})

test('生成接口提交任务时可以立即登记 queued 状态', async t => {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
  })
  setRuntimeCfg({})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const job = 'route-queued-' + Date.now()
  const response = await fetch(`http://127.0.0.1:${address.port}/api/study-assistant/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.started, true)
  assert.equal(body.job, job)
  assert.ok(jobStatus.has(job))
  jobStatus.clear()
})
