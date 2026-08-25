import React from 'react'
import StatusCard from './StatusCard.jsx'
import GenerationResult from './GenerationResult.jsx'

export default function GenerationOptions({
  courses,
  courseMode,
  courseNew,
  multiMode,
  combinedName,
  depth,
  wantHtml,
  wantPptx,
  checkedCount,
  busy,
  liveStatus,
  error,
  result,
  onRefreshCourses,
  onCourseMode,
  onCourseNew,
  onMultiMode,
  onCombinedName,
  onDepth,
  onWantHtml,
  onWantPptx,
  onStart,
}) {
  return (
    <div className="la-card">
      <div className="la-sec">2. 课程</div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <button className="la-upbtn" onClick={onRefreshCourses}>刷新列表</button>
      </div>
      <select className="la-input" value={courseMode} onChange={event => onCourseMode(event.target.value)}>
        <option value="">请选择课程</option>
        {(courses || []).map(course => <option key={course.rel} value={course.rel}>{course.name}</option>)}
        <option value="__new">新建课程…</option>
      </select>
      {courseMode === '__new' ? <input className="la-input" placeholder="新课程名称" value={courseNew} onChange={event => onCourseNew(event.target.value)} /> : null}
      {checkedCount > 1 ? (
        <>
          <div className="la-sec">3. 多文件处理</div>
          <div className="la-modegrid">
            <label className={'la-mode' + (multiMode === 'separate' ? ' la-mode-on' : '')}>
              <input type="radio" name="multiMode" value="separate" checked={multiMode === 'separate'} onChange={() => onMultiMode('separate')} />
              <strong>分别生成</strong><span>每份英文资料输出一套中文课件</span>
            </label>
            <label className={'la-mode' + (multiMode === 'combined' ? ' la-mode-on' : '')}>
              <input type="radio" name="multiMode" value="combined" checked={multiMode === 'combined'} onChange={() => onMultiMode('combined')} />
              <strong>合并生成</strong><span>综合去重后输出一套中文课件</span>
            </label>
          </div>
          {multiMode === 'combined' ? <input className="la-input" placeholder="合并课件文件名（可选）" value={combinedName} onChange={event => onCombinedName(event.target.value)} /> : null}
        </>
      ) : null}
      <div className="la-sec">{checkedCount > 1 ? '4' : '3'}. 讲解深度</div>
      <select className="la-input" value={depth} onChange={event => onDepth(event.target.value)}>
        <option value="concise">简明：核心内容</option>
        <option value="standard">标准：完整讲解</option>
        <option value="detailed">深入：增加推导与延伸</option>
      </select>
      <div className="la-checks">
        <label className="la-check"><input type="checkbox" checked={wantHtml} onChange={event => onWantHtml(event.target.checked)} /> HTML 课件</label>
        <label className="la-check"><input type="checkbox" checked={wantPptx} onChange={event => onWantPptx(event.target.checked)} /> PPTX</label>
      </div>
      <button className="la-go" disabled={busy} onClick={onStart}>
        {busy ? '生成中…' : (checkedCount > 1 && multiMode === 'combined' ? '合并生成 1 份课件' : (checkedCount ? '分别生成 ' + checkedCount + ' 份课件' : '生成课件'))}
      </button>
      {liveStatus ? <StatusCard s={liveStatus} /> : null}
      {error ? <div className="la-err">{error}</div> : null}
      <GenerationResult result={result} />
    </div>
  )
}
