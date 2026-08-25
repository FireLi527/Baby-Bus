/**
 * 把生成表单状态收敛成后端请求。保持纯函数，便于覆盖单文件、批量和合并模式。
 */
export function buildGenerationSubmission({
  checked = {},
  selectedPath = '',
  selectedName = '',
  courses = [],
  courseMode = '',
  newCourseName = '',
  multiMode = 'separate',
  combinedName = '',
  depth = 'standard',
  wantHtml = true,
  wantPptx = false,
  job = '',
} = {}) {
  const files = Object.keys(checked || {})
  if (!files.length && !selectedPath) return { error: '请先选择或勾选文件' }
  if (!wantHtml && !wantPptx) return { error: '至少选择一种输出格式' }

  const selectedCourse = (Array.isArray(courses) ? courses : []).find(course => course && course.rel === courseMode)
  const course = courseMode === '__new' ? String(newCourseName || '').trim() : String(selectedCourse && selectedCourse.name || '')
  if (!course) return { error: courseMode === '__new' ? '请输入新课程名称' : '请选择已有课程或新建课程' }

  const isBatch = files.length > 0
  const isCombined = files.length > 1 && multiMode === 'combined'
  const currentFile = isCombined
    ? files.length + ' 份资料（合并）'
    : (isBatch ? (checked[files[0]] || files[0]) : selectedName)
  const common = {
    course,
    coursePath: selectedCourse ? selectedCourse.rel : '',
    depth,
    html: !!wantHtml,
    pptx: !!wantPptx,
    job,
  }
  const body = isBatch
    ? {
        files,
        mode: isCombined ? 'combined' : 'separate',
        outputName: isCombined ? String(combinedName || '').trim() : '',
        ...common,
      }
    : { rel: selectedPath, ...common }

  return {
    endpoint: isBatch ? '/api/study-assistant/generate-batch' : '/api/study-assistant/generate',
    body,
    currentFile,
    isBatch,
    isCombined,
  }
}
