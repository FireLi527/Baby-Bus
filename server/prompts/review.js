export function summaryPrompt(materialContext, outlineTitles, summarySource, assignmentMode = false) {
  const focus = assignmentMode
    ? '概括各题考查的方法、关键条件和答案检查方式；不要把题干写成知识定义，也不要新增解法。'
    : '用两三句自然中文概括整讲核心思想。'
  return materialContext + '\n\n【本讲大纲】' + outlineTitles.join('；') + '\n\n【已生成课件】\n' + summarySource + '\n\n【最后一步：课程小结】生成 1 页小结幻灯片：{ "title": "小结", "blocks": [ { "type": "intuition", "content": "' + focus + '" }, { "type": "bullets", "items": ["核心要点1", "..."] } ] }。bullets 列 4~6 条，涵盖每个小节的核心结论；内容取自已生成课件。只输出 JSON 对象本体。'
}

export function deckReviewPrompt(options) {
  const assignmentChecks = options.assignmentMode ? `
9. 作业覆盖：逐一对照资料中的实质题目和小题，检查是否都有可辨认的题号或题干以及对应讲解；遗漏题目标为 omitted。相关小题可以合并讲解，但不能因合并丢失设问或条件。
10. 答案对应：检查每道题的条件、解答步骤和最终答案是否与资料对应。题号错配、把不同题目的答案拼接、改变答案或补写资料未提供的具体推导，标为 unsupported。资料只有最终答案时，允许说明考查知识和方法方向，但不得声称虚构步骤来自资料。
11. 作业结构：每道题必须先有一张独立原题页，逐字展示完整题干且不包含思路、步骤或答案；对应讲解页排在原题页之后，并清楚区分思路或考点、资料已有步骤、最终答案和易错点（适用时）。只有“这道题要求……”等概括而没有先展示独立完整原题，或讲解先于原题出现，标为 unclear。
` : ''
  const questionInventory = options.assignmentMode && Array.isArray(options.assignmentQuestions) && options.assignmentQuestions.length
    ? '\n【已验证逐字题目清单】\n' + options.assignmentQuestions.map(item => `${item.id}｜${item.problem}`).join('\n') + '\n'
    : ''
  return `你是学生审稿员「小柯」。请检查知识完整性、可理解性和资料忠实性。

【检查标准】
1. 知识完整性：以资料中的理论、定义、条件、公式、推导、例题、图表含义和结论为检查单位；实质内容缺失时标为 omitted。公式应保留公式本体及其含义。sourceAnchors 仅是溯源元数据，不参与完整性判断；重复或渐进原页可以合并，Agenda、目录、过渡页和装饰内容不属于教学知识。
2. 术语：正文核心专有名词和数学符号应有白话解释。资料包含定义公式时检查 glossary.formula；其他术语的 formula 可为空。缺词或解释不清标为 glossary。
3. 页面密度：每页通常包含 2~5 个内容块；超过 8 个内容块或明显难以阅读时标为 dense，并建议按知识逻辑拆页且保留原内容。
4. 资料忠实性：公式、推导、例题、案例、实验数字、条件和研究结论应能在【资料证据】中定位。无资料依据、改变原条件或把类比当成研究证据的内容标为 unsupported。
5. 论文边界：References、Bibliography、Works Cited 或“参考文献”标题及其后的条目若进入正文或术语，标为 unsupported。
6. 数学排版：资料中的数学表达应使用等价 LaTeX。formula.latex 和 derivation.steps[].latex 使用成对的 $$...$$，正文行内数学使用成对的 $...$；裸露的 LaTeX 命令、缺失或不配对的定界符、文本数学或符号连写标为 textmath，并给出可直接替换的等价排版。
7. 推导说明：资料中的推导应为每个关键步骤提供 why，说明该步的依据和作用；缺失时标为 unclear。
8. 图片讲解：使用的资料图应解释至少两个可见元素、区域、箭头、颜色、编号、坐标轴或公式，并给出图中结论；讲解不足时标为 figure。
${assignmentChecks}

只按资料实际包含的内容类型检查。

【资料类型】${options.materialType}
${questionInventory}

【资料证据】
${options.reviewSources}

${options.glossaryText}

【课件页面（编号与内容）】
${options.serial}

只输出 JSON 对象本体：{ "problems": [ { "page": 页码, "kind": "omitted|dense|textmath|unclear|figure|glossary|unsupported", "note": "具体位置与修改建议" } ] }。没有问题时 problems 使用空数组，最多列出 10 个最严重的问题。`
}

export function slideRepairPrompt(options) {
  const assignmentRules = options.assignmentMode ? `
- 当前资料是作业或习题：保留题号、完整题意、条件和答案对应关系；使用 example 的 problem、steps、answer、note 区分题目、资料已有过程、最终答案与说明。
- 原题页只逐字展示题目，不加入思路、步骤或答案；讲解页必须排在原题页之后。不要把题干改写为知识定义，不合并互不相关的题目。资料未提供详细过程时不得补写具体推导，并明确说明原资料只给出了最终答案。
` : ''
  return `你是本课讲师。学生审稿员指出当前幻灯片存在以下问题（${options.problem.kind || ''}）：${options.problem.note || ''}。

请依据【可用资料】重写这一页，保留 title 和 sourceAnchors，并更新 blocks。

【修正规范】
- 公式、推导、例题、案例、实验数字、条件和结论均以【可用资料】为依据。
- 页面保留理解当前知识所需的理论、公式和推导；内容密集时按清晰的逻辑层次组织。
- 论文和学术文献按其实际内容类型呈现；参考文献条目排除在页面之外。
- 术语和符号在页面内提供白话解释。
- 资料中的数学表达使用等价 LaTeX：formula.latex 和 derivation.steps[].latex 使用成对的 $$...$$，正文行内数学使用成对的 $...$；JSON 中的 LaTeX 反斜线正确转义。推导步骤包含说明依据与作用的 why。
- figure 包含至少两项指向可见部分的 guide，以及概括图中结论的 takeaway。
${assignmentRules}

只输出单页 JSON 对象本体：{ "title": "...", "sourceAnchors": [], "blocks": [...] }。

【资料类型】${options.materialType}

【可用资料】
${options.evidence}

【原页面 JSON】
${JSON.stringify(options.slide)}`
}
