import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32') {
  console.log('轻量桌面启动器仅在 Windows 上构建，已跳过。')
  process.exit(0)
}

const windowsDir = process.env.WINDIR || 'C:\\Windows'
const candidates = [
  path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windowsDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
]
const compiler = candidates.find(candidate => fs.existsSync(candidate))
if (!compiler) throw new Error('未找到 Windows 自带的 .NET Framework C# 编译器。')

const source = path.join(root, 'launcher', 'BaobaoBusLauncher.cs')
const output = path.join(root, '宝宝巴士.exe')
const result = spawnSync(compiler, [
  '/nologo',
  '/target:winexe',
  '/optimize+',
  '/platform:anycpu',
  '/codepage:65001',
  '/reference:System.Windows.Forms.dll',
  '/out:' + output,
  source,
], { cwd: root, encoding: 'utf8', windowsHide: true })

if (result.status !== 0) {
  throw new Error('轻量启动器编译失败：\n' + (result.stderr || result.stdout || 'unknown csc error'))
}
console.log('轻量启动器：' + path.basename(output) + '（' + Math.ceil(fs.statSync(output).size / 1024) + ' KB）')
