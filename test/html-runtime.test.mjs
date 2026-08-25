import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PAGE_CSS, RENDER_JS } from '../server/embedded.mjs'
import { collectLayoutProblems } from '../server/check.js'
import { buildHtmlDoc, HTML_RENDERER_VERSION, refreshGeneratedCourseHtml } from '../server/html.js'
import { buildGlossaryHtml, deriveGlossaryFromSlides, glossaryLabel, glossaryVersion, mergeGlossary, normalizeGlossaryList, recoverEmptyGlossaries, writeGlossaryStore } from '../server/glossary.js'
import { pptxParts } from '../server/pptx.js'
import { handle, setRuntimeCfg } from '../server/routes.js'

const sampleCourse = {
  title: '公式测试',
  slides: [
    { kind: 'cover' },
    { title: '模型行为由三类输入共同决定', blocks: [{ type: 'formula', latex: '$$\\text{模型行为}=f(\\text{系统指令},\\text{用户输入},\\text{工具输出})$$' }] },
  ],
  glossary: [{ term: '工具输出', english: 'Tool Output', abbr: 'TO', explain: '外部工具返回的数据' }],
}

test('HTML 课件内嵌 KaTeX/Reveal 和字体，可以脱离本地服务双击打开', () => {
  const html = buildHtmlDoc(sampleCourse)
  assert.match(html, new RegExp(`baobao-renderer-version' content='${HTML_RENDERER_VERSION}`))
  assert.match(html, /data-baobao-runtime='katex'/)
  assert.match(html, /data-baobao-runtime='reveal'/)
  assert.match(html, /data:font\/woff2;base64,/)
  assert.match(html, /Copyright \(c\) 2013-2020 Khan Academy/)
  assert.doesNotMatch(html, /url\(fonts\//)
  assert.doesNotMatch(html, /<(?:link|script)[^>]+(?:href|src)=/)
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/)
})

test('术语标注会跳过公式，避免拆断 LaTeX 定界符', () => {
  assert.match(RENDER_JS, /parent\.closest\('\.b-formula'\)/)
  assert.match(RENDER_JS, /text\.indexOf\('\$'\) >= 0/)
  assert.match(RENDER_JS, /glossLabel\(g\)/)
  assert.match(RENDER_JS, /info\.label \+ '：' \+ info\.explain/)
  assert.match(RENDER_JS, /在本术语库中有 ' \+ infos\.length \+ ' 个含义/)
})

test('单份课件不再追加术语表幻灯片，术语数据仅用于悬停和学习中心', () => {
  assert.doesNotMatch(RENDER_JS, /glossaryPages|glossaryPage|gloss-static|gloss-formula/)
  assert.doesNotMatch(RENDER_JS, /txt\([^\n]*'术语表/)
  assert.match(RENDER_JS, /var infoByTerm = new Map\(\)/)
  assert.match(RENDER_JS, /var pop = el\('div', 'gloss-pop'\)/)
  assert.equal(pptxParts(sampleCourse, sampleCourse.title).some(slide => slide.title === '术语表'), false)
})

test('术语包含中英文与缩写，重复缩写保留多义项而不合并', () => {
  const first = { term: '位置编码', english: 'Positional Encoding', abbr: 'PE', explain: '给序列位置加上标记' }
  const second = { term: '隐私增强', english: 'Privacy Enhancing', abbr: 'PE', explain: '减少敏感信息暴露' }
  assert.equal(glossaryLabel(first), '位置编码（Positional Encoding/PE）')
  const merged = mergeGlossary([], [first, second], false)
  assert.equal(merged.length, 2)
  assert.deepEqual(merged.map(item => item.abbr), ['PE', 'PE'])

  const backfilled = mergeGlossary([{ term: '位置编码', explain: first.explain }], [first], false)
  assert.equal(backfilled[0].english, 'Positional Encoding')
  assert.equal(backfilled[0].abbr, 'PE')

  const html = buildGlossaryHtml(merged)
  assert.match(html, /位置编码（Positional Encoding\/PE）/)
  assert.match(html, /隐私增强（Privacy Enhancing\/PE）/)
})

test('术语按规范名和别名去重，但绝不按重复缩写合并', () => {
  const caseVariants = normalizeGlossaryList([
    { term: 'word2vec', english: 'Word2Vec', explain: '把词表示成向量' },
    { term: 'Word2Vec', english: 'Word2Vec', explain: '把词表示成向量' },
  ])
  assert.equal(caseVariants.length, 1)
  assert.equal(caseVariants[0].term, 'Word2Vec')

  const chineseAliases = normalizeGlossaryList([
    { term: '稠密词向量', aliases: ['稠密向量'], english: 'Dense Word Vector', explain: '大多数维度都有值的词向量' },
    { term: '稠密向量', english: 'Dense Word Vector', explain: '大多数维度都有值的词向量' },
  ])
  assert.equal(chineseAliases.length, 1)
  assert.deepEqual(chineseAliases[0].aliases, ['稠密向量'])
  const html = buildGlossaryHtml(chineseAliases, { courseName: '自然语言处理' })
  assert.match(html, /自然语言处理 · 术语库/)
  assert.match(html, /别名：稠密向量/)
  assert.match(RENDER_JS, /concat\(Array\.isArray\(g\.aliases\)/)
  assert.match(RENDER_JS, /new RegExp\([^\n]+, 'gi'\)/)
})

test('模型术语结果为空时，只从课件已有的明确中英对照恢复术语', () => {
  const recovered = deriveGlossaryFromSlides([{
    title: '词嵌入（word embedding）的基本思想',
    blocks: [{
      type: 'text',
      content: '词嵌入（word embedding）把离散词语映射为连续向量。这里只提到优化器，但没有给出英文名称。',
    }],
  }])
  assert.deepEqual(recovered.map(item => item.term), ['词嵌入'])
  assert.equal(recovered[0].english, 'word embedding')
  assert.match(recovered[0].explain, /映射为连续向量/)
  assert.equal(recovered.some(item => item.term === '优化器'), false)
})

test('启动时会就地恢复空课程术语库，并同步 plan 与已有 HTML', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-glossary-recover-'))
  const courseDir = path.join(root, '文档分析')
  fs.mkdirSync(courseDir, { recursive: true })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const planFile = path.join(courseDir, '第五周.plan.json')
  const htmlFile = path.join(courseDir, '第五周.course.html')
  fs.writeFileSync(planFile, JSON.stringify({
    title: '第五周',
    glossary: [],
    slides: [{ title: '词嵌入', blocks: [{ type: 'text', content: '词嵌入（word embedding）把词表示为连续向量。' }] }],
  }), 'utf8')
  fs.writeFileSync(path.join(courseDir, '术语库.json'), '[]', 'utf8')
  fs.writeFileSync(htmlFile, '<html>空术语旧课件</html>', 'utf8')

  const result = recoverEmptyGlossaries(root, { port: 8787 })
  assert.deepEqual({ courses: result.recoveredCourses, terms: result.recoveredTerms, plans: result.updatedPlans, html: result.updatedHtml }, {
    courses: 1, terms: 1, plans: 1, html: 1,
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(courseDir, '术语库.json'), 'utf8')).map(item => item.term), ['词嵌入'])
  assert.deepEqual(JSON.parse(fs.readFileSync(planFile, 'utf8')).glossary.map(item => item.term), ['词嵌入'])
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /baobao-renderer-version/)
  assert.match(fs.readFileSync(path.join(courseDir, '术语库.html'), 'utf8'), /词嵌入（word embedding）/)

  const second = recoverEmptyGlossaries(root, { port: 8787 })
  assert.equal(second.recoveredCourses, 0)
})

test('每张 Reveal 幻灯片可独立纵向滚动并在翻页时回到顶部', () => {
  assert.match(PAGE_CSS, /overflow-y:auto!important/)
  assert.match(PAGE_CSS, /\.slides>section\.dsh-slide/)
  assert.match(PAGE_CSS, /scrollbar-gutter:stable/)
  assert.match(PAGE_CSS, /touch-action:pan-y/)
  assert.match(RENDER_JS, /center: false/)
  assert.match(RENDER_JS, /currentSlide\.scrollTop = 0/)
})

test('HTML 提供按 agenda 跳转的语义侧栏，并渲染经过校验的资料原图', () => {
  assert.match(PAGE_CSS, /\.agenda-nav/)
  assert.match(PAGE_CSS, /body\.agenda-open \.reveal/)
  assert.match(RENDER_JS, /function buildAgenda/)
  assert.match(RENDER_JS, /data-agenda-index/)
  assert.match(RENDER_JS, /window\.Reveal\.slide\(target, 0, 0\)/)
  assert.match(RENDER_JS, /b\.type === 'figure'/)
  assert.match(RENDER_JS, /dataUrl\.indexOf\('data:image\/'\)/)
  assert.match(PAGE_CSS, /\.b-figure-guide/)
  assert.match(RENDER_JS, /怎么看这张图/)
  assert.match(RENDER_JS, /图中结论：/)

  const html = buildHtmlDoc({
    title: '目录测试',
    outline: [{ heading: '词向量', keyPoints: ['分布式表示'] }],
    assets: { 'S1-P5-F1': { dataUrl: 'data:image/png;base64,AA==', caption: '图 3' } },
    slides: [
      { kind: 'cover' },
      { title: '本讲内容', blocks: [{ type: 'bullets', items: ['词向量'] }] },
      { title: '词可以表示成向量', agendaIndex: 0, blocks: [{
        type: 'figure', assetId: 'S1-P5-F1', caption: '图 3',
        guide: [
          { label: '坐标位置', content: '每个词在图中的位置表示它的二维投影。' },
          { label: '相邻词语', content: '语义更接近的词在图上彼此更靠近。' },
        ],
        takeaway: '距离把词语之间的相似关系变成可观察的空间关系。',
      }] },
    ],
  })
  const payload = /id='course-data'>([^<]+)/.exec(html)?.[1]
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  assert.equal(decoded.slides[2].agendaIndex, 0)
  assert.equal(decoded.slides[2].blocks[0].guide.length, 2)
  assert.match(decoded.slides[2].blocks[0].takeaway, /空间关系/)
  assert.equal(decoded.assets['S1-P5-F1'].caption, '图 3')
})

test('术语提示框允许鼠标移入，不会因触发文字失焦而闪烁', () => {
  assert.match(RENDER_JS, /pop\.addEventListener\('mouseenter', cancelPopHide\)/)
  assert.match(RENDER_JS, /pop\.addEventListener\('mouseleave', schedulePopHide\)/)
  assert.match(RENDER_JS, /!pop\.contains\(ev\.relatedTarget\)/)
  assert.ok(RENDER_JS.indexOf('window.renderMathInElement(pop') < RENDER_JS.indexOf('var pw = pop.offsetWidth'))
})

test('旧 HTML 可以从 plan.json 就地升级且不调用模型', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-html-refresh-'))
  const courseDir = path.join(root, '课程')
  fs.mkdirSync(courseDir, { recursive: true })
  const plan = path.join(courseDir, '示例.plan.json')
  const html = path.join(courseDir, '示例.course.html')
  fs.writeFileSync(plan, JSON.stringify(sampleCourse), 'utf8')
  fs.writeFileSync(html, '<html>旧渲染器</html>', 'utf8')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const first = refreshGeneratedCourseHtml(root)
  assert.equal(first.updated, 1)
  const upgraded = fs.readFileSync(html, 'utf8')
  assert.match(upgraded, /data:font\/woff2;base64,/)
  assert.doesNotMatch(upgraded, /\/vendor\/katex/)
  const second = refreshGeneratedCourseHtml(root)
  assert.equal(second.updated, 0)
  assert.equal(second.skipped, 1)
})

