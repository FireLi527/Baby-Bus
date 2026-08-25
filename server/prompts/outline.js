export function outlinePrompt(outlineContext, sectionRange) {
  return `${outlineContext}

【第一步】设计课程大纲
先识别资料类型，再输出以下 JSON 对象：
{ "title": "...", "subtitle": "...", "materialType": "论文文献|教材课件|技术文档|其他", "difficulty": "入门|进阶|高阶", "estimateMinutes": 60, "objectives": ["学完后能够……"], "sections": [ { "heading": "小节标题", "keyPoints": ["资料中必须讲清的具体知识点1", "定义、条件、公式或推导2"], "sourceRefs": ["S1"], "sourceRanges": [ { "source": "S1", "kind": "PAGE", "from": 3, "to": 15 } ] } ] }

【大纲规范】
- 大纲应支持学生独立学习，并完整列出资料中的理论、定义、条件、公式、推导、例题、图表含义和结论。
- Agenda、目录或重复章节导航可作为章节边界；渐进页面归入同一知识单元，其中新增的信息进入 keyPoints。
- 论文、综述和学术文献按研究问题与背景、方法、证据或实验、结果、局限和启示组织。
- 教材、课件和技术文档按概念依赖及资料原有逻辑组织。
- 公式、例题、案例、实验数字、推导和结论均以资料正文为依据。keyPoints 使用具体、可检查的知识表述。
- sourceRanges 描述每个小节需要阅读的资料范围，用于向小节生成节点提供上下文；范围允许重叠，并可跳过 Agenda、重复动画、章节过渡和装饰页。
- References、Bibliography、Works Cited 或“参考文献”标题表示正文结束，后续文献条目排除在大纲之外。

组织为 ${sectionRange} 个小节，短资料可以更少。先修概念排在依赖它的概念之前。sourceRefs 使用【资料目录】中的 S 编号，每份资料至少分配给一个小节；综合多份资料时合并重复内容，并说明资料明确呈现的联系或差异。

只输出 JSON 对象本体。`
}

export function outlineRetryPrompt(prompt) {
  return prompt + '\n\n【格式修正】请重新输出结构完整、可解析的 JSON 对象本体。'
}
