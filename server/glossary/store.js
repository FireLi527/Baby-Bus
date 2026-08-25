import fs from 'node:fs'
import path from 'node:path'
import { buildHtmlDoc } from '../html.js'
import { deriveGlossaryFromSlides, mergeGlossary, normalizeGlossaryList } from './model.js'
import { buildGlossaryHtml, glossaryViewFile } from './view.js'

export function glossaryStoreFile(root) { return path.join(root, '术语库.json') }

export function readGlossaryStore(root) {
  const file = glossaryStoreFile(root)
  if (!fs.existsSync(file)) return []
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(value)) throw new Error('根节点必须是数组')
    return normalizeGlossaryList(value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('术语库读取失败，原文件已保留：' + message)
  }
}

export function refreshGlossaryView(root, list, options = {}) {
  fs.mkdirSync(root, { recursive: true })
  const glossary = Array.isArray(list) ? list : readGlossaryStore(root)
  const courseQuery = options.course ? '?course=' + encodeURIComponent(String(options.course)) : ''
  const dataUrl = options.dataUrl || (options.port ? `http://127.0.0.1:${Number(options.port)}/api/study-assistant/glossary-data${courseQuery}` : `/api/study-assistant/glossary-data${courseQuery}`)
  const target = glossaryViewFile(root)
  const next = buildGlossaryHtml(glossary, { dataUrl, courseName: options.courseName || path.basename(root) })
  let current = ''
  try { current = fs.readFileSync(target, 'utf8') } catch (e) {}
  if (current !== next) fs.writeFileSync(target, next, 'utf8')
  return target
}

export function writeGlossaryStore(root, list, options = {}) {
  const normalized = normalizeGlossaryList(list)
  fs.writeFileSync(glossaryStoreFile(root), JSON.stringify(normalized, null, 2), 'utf8')
  refreshGlossaryView(root, normalized, options)
}

function collectPlanFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) collectPlanFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.plan.json')) out.push(full)
  }
  return out
}

/**
 * 修复旧版本留下的空课程术语库。恢复过程完全基于已生成课件中的明确中英对照，
 * 不调用模型；同时更新 plan 与已存在的 HTML，让术语提示立刻可用。
 */
export function recoverEmptyGlossaries(storageDir, options = {}) {
  const result = { recoveredCourses: 0, recoveredTerms: 0, updatedPlans: 0, updatedHtml: 0, errors: [] }
  const plansByCourse = new Map()
  for (const planFile of collectPlanFiles(storageDir)) {
    const courseDir = path.dirname(planFile)
    if (!plansByCourse.has(courseDir)) plansByCourse.set(courseDir, [])
    plansByCourse.get(courseDir).push(planFile)
  }

  for (const [courseDir, planFiles] of plansByCourse) {
    try {
      let stored = []
      try { stored = readGlossaryStore(courseDir) } catch (error) {
        result.errors.push({ courseDir, stage: 'read-glossary', message: error instanceof Error ? error.message : String(error) })
        continue
      }
      if (stored.length) continue

      const loadedPlans = []
      let recovered = []
      for (const planFile of planFiles) {
        try {
          const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
          loadedPlans.push({ planFile, plan })
          recovered = mergeGlossary(recovered, normalizeGlossaryList(plan.glossary), false)
          recovered = mergeGlossary(recovered, deriveGlossaryFromSlides(plan.slides), false)
        } catch (error) {
          result.errors.push({ planFile, stage: 'read-plan', message: error instanceof Error ? error.message : String(error) })
        }
      }
      if (!recovered.length) continue

      const course = path.relative(storageDir, courseDir).split(path.sep).join('/')
      writeGlossaryStore(courseDir, recovered, {
        port: options.port,
        course,
        courseName: path.basename(courseDir),
      })
      result.recoveredCourses += 1
      result.recoveredTerms += recovered.length

      for (const { planFile, plan } of loadedPlans) {
        try {
          plan.glossary = recovered
          fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8')
          result.updatedPlans += 1
          const htmlFile = planFile.slice(0, -'.plan.json'.length) + '.course.html'
          if (fs.existsSync(htmlFile)) {
            fs.writeFileSync(htmlFile, buildHtmlDoc(plan), 'utf8')
            result.updatedHtml += 1
          }
        } catch (error) {
          result.errors.push({ planFile, stage: 'write-plan', message: error instanceof Error ? error.message : String(error) })
        }
      }
    } catch (error) {
      result.errors.push({ courseDir, stage: 'recover-course', message: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
