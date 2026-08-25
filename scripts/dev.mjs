// 开发启动器：同时拉起后端与 Vite，并确保任一进程退出时清理另一个进程。
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath
const children = new Map()
let stopping = false
let exitCode = 0

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  exitCode = Number.isInteger(code) ? code : 1
  process.exitCode = exitCode
  for (const child of children.values()) {
    if (!child.killed) child.kill()
  }
  if (!children.size) process.exit(exitCode)
  setTimeout(() => process.exit(exitCode), 2500).unref()
}

function run(name, args) {
  const child = spawn(node, args, { cwd: root, stdio: 'inherit' })
  children.set(name, child)
  child.once('error', error => {
    console.error('[dev] ' + name + ' 启动失败: ' + error.message)
    shutdown(1)
  })
  child.once('exit', code => {
    children.delete(name)
    if (!stopping) {
      console.log('[dev] ' + name + ' 退出: ' + code)
      shutdown(code === 0 ? 0 : 1)
    } else if (!children.size) process.exit(exitCode)
  })
}

process.once('SIGINT', () => shutdown(0))
process.once('SIGTERM', () => shutdown(0))
process.once('exit', () => {
  for (const child of children.values()) if (!child.killed) child.kill()
})

run('server', ['server/index.js'])
run('vite', ['node_modules/vite/bin/vite.js', '--host', '--open'])
