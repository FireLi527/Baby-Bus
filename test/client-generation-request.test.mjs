import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGenerationSubmission } from '../client/src/generation-request.js'

const courses = [{ name: '文档分析', rel: '文档分析' }]

test('单击选中的文件生成单文件请求', () => {
  const submission = buildGenerationSubmission({
    selectedPath: 'E:/资料/W5.pdf',
    selectedName: 'W5.pdf',
    courses,
    courseMode: '文档分析',
    depth: 'detailed',
    wantHtml: true,
    wantPptx: false,
    job: 'la-1',
  })
  assert.equal(submission.endpoint, '/api/study-assistant/generate')
  assert.equal(submission.currentFile, 'W5.pdf')
  assert.deepEqual(submission.body, {
    rel: 'E:/资料/W5.pdf',
    course: '文档分析',
    coursePath: '文档分析',
    depth: 'detailed',
    html: true,
    pptx: false,
    job: 'la-1',
  })
})

test('勾选多个文件可以构造合并生成请求', () => {
  const submission = buildGenerationSubmission({
    checked: { 'E:/资料/W4.pdf': 'W4.pdf', 'E:/资料/W5.pdf': 'W5.pdf' },
    selectedPath: 'E:/资料/ignored.pdf',
    courses,
    courseMode: '文档分析',
    multiMode: 'combined',
    combinedName: '  两周课程  ',
    depth: 'standard',
    wantHtml: true,
    wantPptx: true,
    job: 'comb-1',
  })
  assert.equal(submission.endpoint, '/api/study-assistant/generate-batch')
  assert.equal(submission.currentFile, '2 份资料（合并）')
  assert.deepEqual(submission.body.files, ['E:/资料/W4.pdf', 'E:/资料/W5.pdf'])
  assert.equal(submission.body.mode, 'combined')
  assert.equal(submission.body.outputName, '两周课程')
  assert.equal(submission.body.course, '文档分析')
  assert.equal(submission.body.pptx, true)
})

test('只勾选一个文件仍沿用分别生成的批量接口', () => {
  const submission = buildGenerationSubmission({
    checked: { 'E:/资料/W5.pdf': 'W5.pdf' },
    courses,
    courseMode: '文档分析',
    multiMode: 'combined',
    wantHtml: true,
    job: 'bat-1',
  })
  assert.equal(submission.endpoint, '/api/study-assistant/generate-batch')
  assert.equal(submission.currentFile, 'W5.pdf')
  assert.equal(submission.body.mode, 'separate')
  assert.equal(submission.body.outputName, '')
})

test('手动指定作业讲解模式会进入生成请求', () => {
  const submission = buildGenerationSubmission({
    selectedPath: 'E:/资料/Homework-1.pdf',
    selectedName: 'Homework-1.pdf',
    courses,
    courseMode: '文档分析',
    materialMode: 'homework',
    wantHtml: true,
  })
  assert.equal(submission.body.materialMode, 'homework')
})

test('自动识别模式保持后端默认行为', () => {
  const submission = buildGenerationSubmission({
    selectedPath: 'E:/资料/W5.pdf',
    selectedName: 'W5.pdf',
    courses,
    courseMode: '文档分析',
    materialMode: 'auto',
    wantHtml: true,
  })
  assert.equal('materialMode' in submission.body, false)
})

test('生成请求在提交前统一验证选择、输出格式和课程', () => {
  assert.equal(buildGenerationSubmission({ wantHtml: true }).error, '请先选择或勾选文件')
  assert.equal(buildGenerationSubmission({ selectedPath: 'W5.pdf', wantHtml: false, wantPptx: false }).error, '至少选择一种输出格式')
  assert.equal(buildGenerationSubmission({ selectedPath: 'W5.pdf', wantHtml: true }).error, '请选择已有课程或新建课程')
  assert.equal(buildGenerationSubmission({ selectedPath: 'W5.pdf', wantHtml: true, courseMode: '__new', newCourseName: '  ' }).error, '请输入新课程名称')
})
