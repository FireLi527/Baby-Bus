import React from 'react'
import { fmtTime } from './api.js'

const STAGE_FLOW = [
  ['extract', '解析资料'],
  ['outline', '课程大纲'],
  ['sections', '生成小节'],
  ['summary', '小结与术语'],
  ['gate', '内容检查'],
  ['check', '排版检查'],
  ['fix', '修正内容'],
  ['render', '生成 HTML'],
  ['pptx', '生成 PPTX'],
]

const stageKeys = new Set(STAGE_FLOW.map(([key]) => key))

function legacyFileName(detail) {
  const match = /^\[\d+\/\d+\]\s+(.+?)(?:\s+·|\s+开始生成|\s+[✅❌])/.exec(detail || '')
  return match ? match[1] : ''
}

function cleanDetail(detail, currentFile) {
  let text = String(detail || '').replace(/^\[\d+\/\d+\]\s+/, '')
  if (currentFile && text.startsWith(currentFile)) text = text.slice(currentFile.length).replace(/^\s*(?:·|开始生成)?\s*/, '')
  return !text || /^[.…]+$/.test(text) ? '正在处理…' : text
}

export default function StatusCard({ s }) {
  if (!s || !s.found) return null
  if (s.stage === 'done' || s.stage === 'error') return null
  const tl = s.timeline || []
  const current = s.stage || ''
  const latestFileEvent = [...tl].reverse().find(e => e.currentFile || legacyFileName(e.detail))
  const currentFile = s.currentFile || (latestFileEvent && (latestFileEvent.currentFile || legacyFileName(latestFileEvent.detail))) || ''
  const fileTimeline = currentFile
    ? tl.filter(e => e.currentFile === currentFile || (!e.currentFile && legacyFileName(e.detail) === currentFile))
    : tl.filter(e => e.stage !== 'batch')
  const seen = {}
  fileTimeline.forEach(e => { seen[e.stage] = true })
  let secDone = 0, secTotal = 0, secName = ''
  fileTimeline.forEach(e => {
    const m = /生成小节 (\d+)\/(\d+)（(.+?)）/.exec(e.detail || '')
    if (m) { secDone = Math.max(secDone, parseInt(m[1], 10)); secTotal = parseInt(m[2], 10); secName = m[3] }
  })
  let fixInfo = ''
  fileTimeline.forEach(e => { if (e.stage === 'fix') fixInfo = e.detail || '' })
  const stages = STAGE_FLOW.map(([key, label]) => (
    <span key={key} className={'la-stg' + (key === current ? ' la-stg-on' : (seen[key] ? ' la-stg-ok' : ''))}>{label}</span>
  ))
  if (current && current !== 'batch' && !stageKeys.has(current)) stages.push(<span key="cur" className="la-stg la-stg-on">· {current}</span>)
  const recent = fileTimeline.filter(e => e.stage !== 'batch' && e.stage !== 'done' && e.stage !== 'error').slice(-4).map((e, i) => (
    <div key={i} className="la-tl-line">
      <span className="la-tl-t">+{fmtTime(Math.max(0, e.at - s.started))}</span>
      <span className="la-tl-d">{cleanDetail(e.detail || e.stage, currentFile)}</span>
    </div>
  ))
  return (
    <div className="la-statuscard">
      <div className="la-stg-head">
        <span className="la-stg-elapsed">已用 {fmtTime(s.elapsed)}</span>
        {fixInfo ? <span className="la-stg-fix">{fixInfo.slice(0, 60)}</span> : null}
      </div>
      <div className="la-current-file"><span>当前文件</span><strong title={currentFile}>{currentFile || '正在识别…'}</strong></div>
      <div className="la-cur"><span>当前状态</span>{cleanDetail(s.detail, currentFile)}</div>
      <div className="la-stg-flow">{stages}</div>
      {secTotal > 0 ? (
        <div className="la-prog">
          <div className="la-prog-bar" style={{ width: Math.min(100, Math.round(secDone / secTotal * 100)) + '%' }} />
          <span className="la-prog-txt">小节 {secDone}/{secTotal}{secName ? '（' + secName + '）' : ''}</span>
        </div>
      ) : null}
      {recent.length ? <div className="la-tl">{recent}</div> : null}
    </div>
  )
}
