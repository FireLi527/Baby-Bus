// 应用配置：首次启动生成默认 config.json，用户可在 UI 中修改
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_DIR = process.env.BAOBAO_CONFIG_DIR
  ? path.resolve(process.env.BAOBAO_CONFIG_DIR)
  : ROOT
const DATA_DIR = process.env.BAOBAO_DATA_DIR
  ? path.resolve(process.env.BAOBAO_DATA_DIR)
  : path.join(ROOT, 'data')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')
const DOCUMENTS_DIR = path.join(homedir(), 'Documents')

export const DEFAULTS = {
  port: 8787,
  dataDir: DATA_DIR,
  storageDir: path.join(DATA_DIR, '学习资料'),
  inputDir: fs.existsSync(DOCUMENTS_DIR) ? DOCUMENTS_DIR : homedir(), // 首次浏览起点；只读
  llm: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
  edgePath: '',        // 无头浏览器路径（留空自动探测；找不到则跳过渲染自检）
  enableSelfCheck: true,
}

export function loadConfig() {
  let cfg = {}
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error('config.json 格式错误，原文件已保留，请修复后重试：' + message)
    }
  }
  const merged = {
    ...DEFAULTS,
    ...cfg,
    // 输出必须留在项目内部；旧配置不能把生成结果重新指向用户的输入目录。
    dataDir: DEFAULTS.dataDir,
    storageDir: DEFAULTS.storageDir,
    inputDir: DEFAULTS.inputDir,
    llm: { ...DEFAULTS.llm, ...(cfg.llm || {}) },
  }
  saveConfig(merged)
  return merged
}

export function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
}

/** 公开给前端的安全视图：apiKey 打码 */
export function publicConfig(cfg) {
  const key = String(cfg.llm.apiKey || '')
  const masked = key.length > 8 ? key.slice(0, 4) + '…' + key.slice(-4) : (key ? '••••' : '')
  return {
    port: cfg.port,
    dataDir: cfg.dataDir,
    storageDir: cfg.storageDir,
    llm: { baseUrl: cfg.llm.baseUrl, apiKeyMasked: masked, model: cfg.llm.model },
    edgePath: cfg.edgePath,
    enableSelfCheck: cfg.enableSelfCheck,
  }
}
