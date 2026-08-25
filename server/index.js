// 入口：配置加载 + HTTP 服务
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { handle, setRuntimeCfg, setShutdownHandler } from './routes.js'
import { findBrowser } from './check.js'
import { refreshLearningCenter } from './archive.js'
import { refreshGeneratedCourseHtml } from './html.js'
import { recoverEmptyGlossaries } from './glossary.js'

export async function startServer(options = {}) {
  const cfg = loadConfig()
  cfg.browserPath = findBrowser(cfg.edgePath)
  const glossaryRecovery = recoverEmptyGlossaries(cfg.storageDir, { port: cfg.port })
  if (glossaryRecovery.recoveredCourses) {
    console.log(`已恢复空术语库：${glossaryRecovery.recoveredCourses} 门课程，${glossaryRecovery.recoveredTerms} 个术语`)
  }
  if (glossaryRecovery.errors.length) console.warn('有 ' + glossaryRecovery.errors.length + ' 项术语库恢复操作失败')
  const htmlRefresh = refreshGeneratedCourseHtml(cfg.storageDir)
  if (htmlRefresh.updated) console.log('已升级 HTML 课件渲染器：' + htmlRefresh.updated + ' 份')
  if (htmlRefresh.errors.length) console.warn('有 ' + htmlRefresh.errors.length + ' 份 HTML 课件升级失败')
  refreshLearningCenter(cfg.storageDir)
  setRuntimeCfg(cfg)

  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('请求处理失败: ' + message)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(message)
      } else {
        res.destroy(error instanceof Error ? error : new Error(message))
      }
    })
  })

  let closing = null
  const close = () => {
    if (closing) return closing
    setShutdownHandler(null)
    closing = new Promise(resolve => {
      if (!server.listening) { resolve(); return }
      const forceClose = setTimeout(() => {
        // 长连接或仍在结束的浏览器请求不应让桌面进程无限残留。
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
      }, 1500)
      forceClose.unref?.()
      server.close(() => {
        clearTimeout(forceClose)
        resolve()
      })
    })
    return closing
  }
  setShutdownHandler(() => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (typeof options.onShutdown === 'function') options.onShutdown()
      else process.exit(0)
    }
    const forceExit = setTimeout(finish, 4000)
    forceExit.unref?.()
    close().finally(() => {
      clearTimeout(forceExit)
      finish()
    })
  })

  await new Promise((resolve, reject) => {
    const onError = error => reject(error)
    server.once('error', onError)
    server.listen(cfg.port, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })

  console.log('宝宝巴士已启动')
  console.log('   前端: http://127.0.0.1:' + cfg.port)
  console.log('   LLM: ' + (cfg.llm.baseUrl || '(未配置)') + ' / ' + (cfg.llm.model || '(未配置)') + (cfg.llm.apiKey ? '（已配置 Key）' : '（⚠ 未配置 Key，请先在前端设置）'))
  console.log('   归档: ' + cfg.storageDir)
  console.log('   自检: ' + (cfg.enableSelfCheck && cfg.browserPath ? '已启用（' + cfg.browserPath + '）' : '跳过（未找到浏览器或已关闭）'))
  return { server, cfg, url: 'http://127.0.0.1:' + cfg.port, close }
}

const ENTRY_FILE = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === ENTRY_FILE) {
  startServer().catch(error => {
    console.error('宝宝巴士启动失败: ' + (error && error.message || String(error)))
    process.exitCode = 1
  })
}
