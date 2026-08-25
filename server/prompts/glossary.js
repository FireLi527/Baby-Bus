function glossaryTask(storeLines, serial, rangeText) {
  return `【任务：生成本课程术语库】
请把下面课件正文中${rangeText}核心技术术语收进本课程术语库。

【字段规范】
- term：中文规范名，只写名词。
- aliases：正文中同一概念的其他写法。
- english：正文中出现的英文全称。
- abbr：资料明确给出的缩写；资料未给出时使用空字符串。
- explain：一句自然、易懂的解释正文，提示框会自动添加“中文（英文/缩写）：”标签。
- formula：正文中的定义公式；正文未提供定义公式时使用空字符串。

【选择与去重】
- 术语、英文、缩写、公式和解释均以课件正文为依据。
- 大小写、空格、连字符和中文长短写法属于同一概念时合并为一条，其余写法放入 aliases。例如 Word2Vec/word2vec；上下文明确同义时，稠密词向量/稠密向量也合并。
- 缩写相同但含义不同的概念分别保留，允许 abbr 重复。
- 课程安排、教师和助教、教材书名、人名、周次、作业考试、普通动作词，以及参考文献条目、作者、期刊和 DOI 排除在术语库之外。

【当前课程已有术语：规范名｜别名｜英文｜缩写｜解释｜公式】
${storeLines}

【课件内容】
${serial}

只输出 JSON 对象本体：{ "glossary": [ { "term": "中文规范名", "aliases": ["正文中的同义写法"], "english": "英文全称", "abbr": "", "explain": "解释正文", "formula": "" } ] }。`
}

export function glossaryPrompts(storeLines, serial) {
  return {
    primary: glossaryTask(storeLines.slice(0, 12000), serial.slice(0, 45000), '最重要的，最多 24 条'),
    retry: '【格式修正】上一结果缺少可用术语或 JSON 结构不完整。\n\n' + glossaryTask('', serial.slice(0, 28000), '8~18 个正文明确出现的'),
  }
}
