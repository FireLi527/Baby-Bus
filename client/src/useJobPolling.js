import { useCallback, useEffect, useRef, useState } from 'react'
import { get } from './api.js'

const POLL_DELAY_MS = 1500
const MAX_MISSING_POLLS = 20

/** 串行轮询生成任务；每次请求完成后才安排下一次，避免请求堆叠。 */
export default function useJobPolling(onComplete) {
  const [liveStatus, setLiveStatus] = useState(null)
  const pollRef = useRef(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stopPolling = useCallback(() => {
    const active = pollRef.current
    if (active && active.timer) clearTimeout(active.timer)
    pollRef.current = null
  }, [])

  const finish = useCallback((result) => {
    stopPolling()
    setLiveStatus(null)
    if (typeof onCompleteRef.current === 'function') onCompleteRef.current(result)
  }, [stopPolling])

  const pollJob = useCallback((job) => {
    stopPolling()
    try { localStorage.setItem('la.lastJob', job) } catch (e) {}
    let missing = 0
    const active = { job, timer: null }
    pollRef.current = active

    const tick = async () => {
      try {
        const status = await get('/api/study-assistant/status?job=' + encodeURIComponent(job) + '&_=' + Date.now())
        // 新任务或组件卸载会替换当前令牌；旧请求返回后不得终止或覆盖新任务。
        if (pollRef.current !== active) return
        if (!status || !status.found) {
          missing++
          if (missing > MAX_MISSING_POLLS) finish({ ok: false, error: '任务状态丢失（服务可能已重启），请重新生成' })
        } else {
          missing = 0
          if (status.stage === 'done' || status.stage === 'error') {
            finish(status.result || { ok: false, error: status.detail || '生成失败' })
          } else {
            setLiveStatus(status)
          }
        }
      } catch (e) {
        // 短暂断线时保留当前状态；下一轮继续尝试。
      } finally {
        if (pollRef.current === active) active.timer = setTimeout(tick, POLL_DELAY_MS)
      }
    }
    tick()
  }, [finish, stopPolling])

  const resumeJob = useCallback(async (job) => {
    if (!job) return false
    try {
      const status = await get('/api/study-assistant/status?job=' + encodeURIComponent(job))
      if (!status || !status.found) {
        try { localStorage.removeItem('la.lastJob') } catch (e) {}
        return false
      }
      if (status.stage === 'done' || status.stage === 'error') {
        finish(status.result || { ok: false, error: status.detail || '生成失败' })
        return false
      }
      setLiveStatus(status)
      pollJob(job)
      return true
    } catch (e) {
      return false
    }
  }, [finish, pollJob])

  const beginStatus = useCallback((status) => setLiveStatus(status), [])
  const clearStatus = useCallback(() => setLiveStatus(null), [])

  useEffect(() => stopPolling, [stopPolling])

  return { liveStatus, pollJob, resumeJob, beginStatus, clearStatus, stopPolling }
}
