import { existsSync } from 'node:fs'
import path, { basename, join } from 'node:path'

export const SUPPORTED = ['.pptx', '.docx', '.xlsx', '.pdf', '.ipynb', '.py', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.ps1', '.bat', '.html', '.css', '.scss', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.r', '.m', '.swift', '.kt', '.kts', '.scala', '.pl', '.lua', '.dart', '.tex', '.log']

export const CT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export function extOf(n) { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i).toLowerCase() }
export function baseName(rel) { const e = extOf(rel); return rel.slice(0, rel.length - e.length) }
export function safeName(s) {
  if (s == null) return ''
  s = String(s).trim()
  if (!s) return ''
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 32) continue
    if (c === 92 || c === 47 || c === 58 || c === 42 || c === 63 || c === 34 || c === 60 || c === 62 || c === 124) continue
    out += s[i]
  }
  return out.slice(0, 80) || '未命名'
}
export function xmlEsc(s) { return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;') }
export function stripLatex(s) { return String(s || '').replace(/\$/g, '').replace(/\\/g, '') }
export function errorMessage(error) { return error instanceof Error ? error.message : String(error) }

export class RequestError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'RequestError'
    this.statusCode = statusCode
  }
}

export function isPathInside(candidate, root) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate))
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))
}

export function withTimeout(p, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('调用超时: ' + (label || 'op'))), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

export function queryParam(req, key) {
  try {
    const url = String(req.url || '')
    const qi = url.indexOf('?')
    if (qi < 0) return ''
    for (const kv of url.slice(qi + 1).split('&')) { const eq = kv.indexOf('='); if (eq > 0 && kv.slice(0, eq) === key) return decodeURIComponent(kv.slice(eq + 1)) }
  } catch (e) {}
  return ''
}

export async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c)
    size += chunk.length
    if (size > maxBytes) throw new RequestError(413, '请求内容过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readJsonBody(req, options = {}) {
  const text = await readBody(req, options.maxBytes)
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('根节点必须是对象')
    return value
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError(400, 'JSON 请求格式错误：' + errorMessage(error))
  }
}

export function json(res, obj) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)) }

export function fileExists(p) { try { return existsSync(p) } catch (e) { return false } }
export { basename, join }
