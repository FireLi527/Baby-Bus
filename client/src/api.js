// API 封装：统一 JSON 解析与错误可读化
export async function apiJson(r) {
  const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || ''
  if (ct.indexOf('application/json') >= 0) return r.json()
  const t = await r.text()
  throw new Error(t || ('HTTP ' + r.status))
}

export function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(apiJson)
}

export function get(url) {
  return fetch(url).then(apiJson)
}

export const fmtTime = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}
