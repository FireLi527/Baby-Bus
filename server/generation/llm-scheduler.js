// 所有生成任务共享同一个模型调用队列，避免“小节并发 × 图片并发”放大为请求风暴。
export function createScheduler(maxConcurrent = 3) {
  const limit = Math.max(1, Math.floor(Number(maxConcurrent) || 1))
  const queue = []
  let active = 0

  const drain = () => {
    while (active < limit && queue.length) {
      const item = queue.shift()
      active++
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active--
          drain()
        })
    }
  }

  const schedule = task => new Promise((resolve, reject) => {
    if (typeof task !== 'function') {
      reject(new TypeError('scheduled task must be a function'))
      return
    }
    queue.push({ task, resolve, reject })
    drain()
  })

  schedule.stats = () => ({ active, queued: queue.length, limit })
  return schedule
}

export const scheduleLlmCall = createScheduler(3)
