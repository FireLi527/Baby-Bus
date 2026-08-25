import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'out')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = String(manifest.version || '').trim()
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error('package.json version 无效')
if (process.platform !== 'win32') throw new Error('Windows 便携版只能在 Windows 上构建')

const bundleName = `Baby-Bus-v${version}-windows-x64`
const stage = path.join(OUT, bundleName)
const zipFile = path.join(OUT, bundleName + '.zip')
const checksumFile = zipFile + '.sha256'

function assertInsideOut(target) {
  const relative = path.relative(OUT, path.resolve(target))
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('拒绝清理 out 目录以外的路径：' + target)
  }
}

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) throw new Error(command + ' 执行失败：\n' + (result.stderr || result.stdout || (result.error && result.error.message) || 'unknown error'))
  return result.stdout || ''
}

function runNpm(args, cwd = ROOT) {
  const npmCli = String(process.env.npm_execpath || '')
  if (npmCli && fs.existsSync(npmCli)) return run(process.execPath, [npmCli, ...args], cwd)
  return run('npm.cmd', args, cwd)
}

function createZip(source, destination) {
  const powershell = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const result = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:BAOBAO_RELEASE_STAGE, $env:BAOBAO_RELEASE_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)',
  ], {
    cwd: OUT,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BAOBAO_RELEASE_STAGE: source, BAOBAO_RELEASE_ZIP: destination },
  })
  if (result.status !== 0) throw new Error('创建 ZIP 失败：\n' + (result.stderr || result.stdout || (result.error && result.error.message) || 'unknown error'))
}

function copy(relative) {
  const source = path.join(ROOT, relative)
  const destination = path.join(stage, relative)
  if (!fs.existsSync(source)) throw new Error('缺少发布文件：' + relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, { recursive: true })
}

function walkFiles(dir, prefix = '', output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, relative, output)
    else if (entry.isFile()) output.push(relative.replaceAll('\\', '/'))
  }
  return output
}

runNpm(['run', 'build'])
fs.mkdirSync(OUT, { recursive: true })
for (const target of [stage, zipFile, checksumFile]) {
  assertInsideOut(target)
  fs.rmSync(target, { recursive: true, force: true })
}
fs.mkdirSync(stage, { recursive: true })

for (const relative of [
  '宝宝巴士.exe', 'server', 'dist', 'LICENSES', 'package.json', 'package-lock.json',
  'requirements.txt', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'config.example.json',
]) copy(relative)

fs.mkdirSync(path.join(stage, 'data', '学习资料'), { recursive: true })
fs.writeFileSync(path.join(stage, '首次使用.txt'), [
  '宝宝巴士 Windows 轻量便携版',
  '',
  '1. 安装 Node.js 22.12 或更高版本，并确认 node 命令可用。',
  '2. 安装 Python 3；处理 PDF 前执行：pip install -r requirements.txt',
  '3. 双击“宝宝巴士.exe”，在设置中填写自己的接口地址、API Key 和模型名。',
  '4. 课程资料和生成结果保存在 data/学习资料；发布包不包含任何用户资料或 API Key。',
  '',
  '详细说明与许可证见 README.md、LICENSE、NOTICE 和 THIRD_PARTY_NOTICES.md。',
].join('\r\n'), 'utf8')

runNpm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage)

const files = walkFiles(stage)
const banned = files.filter(file => /^(?:reference|\.runtime|out)\//i.test(file)
  || /^(?:config\.json|\.env(?:\.|$)|startup\.log$)/i.test(file)
  || /^data\/.+/i.test(file))
if (banned.length) throw new Error('发布包含有禁止文件：' + banned.slice(0, 10).join('、'))
for (const required of [
  '宝宝巴士.exe', 'server/index.js', 'dist/index.html', 'node_modules/katex/package.json',
  'node_modules/reveal.js/package.json', 'node_modules/ws/package.json', '首次使用.txt',
]) {
  if (!files.includes(required)) throw new Error('发布包缺少运行文件：' + required)
}
for (const developmentOnly of ['node_modules/react/package.json', 'node_modules/vite/package.json', 'node_modules/@vitejs/plugin-react/package.json']) {
  if (files.includes(developmentOnly)) throw new Error('发布包混入开发依赖：' + developmentOnly)
}

createZip(stage, zipFile)
const digest = crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex')
fs.writeFileSync(checksumFile, digest + '  ' + path.basename(zipFile) + '\r\n', 'utf8')

console.log('发布包：' + zipFile)
console.log('文件数：' + files.length)
console.log('大小：' + (fs.statSync(zipFile).size / 1024 / 1024).toFixed(2) + ' MB')
console.log('SHA-256：' + digest)
