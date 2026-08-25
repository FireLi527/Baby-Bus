import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

function source(relative) {
  return fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8')
}

test('轻量原生启动器复用系统 Edge，不再捆绑 Electron、VBS 或 HTA', () => {
  const pkg = JSON.parse(source('package.json'))
  const launcher = source('launcher/BaobaoBusLauncher.cs')
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
  assert.equal(Object.keys(dependencies).some(name => name === 'electron' || name.startsWith('@electron-forge/')), false)
  assert.match(pkg.scripts.build, /build-launcher\.mjs/)
  assert.match(launcher, /--app=/)
  assert.match(launcher, /--guest --disable-sync/)
  assert.match(launcher, /FindEdge/)
  assert.match(launcher, /CreateNoWindow = true/)
  assert.match(launcher, /MutexName/)
  assert.equal(fs.existsSync(new URL('../electron/main.cjs', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../forge.config.cjs', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../启动宝宝巴士.vbs', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../关闭宝宝巴士.vbs', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../宝宝巴士.hta', import.meta.url)), false)
})

test('生成链路的 Windows 子进程全部隐藏控制台窗口', () => {
  assert.match(source('launcher/BaobaoBusLauncher.cs'), /WindowStyle = ProcessWindowStyle\.Hidden/)
  assert.match(source('server/extraction/extractor.js'), /spawn\('python',[\s\S]*windowsHide: true/)
  assert.match(source('server/routes.js'), /spawn\('powershell\.exe',[\s\S]*windowsHide: true/)
  assert.match(source('server/check.js'), /spawn\(browserPath,[\s\S]*windowsHide: true/)
})

test('桌面窗口使用系统标题栏，关闭唯一的叉后通知服务退出', () => {
  const launcher = source('launcher/BaobaoBusLauncher.cs')
  const app = source('client/src/App.jsx')
  assert.doesNotMatch(launcher, /edge\.WaitForExit\(\)/)
  assert.match(launcher, /CaptureAppWindows\(\)/)
  assert.match(launcher, /WaitForAppWindowToClose\(edge, existingWindows\)/)
  assert.match(launcher, /while \(IsWindow\(appWindow\)\)/)
  assert.match(launcher, /finally[\s\S]*StopBackend\(backend\)/)
  assert.match(launcher, /\{\\"force\\":true\}/)
  assert.match(launcher, /TryShutdown\(\)/)
  assert.match(source('server/index.js'), /closeAllConnections/)
  assert.match(source('server/routes.js'), /FolderBrowserDialog/)
  assert.doesNotMatch(app, /ShutdownButton|关闭服务/)
})

test('轻量桌面版固定使用项目 data 作为学习中心工作资料库', () => {
  const launcher = source('launcher/BaobaoBusLauncher.cs')
  const config = source('server/config.js')
  assert.match(launcher, /BAOBAO_CONFIG_DIR/)
  assert.match(launcher, /BAOBAO_DATA_DIR/)
  assert.match(launcher, /Path\.Combine\(root, "data"\)/)
  assert.match(config, /BAOBAO_CONFIG_DIR/)
  assert.match(config, /BAOBAO_DATA_DIR/)
})

test('开发启动器退出时会清理后端和 Vite 子进程', () => {
  const dev = source('scripts/dev.mjs')
  assert.match(dev, /const children = new Map\(\)/)
  assert.match(dev, /function shutdown/)
  assert.match(dev, /child\.kill\(\)/)
  assert.match(dev, /SIGINT/)
  assert.match(dev, /SIGTERM/)
})

test('参考模板抽取默认写入候选文件，不能静默覆盖正式模板', () => {
  const extractor = source('tools/extract-from-plugin.mjs')
  const embedded = source('server/embedded.mjs')
  assert.match(extractor, /embedded\.candidate\.mjs/)
  assert.match(extractor, /--replace-live/)
  assert.match(extractor, /pathToFileURL\(OUT\)/)
  assert.match(embedded, /禁止未经审阅直接覆盖/)
})

test('生成状态轮询串行执行，并在切换目录时清理旧选择', () => {
  const app = source('client/src/App.jsx')
  const polling = source('client/src/useJobPolling.js')
  const status = source('client/src/StatusCard.jsx')
  assert.doesNotMatch(polling, /setInterval\(tick/)
  assert.match(polling, /active\.timer = setTimeout\(tick, POLL_DELAY_MS\)/)
  assert.match(app, /setSel\(''\); setSelName\(''\)/)
  assert.match(polling, /useEffect\(\(\) => stopPolling/)
  assert.doesNotMatch(app, /可以关闭页面/)
  assert.match(status, /latestStageEvent/)
  assert.match(status, /for \(const e of \[\.\.\.fileTimeline\]\.reverse\(\)\)/)
})
