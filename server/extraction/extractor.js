// Python 提取/打包适配器：异步运行，避免阻塞本地 HTTP 服务的事件循环。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { PY } from '../embedded.mjs'

const DEFAULT_TIMEOUT_MS = 120000
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024

export function workerPath() {
  const revision = createHash('sha256').update(PY, 'utf8').digest('hex').slice(0, 12)
  const file = path.join(tmpdir(), 'baobao_extract_' + revision + '.py')
  if (!fs.existsSync(file)) fs.writeFileSync(file, PY, 'utf8')
  return file
}

export function runPython(manifest, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS)
  const maxBuffer = Math.max(1024, Number(options.maxBuffer) || DEFAULT_MAX_BUFFER)

  return new Promise(resolve => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let timedOut = false
    let overflowed = false
    let proc

    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    try {
      proc = spawn('python', [workerPath()], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }

    const timer = setTimeout(() => {
      timedOut = true
      try { proc.kill() } catch (error) {}
    }, timeoutMs)
    timer.unref?.()

    const append = (kind, chunk) => {
      const text = chunk.toString('utf8')
      outputBytes += Buffer.byteLength(text)
      if (outputBytes > maxBuffer) {
        overflowed = true
        try { proc.kill() } catch (error) {}
        return
      }
      if (kind === 'stdout') stdout += text
      else stderr += text
    }

    proc.stdout.on('data', chunk => append('stdout', chunk))
    proc.stderr.on('data', chunk => append('stderr', chunk))
    proc.on('error', error => finish({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    proc.on('close', code => {
      if (timedOut) { finish({ ok: false, error: 'Python 执行超时（' + timeoutMs + 'ms）' }); return }
      if (overflowed) { finish({ ok: false, error: 'Python 输出超过限制（' + maxBuffer + ' bytes）' }); return }
      if (code !== 0) { finish({ ok: false, error: (stderr || stdout || ('Python 退出码 ' + code)).trim() }); return }
      try {
        finish(JSON.parse(stdout))
      } catch (error) {
        finish({ ok: false, error: 'Python 返回无法解析: ' + (stderr || stdout || String(error)).slice(0, 2000) })
      }
    })

    try {
      proc.stdin.end(JSON.stringify(manifest))
    } catch (error) {
      try { proc.kill() } catch (killError) {}
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })
}
