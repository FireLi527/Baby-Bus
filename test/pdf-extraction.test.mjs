import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { PY } from '../server/embedded.mjs'
import { generate } from '../server/pipeline.js'

test('PDF 解析器提取真实表格并保留可嵌入图片资源', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-pdf-evidence-'))
  const pdfFile = path.join(root, 'evidence.pdf')
  const workerFile = path.join(root, 'worker.py')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(workerFile, PY, 'utf8')

  const builder = `import pymupdf, sys
out = sys.argv[1]
doc = pymupdf.open()
page = doc.new_page(width=600, height=800)
xs = [40, 180, 320]
ys = [80, 120, 160, 200]
for x in xs:
    page.draw_line((x, ys[0]), (x, ys[-1]), color=(0, 0, 0), width=1)
for y in ys:
    page.draw_line((xs[0], y), (xs[-1], y), color=(0, 0, 0), width=1)
cells = [['word', 'count'], ['data', '7'], ['model', '4']]
for row, values in enumerate(cells):
    for col, value in enumerate(values):
        page.insert_text((xs[col] + 8, ys[row] + 26), value, fontsize=12)
page.insert_text((40, 225), 'Table 1 Extracted counts', fontsize=11)
figdoc = pymupdf.open()
fig = figdoc.new_page(width=480, height=300)
fig.draw_rect((20, 20, 460, 280), color=(0.2, 0.2, 0.8), width=3)
for n in range(12):
    x = 30 + n * 36
    y = 150 - (n - 5) * (n - 5) * 3
    fig.draw_circle((x, y), 7, color=(0.8, 0.1, 0.1), fill=(0.95, 0.5, 0.5))
fig.insert_text((130, 45), 'f(x) sample plot', fontsize=20)
pix = fig.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
page.insert_image((330, 80, 570, 230), stream=pix.tobytes('png'))
page.insert_text((330, 250), 'Figure 1 Sample function plot', fontsize=11)
doc.save(out)
`
  const built = spawnSync('python', ['-c', builder, pdfFile], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(built.status, 0, built.stderr)

  const extracted = spawnSync('python', [workerFile], {
    input: JSON.stringify({ action: 'extract', file: pdfFile, sourceId: 'S1' }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 20 * 1024 * 1024,
  })
  assert.equal(extracted.status, 0, extracted.stderr)
  const result = JSON.parse(extracted.stdout)
  assert.equal(result.ok, true, result.error)
  assert.ok(result.tables.length >= 1)
  assert.equal(result.tables[0].id, 'S1-P1-T1')
  assert.deepEqual(result.tables[0].headers, ['word', 'count'])
  assert.ok(result.assets.length >= 1)
  assert.match(result.assets[0].id, /^S1-P1-F\d+$/)
  assert.match(result.assets[0].dataUrl, /^data:image\/(?:png|jpeg);base64,/)
  assert.match(result.assets[0].visualHash, /^[0-9a-f]{64}$/)
  assert.match(result.text, /TABLE ASSET id=S1-P1-T1/)
  assert.match(result.text, /FIGURE ASSET id=S1-P1-F1/)
})

test('图片讲解门禁失败后逐图分析，只回填讲解字段并带提醒交付', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-figure-auto-repair-'))
  const inputDir = path.join(root, 'input')
  const storageDir = path.join(root, 'data', '学习资料')
  const pdfFile = path.join(inputDir, 'figure.pdf')
  fs.mkdirSync(inputDir, { recursive: true })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const builder = `import pymupdf, sys
doc = pymupdf.open()
page = doc.new_page(width=600, height=800)
page.insert_text((45, 55), 'Figure-based model explanation', fontsize=16)
figdoc = pymupdf.open()
fig = figdoc.new_page(width=480, height=300)
fig.draw_rect((20, 20, 460, 280), color=(0.1, 0.2, 0.8), width=3)
fig.draw_line((60, 220), (220, 90), color=(0.8, 0.1, 0.1), width=5)
fig.draw_line((220, 90), (410, 180), color=(0.1, 0.6, 0.2), width=5)
fig.insert_text((80, 250), 'input', fontsize=18)
fig.insert_text((210, 70), 'hidden', fontsize=18)
fig.insert_text((390, 210), 'output', fontsize=18)
pix = fig.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
page.insert_image((60, 100, 540, 400), stream=pix.tobytes('png'))
page.insert_text((60, 425), 'Figure 1 Input-hidden-output flow', fontsize=12)
doc.save(sys.argv[1])
`
  const built = spawnSync('python', ['-c', builder, pdfFile], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(built.status, 0, built.stderr)

  let sectionCalls = 0
  let figureAnalysisCalls = 0
  const cfg = {
    dataDir: path.join(root, 'data'),
    storageDir,
    inputDir,
    llm: { baseUrl: 'http://unused.invalid/v1', apiKey: 'test', model: 'mock-vision' },
    enableSelfCheck: false,
    browserPath: '',
  }
  const result = await generate(cfg, {
    rel: pdfFile,
    course: '图片自动修正',
    html: false,
    pptx: false,
    job: 'figure-auto-repair-test',
  }, {
    callLlm: async (_cfg, opts) => {
      const prompt = String(opts.user || '')
      if (prompt.includes('【第一步】')) return JSON.stringify({
        title: '图片课程',
        sections: [{ heading: '读懂流程图', keyPoints: ['输入到输出'], sourceRefs: ['S1'], sourceRanges: [{ source: 'S1', kind: 'PAGE', from: 1, to: 1 }] }],
      })
      if (prompt.includes('【当前任务】')) {
        sectionCalls++
        return JSON.stringify([{ title: '流程图展示三阶段传递', sourceAnchors: ['S1:PAGE 1'], blocks: [
          { type: 'text', content: '这段正文必须在逐图修复后保持原样。' },
          { type: 'figure', assetId: 'S1-P1-F1', caption: '输入到输出流程', alt: '流程图' },
        ] }])
      }
      if (prompt.includes('【任务：单图阅读指引】')) {
        figureAnalysisCalls++
        assert.equal(opts.images.length, 1, '每次定向分析只能携带当前一张图片')
        assert.match(prompt, /只输出 JSON 对象本体/)
        return JSON.stringify({
          assetId: 'S1-P1-F1',
          guide: [
            { label: '左侧 input 与红线', content: '先从左侧输入文字出发，红色连线把输入送到中央 hidden 节点，表示第一段信息变换。' },
            { label: '中央 hidden 与绿线', content: '再看中央隐藏节点，绿色连线继续通向右侧 output 文字，表示结果沿第二段路径输出。' },
          ],
          takeaway: '两段连线共同说明信息按照输入、隐藏处理、输出的顺序向前传递。',
        })
      }
      if (prompt.includes('【最后一步】')) return JSON.stringify({ title: '小结', blocks: [{ type: 'bullets', items: ['信息从输入经过隐藏阶段到达输出'] }] })
      if (prompt.includes('请把下面课件正文')) return JSON.stringify({ glossary: [] })
      if (prompt.includes('你是学生审稿员')) return JSON.stringify({ problems: [{ page: 3, kind: 'figure', note: '需要再次核对图中元素。' }] })
      return JSON.stringify({ problems: [] })
    },
  })

  assert.equal(result.ok, true, result.error)
  assert.equal(sectionCalls, 1, '图片问题不能触发整节重生成')
  assert.equal(figureAnalysisCalls, 2, '本地门禁与学生审稿各检出一次时，都应走逐图分析')
  assert.equal(result.performance.rounds, 1)
  assert.equal(result.performance.figureRepairCalls, 2)
  assert.equal(result.performance.figureRepairsApplied, 2)
  assert.equal(result.performance.figureGuidesMissing, 0)
  assert.ok(result.timeline.some(item => /逐图分析/.test(String(item.detail || ''))))
  const plan = JSON.parse(fs.readFileSync(path.join(storageDir, '图片自动修正', 'figure.plan.json'), 'utf8'))
  const repairedSlide = plan.slides.find(slide => slide.title === '流程图展示三阶段传递')
  const figure = repairedSlide.blocks.find(block => block.type === 'figure')
  assert.equal(figure.guide.length, 2)
  assert.match(figure.takeaway, /输入、隐藏处理、输出/)
  assert.equal(figure.caption, '输入到输出流程')
  assert.equal(figure.alt, '流程图')
  assert.equal(repairedSlide.blocks.find(block => block.type === 'text').content, '这段正文必须在逐图修复后保持原样。')

  let degradedSectionCalls = 0
  let degradedFigureCalls = 0
  const degraded = await generate(cfg, {
    rel: pdfFile,
    course: '图片降级交付',
    html: true,
    pptx: false,
    job: 'figure-degraded-delivery-test',
  }, {
    callLlm: async (_cfg, opts) => {
      const prompt = String(opts.user || '')
      if (prompt.includes('【第一步】')) return JSON.stringify({
        title: '图片课程',
        sections: [{ heading: '读懂流程图', keyPoints: ['输入到输出'], sourceRefs: ['S1'], sourceRanges: [{ source: 'S1', kind: 'PAGE', from: 1, to: 1 }] }],
      })
      if (prompt.includes('【当前任务】')) {
        degradedSectionCalls++
        return JSON.stringify([{ title: '流程图', sourceAnchors: ['S1:PAGE 1'], blocks: [{ type: 'figure', assetId: 'S1-P1-F1', caption: '输入到输出流程', alt: '流程图' }] }])
      }
      if (prompt.includes('【任务：单图阅读指引】')) {
        degradedFigureCalls++
        return JSON.stringify({ assetId: 'S1-P1-F1', guide: [{ label: '图片', content: '笼统说明' }], takeaway: '太短' })
      }
      if (prompt.includes('【最后一步】')) return JSON.stringify({ title: '小结', blocks: [{ type: 'bullets', items: ['信息从输入到达输出'] }] })
      if (prompt.includes('请把下面课件正文')) return JSON.stringify({ glossary: [] })
      if (prompt.includes('你是学生审稿员')) return JSON.stringify({ problems: [] })
      return JSON.stringify({ problems: [] })
    },
  })
  assert.equal(degraded.ok, true, degraded.error)
  assert.equal(degradedSectionCalls, 1, '逐图分析失败后也不能重写整个小节')
  assert.equal(degradedFigureCalls, 1, '每张问题图只定向分析一次')
  assert.equal(degraded.performance.figureRepairCalls, 1)
  assert.equal(degraded.performance.figureRepairsApplied, 0)
  assert.equal(degraded.performance.figureGuidesMissing, 1)
  assert.match(degraded.warnings.join('\n'), /只尝试替换 guide\/takeaway/)
  assert.match(degraded.warnings.join('\n'), /提醒交付/)
  assert.ok(degraded.files.html && fs.existsSync(path.join(storageDir, degraded.files.html.rel)))
})
