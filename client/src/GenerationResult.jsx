import React from 'react'
import { fmtTime } from './api.js'

export default function GenerationResult({ result }) {
  if (!result) return null
  const perf = result.performance
  const perfLine = perf ? `总耗时 ${fmtTime(perf.durationMs)} · 模型调用 ${perf.llmCalls || 0} 次${perf.llmFailedCalls ? `（失败 ${perf.llmFailedCalls} 次）` : ''}` : ''
  if (result.results && Array.isArray(result.results)) {
    return (
      <div className="la-res">
        <h4>已完成：{result.okCount || 0}/{result.total || 0} 份</h4>
        {perfLine ? <div className="la-hint">{perfLine}</div> : null}
        {result.indexUrl ? <a className="la-link" href={result.indexUrl} target="_blank" rel="noreferrer"><span>查看全部课程</span><small>{result.indexPath || ''}</small></a> : null}
        {result.results.map((item, index) => item.ok ? (
          <div key={index} className="la-batchitem">
            <div className="la-batchname">{item.title || item.name || item.file}</div>
            {(item.warnings || []).map((warning, warningIndex) => <div key={'w' + warningIndex} className="la-warn">{warning}</div>)}
            {item.files && item.files.html && item.files.html.url ? <a className="la-link" href={item.files.html.url} target="_blank" rel="noreferrer"><span>HTML 课件</span><small>{item.files.html.rel}</small></a> : null}
            {item.files && item.files.pptx && item.files.pptx.url ? <a className="la-link" href={item.files.pptx.url} target="_blank" rel="noreferrer"><span>PPTX</span><small>{item.files.pptx.rel}</small></a> : null}
          </div>
        ) : (
          <div key={index} className="la-batchitem">
            <div className="la-batchname" style={{ color: '#b91c1c' }}>失败：{item.name || item.file}</div>
            <div className="la-hint">{item.error || '失败'}</div>
          </div>
        ))}
      </div>
    )
  }

  const items = []
  if (result.files && result.files.html) items.push(['HTML 课件', result.files.html])
  if (result.files && result.files.pptx) items.push(['PPTX', result.files.pptx])
  if (result.files && result.files.source) items.push(['提取原文', result.files.source])
  if (result.indexPath) items.push(['学习中心', { rel: result.indexPath, url: result.indexUrl }])
  return (
    <div className="la-res">
      <h4>{result.warnings && result.warnings.length ? '生成完成（有质量提醒）' : '生成完成'}：{result.title || ''}</h4>
      {(result.warnings || []).map((warning, index) => <div key={index} className="la-warn">{warning}</div>)}
      {items.map(([label, file], index) => file && file.url ? (
        <a key={index} className="la-link" href={file.url} target="_blank" rel="noreferrer"><span>{label}</span><small>{file.rel}</small></a>
      ) : (
        <div key={index} className="la-link"><span>{label}</span><small>{file ? file.rel : ''}</small></div>
      ))}
      {perfLine ? <div className="la-hint">{perfLine}{perf.rounds ? ` · ${perf.rounds} 轮` : ''}</div> : null}
      {result.check ? <div className="la-hint">排版检查：{result.check.skipped && result.check.error ? `已跳过（${result.check.error}）` : (result.check.problems && result.check.problems.length ? result.check.problems.join('；') : '通过')}</div> : null}
    </div>
  )
}
