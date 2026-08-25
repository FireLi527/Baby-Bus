import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { extOf, fileExists, SUPPORTED } from '../util.js'
import { runPython } from '../extraction/extractor.js'

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

/** 校验并提取全部输入；失败以结构化结果返回，调用者负责生成任务的降级语义。 */
export async function prepareSources(options) {
  const requestedFiles = Array.isArray(options.requestedFiles) ? options.requestedFiles : []
  const maxFiles = Math.max(1, Number(options.maxFiles) || 1)
  if (!requestedFiles.length) return { ok: false, error: '未指定文件' }
  if (requestedFiles.length > maxFiles) return { ok: false, error: '一次最多合并 ' + maxFiles + ' 份资料' }

  const resolvedFiles = []
  const seenPaths = new Set()
  for (const rel of requestedFiles) {
    const file = fileExists(rel) ? path.resolve(rel) : path.resolve(options.inputDir || process.cwd(), rel)
    const key = process.platform === 'win32' ? file.toLowerCase() : file
    if (seenPaths.has(key)) continue
    seenPaths.add(key)
    if (!fileExists(file) || !fs.statSync(file).isFile()) return { ok: false, error: '找不到文件: ' + rel }
    const ext = extOf(file)
    if (!SUPPORTED.includes(ext)) return { ok: false, error: '暂不支持该格式: ' + ext }
    resolvedFiles.push({ path: file, ext })
  }
  if (!resolvedFiles.length) return { ok: false, error: '未指定文件' }

  const sources = []
  for (let index = 0; index < resolvedFiles.length; index++) {
    const item = resolvedFiles[index]
    if (typeof options.onProgress === 'function' && resolvedFiles.length > 1) {
      options.onProgress('解析 ' + (index + 1) + '/' + resolvedFiles.length + '：' + path.basename(item.path))
    }
    const sourceId = 'S' + (index + 1)
    const extracted = await runPython({ action: 'extract', file: item.path, sourceId })
    if (!extracted.ok) return { ok: false, error: '解析失败（' + path.basename(item.path) + '）: ' + (extracted.error || '') }
    const text = normalizeExtractedText(extracted.text)
    if (!text) return { ok: false, error: '未能提取到文字内容: ' + path.basename(item.path) }
    sources.push({
      id: sourceId,
      path: item.path,
      name: path.basename(item.path),
      ext: item.ext,
      text,
      tables: Array.isArray(extracted.tables) ? extracted.tables : [],
      assets: Array.isArray(extracted.assets) ? extracted.assets : [],
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    })
  }
  return { ok: true, sources }
}
