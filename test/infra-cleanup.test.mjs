import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

function source(relative) {
  return fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8')
}

test('Node 语法检查递归扫描源码目录', () => {
  const checker = source('scripts/check-syntax.mjs')
  assert.match(checker, /function nodeSources\(dir\)/)
  assert.match(checker, /entry\.isDirectory\(\).*nodeSources\(target\)/)
  assert.match(checker, /\[cm\]\?js/)
})

test('模板抽取器安全发现来源并默认拒绝覆盖候选文件', () => {
  const extractor = source('tools/extract-from-plugin.mjs')
  assert.doesNotMatch(extractor, /DeepSeekHarness\/profiles/)
  assert.match(extractor, /--plugin/)
  assert.match(extractor, /require\.resolve\('@linxin666\/dsh-study-assistant'\)/)
  assert.match(extractor, /flag: replaceLive \? 'w' : 'wx'/)
  assert.match(extractor, /const NAMES = \['SYS', 'PAGE_CSS', 'RENDER_JS', 'PY'\]/)
})

test('学习中心资源只从独立模块导出', () => {
  const embedded = source('server/embedded.mjs')
  const learningCenter = source('server/learning-center-assets.js')
  assert.doesNotMatch(embedded, /export const (?:INDEX_CSS|IX_JS)/)
  assert.match(learningCenter, /export const INDEX_CSS/)
  assert.match(learningCenter, /export const IX_JS/)
})

test('README 明确关闭桌面窗口会终止后台生成任务', () => {
  const readme = source('README.md')
  assert.match(readme, /即使生成任务仍在运行也会终止，不会留在后台/)
  assert.doesNotMatch(readme, /生成任务仍在运行时服务会留在后台/)
})
