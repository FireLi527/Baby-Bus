// 使用真实本机浏览器按 file:// 直接打开全部 HTML 课件，验证双击离线使用；不调用模型、不修改课件。
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../server/config.js'
import { checkHtml, findBrowser } from '../server/check.js'

function findHtml(dir, depth, out) {
  if (depth > 10 || !fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findHtml(full, depth + 1, out)
    else if (entry.isFile() && entry.name.endsWith('.course.html')) out.push(full)
  }
}

const cfg = loadConfig()
const browserPath = findBrowser(cfg.edgePath)
if (!browserPath) {
  console.error('未找到 Chrome/Edge，无法执行真实渲染检查')
  process.exit(2)
}
const files = []
findHtml(cfg.storageDir, 0, files)
const results = []
for (const file of files) {
  const check = await checkHtml(file, browserPath)
  results.push({ file: path.relative(cfg.storageDir, file), ok: check.ok, skipped: !!check.skipped, problems: check.problems || [], error: check.error || '', metrics: check.metrics || null })
  const issue = !check.ok || check.skipped || (check.problems && check.problems.length)
  console.log((issue ? 'FAIL ' : 'PASS ') + path.relative(cfg.storageDir, file))
  for (const problem of (check.problems || [])) console.log('  - ' + problem)
  if (check.error) console.log('  - ' + check.error)
}
const failed = results.filter(result => !result.ok || result.skipped || result.error || result.problems.length)
console.log('离线双击检查完成：通过 ' + (results.length - failed.length) + '/' + results.length + '，问题 ' + failed.length + ' 份')
if (failed.length) process.exitCode = 1
