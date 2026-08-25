// OpenAI 兼容 LLM 客户端（流式）。DeepSeek / OpenAI / Moonshot / 通义 / 智谱 等均可通过 baseUrl+apiKey+model 配置。
import { withTimeout } from './util.js'

export function parseSseLine(rawLine) {
  const line = String(rawLine || '').trim()
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload) return null
  if (payload === '[DONE]') return { done: true, piece: '', finishReason: '' }
  try {
    const data = JSON.parse(payload)
    const choice = data.choices && data.choices[0]
    const delta = choice && choice.delta
    return {
      done: false,
      piece: String(delta && delta.content || ''),
      finishReason: String(choice && choice.finish_reason || ''),
    }
  } catch (error) {
    return null
  }
}

/** 把 OpenAI 兼容的 SSE 流转换为文本增量异步迭代器 */
export async function* streamChat(cfg, { system, user, temperature = 0.3, maxTokens = 8000, timeoutMs = 240000 }) {
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '')
  const url = baseUrl ? `${baseUrl}/chat/completions` : 'https://api.deepseek.com/v1/chat/completions'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    const payload = {
      model: cfg.model,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }
    // V4 默认开启 high 级思考；课件链路需要大量严格 JSON，关闭思考可避免
    // reasoning_content 消耗输出预算并显著降低批量生成延迟。
    if (/^deepseek-v4-(?:pro|flash)$/i.test(String(cfg.model || ''))) {
      payload.thinking = { type: 'disabled' }
    }
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + String(cfg.apiKey || ''),
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    clearTimeout(timer)
    throw new Error('LLM 请求失败: ' + (e && e.message || e))
  }
  if (!res.ok) {
    clearTimeout(timer)
    const body = await res.text().catch(() => '')
    const error = new Error('LLM 接口返回 ' + res.status + ': ' + body.slice(0, 300))
    error.status = res.status
    const retryAfter = Number(res.headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000
    throw error
  }
  try {
    if (!res.body) throw new Error('LLM 接口没有返回响应流')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let finishReason = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        const event = parseSseLine(line)
        if (!event) continue
        if (event.finishReason) finishReason = event.finishReason
        if (event.done) {
          if (finishReason === 'length') throw new Error('LLM 输出达到 token 上限，最终 JSON 可能不完整')
          return
        }
        // 思考模型会先返回 reasoning_content，再返回最终 content。
        // 生成链路只能解析最终答案；拼入思考过程会污染 JSON。
        if (event.piece) yield event.piece
      }
    }
    buf += decoder.decode()
    const finalEvent = parseSseLine(buf)
    if (finalEvent) {
      if (finalEvent.finishReason) finishReason = finalEvent.finishReason
      if (finalEvent.done && finishReason === 'length') throw new Error('LLM 输出达到 token 上限，最终 JSON 可能不完整')
      if (finalEvent.piece) yield finalEvent.piece
    }
    if (finishReason === 'length') throw new Error('LLM 输出达到 token 上限，最终 JSON 可能不完整')
  } finally {
    clearTimeout(timer)
  }
}

/** 收集完整文本 */
export async function callLlm(cfg, opts) {
  let raw = ''
  for await (const piece of streamChat(cfg, opts)) raw += piece
  if (!raw) throw new Error('LLM 返回为空')
  return raw
}

/** 配置连通性测试：发一条 1-token 请求 */
export async function testLlm(cfg) {
  await withTimeout((async () => {
    let n = 0
    for await (const _ of streamChat(cfg, { system: 'ping', user: 'pong', maxTokens: 4, timeoutMs: 20000 })) { n++ }
    if (!n) throw new Error('无输出')
  })(), 25000, 'llm-test')
  return { ok: true }
}
