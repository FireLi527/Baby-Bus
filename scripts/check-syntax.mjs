// 对 Node 直接执行的源码逐个做语法检查；React JSX 由 Vite 构建检查。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirs = ['server', 'scripts', 'tools', 'test']
const files = sourceDirs.flatMap(dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:c?js|mjs)$/.test(entry.name))
  .map(entry => path.join(root, dir, entry.name)))
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || ('语法检查失败：' + file + '\n'))
    process.exit(result.status || 1)
  }
}

console.log('语法检查通过：' + files.length + ' 个 Node 源文件')
