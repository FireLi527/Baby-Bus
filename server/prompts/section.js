export function sectionTeachingRules(literatureMode) {
  return literatureMode
    ? `

【论文与学术文献讲解】
1. 围绕本节涉及的研究问题、方法、证据、结果和局限建立完整逻辑。
2. 公式、推导、例题、数值演算、类比和易错点按资料实际内容选用；资料中的公式、推导和定义应完整呈现。
3. formula、derivation、example、walkthrough 和 table 中的公式、步骤、案例和数字直接取自当前资料片段。
4. References、Bibliography、Works Cited 或“参考文献”标题及其后文献条目排除在正文和术语之外。`
    : `

【教材与课件讲解】
1. 围绕本节的理论、定义、适用条件、公式、逐步推导、例题、图表含义和结论建立完整教学逻辑。
2. formula、derivation、example、walkthrough 和 table 复现资料片段中的相应内容。
3. 资料公式保留公式本体，并解释符号、用途及资料给出的推导关系。
4. 练习和例题按资料中的题目、条件、数字和步骤呈现。`
}

export function sectionPrompt(options) {
  const keyPoints = (options.section.keyPoints || []).join('；') || '本小节内容'
  const outline = options.outlineTitles.map((title, index) => `${index + 1}. ${title}`).join('；')
  const extra = options.extraHint ? `\n\n【额外要求】${options.extraHint}` : ''
  return `${options.sectionContext}

【本讲大纲】${outline}

【当前任务】
为第 ${options.index + 1} 小节“${options.section.heading || ''}”生成幻灯片。
- 页面安排：${options.slideRange}。
- 核心知识：${keyPoints}。
${options.teachingRules}

【知识组织】
- 原页编号用于定位资料。先理解本小节的知识结构，再安排生成页面。
- 重复内容、渐进动画和同一例子的连续步骤可以合并；复杂知识点、公式推导或例子可以拆成连续页面。
- 合并页面时保留资料中新增的定义、条件、公式、推导、例子和结论。
- sourceAnchors 是可选溯源信息，只记录本页最直接依赖的少数原页；允许使用空数组。

【页面写作】
- 每张幻灯片围绕一个中心结论，title 写成可独立理解的完整结论；连续阅读所有 title 能复述本节逻辑。
- 每页通常包含 2~5 个内容块。资料中的长推导和多步骤例题按逻辑阶段拆页，并为推导步骤的 why 写明依据和作用。
- 标题和正文优先使用中文术语；首次需要对应原文时补充英文全称和资料已有缩写，后文使用中文名称。
- 按概念逻辑重写资料，用自然中文解释原因、关系和条件。

【内容块】
- text、intuition、analogy 使用 content；bullets 使用 items。
- formula.latex 只写一条完整的独立公式，并使用成对的 $$...$$；note 用自然语言逐符号说明。
- derivation.steps 中每个 latex 使用成对的 $$...$$，why 说明该步依据和作用；正文中的行内数学使用成对的 $...$。
- JSON 字符串中的 LaTeX 反斜线按 JSON 语法转义，例如公式“\\frac{a}{b}”在 JSON 中写为“\"$$\\\\frac{a}{b}$$\"”。
- walkthrough 使用 title 和 steps；example 使用 problem、steps、answer 和 note；note 使用 title 和 content。

【图表证据】
- TABLE ASSET 和 FIGURE ASSET 是候选证据，选择直接承载本节定义、数据、结构、推导、比较或结论的资源。
- Agenda、Outline、目录、封面、章节过渡、学习路线图、徽标、背景和装饰图排除在教学图表之外。
- 表格块格式：{ "type": "table", "sourceTableId": "逐字复制 TABLE ASSET id", "headers": [], "rows": [], "caption": "" }。
- 图片块格式：{ "type": "figure", "assetId": "逐字复制 FIGURE ASSET id", "caption": "资料中的图题或简短说明", "alt": "图像内容", "guide": [ { "label": "先看哪里或图中部分", "content": "这一部分是什么、与其他部分有什么关系" }, { "label": "再看哪里或下一步", "content": "箭头、颜色、编号、坐标轴或公式表示什么" } ], "takeaway": "这张图直接支持的结论" }。
- guide 至少解释两个可见细节，takeaway 给出图中结论。复杂图可按不同区域或推导阶段拆页；同一图片再次使用时应承担不同教学焦点。
${extra}

只生成当前小节。输出非空 JSON 数组：
[ { "title": "...", "sourceAnchors": [], "blocks": [...] }, ... ]`
}

export function renderRetryFeedback(problems) {
  return '【渲染修正】检查结果：' + problems.join('；') + '。请依据资料恢复实际缺失的知识内容；将过密或溢出的页面按逻辑拆分并保留理论、公式和推导；将数学表达修正为有效 LaTeX（行内 $...$，独立 $$...$$）。页面数量由修正后的内容结构决定，新增内容均须有资料依据。'
}
