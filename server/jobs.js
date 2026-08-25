// 任务状态仓库：统一维护阶段、诊断事件和异步任务的最终结果。
import { errorMessage } from './util.js'

const MAX_JOBS = 200
const TERMINAL_STAGES = new Set(['done', 'error'])

export const jobStatus = new Map()

function ensureJob(jobId) {
  let record = jobStatus.get(jobId)
  if (record) return record

  record = { started: Date.now(), timeline: [] }
  jobStatus.set(jobId, record)
  if (jobStatus.size > MAX_JOBS) {
    for (const [id, candidate] of jobStatus) {
      if (jobStatus.size <= MAX_JOBS) break
      if (id !== jobId && TERMINAL_STAGES.has(candidate.stage)) jobStatus.delete(id)
    }
  }
  return record
}

export function report(jobId, stage, detail, meta = {}) {
  if (!jobId) return
  const record = ensureJob(jobId)
  const at = Date.now()
  const message = detail || ''
  record.stage = stage
  record.detail = message
  record.at = at
  if (meta.currentFile !== undefined) record.currentFile = meta.currentFile
  record.timeline.push({ stage, detail: message, at, ...meta })
}

/** 只记录诊断事件，不改变用户看到的当前阶段。 */
export function trace(jobId, stage, detail, meta = {}) {
  if (!jobId) return
  const record = ensureJob(jobId)
  record.timeline.push({
    stage,
    detail: detail || '',
    at: Date.now(),
    currentFile: record.currentFile || '',
    ...meta,
  })
}

export function completeJob(jobId, result, failureDetail = '') {
  if (!jobId) return
  const record = ensureJob(jobId)
  record.result = result
  if (result && result.ok) {
    if (!TERMINAL_STAGES.has(record.stage)) report(jobId, 'done', '生成完成')
    return
  }
  report(jobId, 'error', failureDetail || (result && result.error) || '生成失败', {
    currentFile: record.currentFile || '',
  })
}

export function rejectJob(jobId, error) {
  const message = errorMessage(error)
  completeJob(jobId, { ok: false, error: message }, message)
}

export function activeJobCount() {
  let count = 0
  for (const [id, record] of jobStatus) {
    if (!id.includes('#') && record.stage && !TERMINAL_STAGES.has(record.stage)) count++
  }
  return count
}