test('本地服务只暴露白名单中的课件运行时资源', async t => {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`

  const katex = await fetch(base + '/vendor/katex/katex.min.css')
  assert.equal(katex.status, 200)
  assert.match(katex.headers.get('content-type') || '', /text\/css/)
  const reveal = await fetch(base + '/vendor/reveal/reveal.min.js')
  assert.equal(reveal.status, 200)
  assert.match(await reveal.text(), /Reveal/)
  const blocked = await fetch(base + '/vendor/katex/fonts/not-allowed/evil.woff2')
  assert.equal(blocked.status, 404)
  const routeSource = fs.readFileSync(new URL('../server/routes.js', import.meta.url), 'utf8')
  const glossaryRoute = routeSource.slice(routeSource.indexOf("pathname === '/api/study-assistant/glossary-view'"), routeSource.indexOf('// ── 文件服务 ──'))
  assert.match(glossaryRoute, /buildGlossaryHtml/)
  assert.doesNotMatch(glossaryRoute, /cdn\.jsdelivr\.net/)
})

test('术语库生成离线快照并通过版本接口实时更新', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-glossary-live-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const first = [{ term: '输入', english: 'Input', abbr: '', explain: '送入系统的资料', formula: '' }]
  const second = [...first, { term: '损失函数', english: 'Loss Function', abbr: '', explain: '衡量预测误差', formula: '$$L=1$$' }]

  const standalone = buildGlossaryHtml(first, { courseName: '测试课程', dataUrl: 'http://127.0.0.1:8787/api/study-assistant/glossary-data?course=' + encodeURIComponent('测试课程') })
  assert.match(standalone, /data-glossary-version=/)
  assert.match(standalone, /自动更新/)
  assert.match(standalone, /setInterval\(sync,2000\)/)
  assert.match(standalone, /baobao:glossary-update/)
  assert.match(standalone, /输入（Input）/)
  assert.match(standalone, /data:font\/woff2;base64,/)
  assert.doesNotMatch(standalone, /<(?:link|script)[^>]+(?:href|src)=/)

  writeGlossaryStore(root, first, { port: 8787, course: '测试课程', courseName: '测试课程' })
  const before = fs.readFileSync(path.join(root, '术语库.html'), 'utf8')
  assert.match(before, /送入系统的资料/)
  assert.match(before, /glossary-data\?course=%E6%B5%8B%E8%AF%95%E8%AF%BE%E7%A8%8B/)
  writeGlossaryStore(root, second, { port: 8787, course: '测试课程', courseName: '测试课程' })
  const after = fs.readFileSync(path.join(root, '术语库.html'), 'utf8')
  assert.notEqual(glossaryVersion(first), glossaryVersion(second))
  assert.notEqual(after, before)
  assert.match(after, /损失函数/)
})

test('术语数据接口按课程隔离，并返回对应课程磁盘中的最新版本', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baobao-glossary-api-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  setRuntimeCfg({ storageDir: root, dataDir: root })
  const firstCourse = path.join(root, '课程甲')
  const secondCourse = path.join(root, '课程乙')
  for (const [dir, title] of [[firstCourse, '甲课件'], [secondCourse, '乙课件']]) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, title + '.course.html'), '<html></html>', 'utf8')
  }
  writeGlossaryStore(firstCourse, [{ term: '初始术语', explain: '第一版' }], { port: 8787, course: '课程甲', courseName: '课程甲' })
  writeGlossaryStore(secondCourse, [{ term: '独立术语', explain: '乙课程内容' }], { port: 8787, course: '课程乙', courseName: '课程乙' })
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}/api/study-assistant/glossary-data?course=` + encodeURIComponent('课程甲')

  const first = await fetch(url).then(response => response.json())
  writeGlossaryStore(firstCourse, [{ term: '最新术语', explain: '第二版' }], { port: 8787, course: '课程甲', courseName: '课程甲' })
  const response = await fetch(url)
  const second = await response.json()
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.notEqual(second.version, first.version)
  assert.deepEqual(second.glossary.map(item => item.term), ['最新术语'])
  const isolated = await fetch(`http://127.0.0.1:${address.port}/api/study-assistant/glossary-data?course=` + encodeURIComponent('课程乙')).then(value => value.json())
  assert.deepEqual(isolated.glossary.map(item => item.term), ['独立术语'])
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/study-assistant/glossary-data`)).status, 400)
})

test('渲染自检以固定画布为基准，不把内容自身高度误报成溢出', () => {
  const page = { page: 4, title: '公式页', fill: 95, overflowY: 0, overflowX: 0, clipLeft: 0, clipRight: 0, clipTop: 0, clipBottom: 0 }
  assert.deepEqual(collectLayoutProblems({ per: [page] }), [])
  assert.match(collectLayoutProblems({ per: [{ ...page, overflowY: 28 }] })[0], /垂直溢出/)
  assert.deepEqual(collectLayoutProblems({ per: [{ ...page, overflowY: 280, scrollableY: true }] }), [])
  const intro = { ...page, page: 2, title: '最大似然估计', fill: 28 }
  const continuation = { ...page, page: 3, title: '最大似然估计（续）', fill: 88 }
  assert.deepEqual(collectLayoutProblems({ per: [intro, continuation] }), [], '连续知识点中的短引入页不应误报为空页')
})

test('渲染自检逐页激活 Reveal 幻灯片后再测量隐藏页', () => {
  const checkSource = fs.readFileSync(new URL('../server/check.js', import.meta.url), 'utf8')
  assert.match(checkSource, /expression: `\(async \(\) => \{/)
  assert.match(checkSource, /window\.Reveal\.slide\(i, 0, 0\)/)
  assert.match(checkSource, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/)
  assert.match(checkSource, /awaitPromise: true/)
})
