import React, { useEffect, useRef, useState } from 'react'
import { get, post, fmtTime } from './api.js'
import StatusCard from './StatusCard.jsx'

function ResultView({ r }) {
  const perf = r.performance
  const perfLine = perf ? `总耗时 ${fmtTime(perf.durationMs)} · 模型调用 ${perf.llmCalls || 0} 次${perf.llmFailedCalls ? `（失败 ${perf.llmFailedCalls} 次）` : ''}` : ''
  if (r.results && Array.isArray(r.results)) {
    return (
      <div className="la-res">
        <h4>已完成：{r.okCount || 0}/{r.total || 0} 份</h4>
        {perfLine ? <div className="la-hint">{perfLine}</div> : null}
        {r.indexUrl ? <a className="la-link" href={r.indexUrl} target="_blank" rel="noreferrer"><span>查看全部课程</span><small>{r.indexPath || ''}</small></a> : null}
        {r.results.map((x, i) => x.ok ? (
          <div key={i} className="la-batchitem">
            <div className="la-batchname">{x.title || x.name || x.file}</div>
            {(x.warnings || []).map((warning, warningIndex) => <div key={'w' + warningIndex} className="la-warn">{warning}</div>)}
            {x.files && x.files.html && x.files.html.url ? <a className="la-link" href={x.files.html.url} target="_blank" rel="noreferrer"><span>HTML 课件</span><small>{x.files.html.rel}</small></a> : null}
            {x.files && x.files.pptx && x.files.pptx.url ? <a className="la-link" href={x.files.pptx.url} target="_blank" rel="noreferrer"><span>PPTX</span><small>{x.files.pptx.rel}</small></a> : null}
          </div>
        ) : (
          <div key={i} className="la-batchitem">
            <div className="la-batchname" style={{ color: '#b91c1c' }}>失败：{x.name || x.file}</div>
            <div className="la-hint">{x.error || '失败'}</div>
          </div>
        ))}
      </div>
    )
  }
  const items = []
  if (r.files && r.files.html) items.push(['HTML 课件', r.files.html])
  if (r.files && r.files.pptx) items.push(['PPTX', r.files.pptx])
  if (r.files && r.files.source) items.push(['提取原文', r.files.source])
  if (r.indexPath) items.push(['学习中心', { rel: r.indexPath, url: r.indexUrl }])
  return (
    <div className="la-res">
      <h4>{r.warnings && r.warnings.length ? '生成完成（有质量提醒）' : '生成完成'}：{r.title || ''}</h4>
      {(r.warnings || []).map((warning, i) => <div key={i} className="la-warn">{warning}</div>)}
      {items.map(([label, f], i) => f && f.url ? (
        <a key={i} className="la-link" href={f.url} target="_blank" rel="noreferrer"><span>{label}</span><small>{f.rel}</small></a>
      ) : (
        <div key={i} className="la-link"><span>{label}</span><small>{f ? f.rel : ''}</small></div>
      ))}
      {perfLine ? <div className="la-hint">{perfLine}{perf.rounds ? ` · ${perf.rounds} 轮` : ''}</div> : null}
      {r.check ? <div className="la-hint">排版检查：{r.check.skipped && r.check.error ? `已跳过（${r.check.error}）` : (r.check.problems && r.check.problems.length ? r.check.problems.join('；') : '通过')}</div> : null}
    </div>
  )
}

function SettingsView({ onDone }) {
  const [cfg, setCfg] = useState(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [storageDir, setStorageDir] = useState('')
  const [enableSelfCheck, setEnableSelfCheck] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    get('/api/config').then(c => {
      setCfg(c)
      setBaseUrl(c.llm.baseUrl || '')
      setModel(c.llm.model || '')
      setStorageDir(c.storageDir || '')
      setEnableSelfCheck(c.enableSelfCheck !== false)
    }).catch(e => setMsg('读取配置失败: ' + (e && e.message || e)))
  }, [])

  async function save(test) {
    setBusy(true); setMsg('')
    try {
      const r = await post('/api/config', { llm: { baseUrl, apiKey: apiKey || undefined, model }, enableSelfCheck, test })
      if (r.ok) {
        setCfg(r.config)
        setMsg(test ? '✅ 连接测试通过，配置已保存' : '✅ 配置已保存')
        if (!test) onDone()
      } else {
        setMsg('❌ ' + (r.error || '保存失败'))
      }
    } catch (e) {
      setMsg('❌ ' + (e && e.message || e))
    }
    setBusy(false)
  }

  return (
    <div className="app-page">
      <h1>设置</h1>
      <div className="la-card">
        <div className="la-sec">模型接口</div>
        <label className="la-field">接口地址</label>
        <input className="la-input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
        <label className="la-field">API Key</label>
        <input className="la-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={cfg && cfg.llm.apiKeyMasked ? ('已配置：' + cfg.llm.apiKeyMasked + '（留空不修改）') : 'sk-…'} />
        <label className="la-field">模型名</label>
        <input className="la-input" value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-chat" />
        <div className="la-hint">请使用服务商提供的 OpenAI 兼容接口地址和模型名。</div>
      </div>
      <div className="la-card">
        <div className="la-sec">文件存放</div>
        <label className="la-field">课件资料库</label>
        <input className="la-input" value={storageDir} readOnly />
        <div className="la-hint">HTML、PPTX 和提取文本保存在此处；输入文件夹保持原样。</div>
        <label className="la-check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={enableSelfCheck} onChange={e => setEnableSelfCheck(e.target.checked)} /> 启用渲染自检（需要本机有无头 Chrome/Edge）
        </label>
      </div>
      {msg ? <div className="la-err">{msg}</div> : null}
      <div className="la-actions">
        <button className="la-upbtn" onClick={() => save(false)} disabled={busy}>保存</button>
        <button className="la-go" style={{ flex: 1 }} onClick={() => save(true)} disabled={busy}>{busy ? '测试中…' : '测试连接并保存'}</button>
      </div>
    </div>
  )
}

function Panel() {
  const [dir, setDir] = useState('')
  const [parent, setParent] = useState(null)
  const [entries, setEntries] = useState(null)
  const [pathInput, setPathInput] = useState('')
  const [sel, setSel] = useState('')
  const [selName, setSelName] = useState('')
  const [courseMode, setCourseMode] = useState('')
  const [courseNew, setCourseNew] = useState('')
  const [taxonomy, setTaxonomy] = useState({ courses: [] })
  const [multiMode, setMultiMode] = useState('separate')
  const [combinedName, setCombinedName] = useState('')
  const [depth, setDepth] = useState('standard')
  const [wantHtml, setWantHtml] = useState(true)
  const [wantPptx, setWantPptx] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [liveStatus, setLiveStatus] = useState(null)
  const [checked, setChecked] = useState({})
  const pollRef = useRef(null)

  const stopPoll = () => {
    const active = pollRef.current
    if (active && active.timer) clearTimeout(active.timer)
    pollRef.current = null
  }

  function listDir(d) {
    setErr('')
    post('/api/study-assistant/list', { dir: d || '' })
      .then(r => {
        if (r && r.error) { setErr(r.error); return }
        if (r && Array.isArray(r.entries)) {
          setDir(r.dir || ''); setParent(r.parent); setEntries(r.entries); setPathInput(r.dir || ''); setChecked({}); setSel(''); setSelName('')
          try { localStorage.setItem('la.lastDir', r.dir || '') } catch (e) {}
          loadTaxonomy()
        } else setErr('无法读取目录')
      })
      .catch(e => setErr('读取失败: ' + (e && e.message || e)))
  }

  function loadTaxonomy() {
    get('/api/study-assistant/archive-taxonomy')
      .then(r => { if (r && Array.isArray(r.courses)) setTaxonomy({ courses: r.courses }) })
      .catch(() => {})
  }

  function renderResultOf(r) {
    setBusy(false); setLiveStatus(null)
    loadTaxonomy()
    if (r && r.batch) { setResult(r); return }
    if (r && r.ok) setResult(r)
    else setErr((r && r.error) || '生成失败')
  }

  function pollJob(job) {
    stopPoll()
    try { localStorage.setItem('la.lastJob', job) } catch (e) {}
    let missing = 0
    const active = { job, timer: null }
    pollRef.current = active
    const tick = async () => {
      try {
        const s = await get('/api/study-assistant/status?job=' + encodeURIComponent(job) + '&_=' + Date.now())
        if (!s || !s.found) {
          missing++
          if (missing > 20) { stopPoll(); renderResultOf({ ok: false, error: '任务状态丢失（服务可能已重启），请重新生成' }) }
        } else {
          missing = 0
          if (s.stage === 'done' || s.stage === 'error') {
            stopPoll()
            renderResultOf(s.result || { ok: false, error: (s.detail || '生成失败') })
          } else setLiveStatus(s)
        }
      } catch (e) {
        // 短暂断线时保留当前状态；下一轮继续尝试。
      } finally {
        if (pollRef.current === active) active.timer = setTimeout(tick, 1500)
      }
    }
    tick()
  }

  useEffect(() => {
    let startDir = ''
    try { startDir = localStorage.getItem('la.lastDir') || '' } catch (e) {}
    listDir(startDir)
    let lastJob = ''
    try { lastJob = localStorage.getItem('la.lastJob') || '' } catch (e) {}
    if (!lastJob) return stopPoll
    get('/api/study-assistant/status?job=' + encodeURIComponent(lastJob))
      .then(s => {
        if (!s || !s.found) { try { localStorage.removeItem('la.lastJob') } catch (e) {} return }
        if (s.stage === 'done' || s.stage === 'error') { renderResultOf(s.result || { ok: false, error: (s.detail || '生成失败') }); return }
        setBusy(true)
        pollJob(lastJob)
      })
      .catch(() => {})
    return stopPoll
  }, [])

  function pickFolder() {
    setErr('')
    get('/api/study-assistant/pick-folder')
      .then(r => {
        if (r && r.ok && r.dir) { setPathInput(r.dir); listDir(r.dir) }
        else if (r && r.cancelled) {}
        else setErr((r && r.error) || '选择文件夹失败')
      })
      .catch(e => setErr('选择文件夹失败: ' + (e && e.message || e)))
  }

  function toggleCheck(e) {
    setChecked(c => { const n = { ...c }; if (n[e.path]) delete n[e.path]; else n[e.path] = e.name; return n })
  }
  function selectAllFiles() {
    const m = {}
    ;(entries || []).forEach(e => { if (!e.isDir) m[e.path] = e.name })
    setChecked(m)
  }
  function renameEntry(e) {
    const nn = window.prompt('重命名为（当前：' + e.name + '）', e.name)
    if (!nn || nn === e.name) return
    post('/api/study-assistant/rename', { from: e.path, to: nn })
      .then(r => { if (r && r.ok) { listDir(dir); loadTaxonomy() } else setErr((r && r.error) || '重命名失败') })
      .catch(e2 => setErr('重命名失败: ' + (e2 && e2.message || e2)))
  }

  function start() {
    const keys = Object.keys(checked)
    if (!keys.length && !sel) { setErr('请先选择或勾选文件'); return }
    if (!wantHtml && !wantPptx) { setErr('至少选择一种输出格式'); return }
    const selectedCourse = (taxonomy.courses || []).find(course => course.rel === courseMode)
    const courseVal = courseMode === '__new' ? courseNew.trim() : (selectedCourse && selectedCourse.name) || ''
    const coursePath = selectedCourse ? selectedCourse.rel : ''
    if (!courseVal) { setErr(courseMode === '__new' ? '请输入新课程名称' : '请选择已有课程或新建课程'); return }
    const isBatch = keys.length > 0
    const isCombined = keys.length > 1 && multiMode === 'combined'
    const currentFile = isCombined ? keys.length + ' 份资料（合并）' : (isBatch ? (checked[keys[0]] || keys[0]) : selName)
    setBusy(true); setErr(''); setResult(null)
    setLiveStatus({ found: true, stage: 'extract', detail: '正在提交生成任务…', currentFile, started: Date.now(), elapsed: 0, timeline: [] })
    const job = (isCombined ? 'comb-' : (isBatch ? 'bat-' : 'la-')) + Date.now() + '-' + Math.floor(Math.random() * 1e6)
    const body = isBatch
      ? { files: keys, mode: isCombined ? 'combined' : 'separate', outputName: isCombined ? combinedName.trim() : '', course: courseVal, coursePath, depth, html: wantHtml, pptx: wantPptx, job }
      : { rel: sel, course: courseVal, coursePath, depth, html: wantHtml, pptx: wantPptx, job }
    post(isBatch ? '/api/study-assistant/generate-batch' : '/api/study-assistant/generate', body)
      .then(r => {
        if (r && r.ok) {
          if (r.started) pollJob(r.job || job)
          else { setBusy(false); setLiveStatus(null); setResult(r) }
        } else { setBusy(false); setLiveStatus(null); setErr((r && r.error) || '任务提交失败') }
      })
      .catch(e => { setBusy(false); setLiveStatus(null); setErr('任务提交异常: ' + (e && e.message || e)) })
  }

  const list = entries || []
  const checkedKeys = Object.keys(checked)

  return (
    <div className="app-page">
      <h1>生成课件</h1>
      <div className="la-card">
        <div className="la-sec">1. 选择资料</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="la-input" style={{ flex: 1, minWidth: 0 }} placeholder="输入文件夹路径" value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') listDir(pathInput) }} />
          <button className="la-upbtn" title="选择文件夹" onClick={pickFolder}>选择</button>
          <button className="la-upbtn" title="进入该文件夹" onClick={() => listDir(pathInput)}>进入</button>
          <button className="la-upbtn" title="上一级" disabled={!parent} onClick={() => listDir(parent)}>⬆</button>
        </div>
        <div className="la-dirpath">当前：{dir || '…'}</div>
        <div className="la-hint">输入文件夹保持原样。</div>
        {list.some(e => !e.isDir) ? (
          <div className="la-batchbar">
            <button className="la-upbtn" onClick={selectAllFiles}>全选</button>
            <button className="la-upbtn" onClick={() => setChecked({})}>清空</button>
            {checkedKeys.length ? <span className="la-batchcount">已选 {checkedKeys.length} 个文件</span> : null}
          </div>
        ) : null}
        <div className="la-list">
          {entries === null ? <div className="la-hint">正在读取…</div>
            : list.length === 0 ? <div className="la-hint">该文件夹下没有支持的文件（PPTX/DOCX/XLSX/PDF/IPYNB/代码）</div>
            : list.map(e => e.isDir ? (
              <div key={e.path} className="la-dirrow" onClick={() => listDir(e.path)}>
                <span>📁</span><span className="la-dirname">{e.name}</span>
                <button className="la-renbtn" title="重命名" onClick={ev => { ev.stopPropagation(); renameEntry(e) }}>✏️</button>
              </div>
            ) : (
              <div key={e.path} className={'la-file' + (sel === e.path ? ' la-on' : '')} onClick={() => { setSel(e.path); setSelName(e.name) }}>
                <input type="checkbox" className="la-checkbox" checked={!!checked[e.path]} title="加入本次生成"
                  onChange={() => toggleCheck(e)} onClick={ev => ev.stopPropagation()} />
                <span className="la-ext">{(e.ext || '').slice(1).toUpperCase()}</span>
                <span className="la-fname">{e.name}</span>
              </div>
            ))}
        </div>
        {sel ? <div className="la-selbox">已选：{selName}</div> : null}
      </div>
      <div className="la-card">
        <div className="la-sec">2. 课程</div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <button className="la-upbtn" onClick={() => loadTaxonomy()}>刷新列表</button>
        </div>
        <select className="la-input" value={courseMode} onChange={e => setCourseMode(e.target.value)}>
          <option value="">请选择课程</option>
          {(taxonomy.courses || []).map(course => <option key={course.rel} value={course.rel}>{course.name}</option>)}
          <option value="__new">新建课程…</option>
        </select>
        {courseMode === '__new' ? <input className="la-input" placeholder="新课程名称" value={courseNew} onChange={e => setCourseNew(e.target.value)} /> : null}
        {checkedKeys.length > 1 ? (
          <>
            <div className="la-sec">3. 多文件处理</div>
            <div className="la-modegrid">
              <label className={'la-mode' + (multiMode === 'separate' ? ' la-mode-on' : '')}>
                <input type="radio" name="multiMode" value="separate" checked={multiMode === 'separate'} onChange={() => setMultiMode('separate')} />
                <strong>分别生成</strong><span>每份英文资料输出一套中文课件</span>
              </label>
              <label className={'la-mode' + (multiMode === 'combined' ? ' la-mode-on' : '')}>
                <input type="radio" name="multiMode" value="combined" checked={multiMode === 'combined'} onChange={() => setMultiMode('combined')} />
                <strong>合并生成</strong><span>综合去重后输出一套中文课件</span>
              </label>
            </div>
            {multiMode === 'combined' ? <input className="la-input" placeholder="合并课件文件名（可选）" value={combinedName} onChange={e => setCombinedName(e.target.value)} /> : null}
          </>
        ) : null}
        <div className="la-sec">{checkedKeys.length > 1 ? '4' : '3'}. 讲解深度</div>
        <select className="la-input" value={depth} onChange={e => setDepth(e.target.value)}>
          <option value="concise">简明：核心内容</option>
          <option value="standard">标准：完整讲解</option>
          <option value="detailed">深入：增加推导与延伸</option>
        </select>
        <div className="la-checks">
          <label className="la-check"><input type="checkbox" checked={wantHtml} onChange={e => setWantHtml(e.target.checked)} /> HTML 课件</label>
          <label className="la-check"><input type="checkbox" checked={wantPptx} onChange={e => setWantPptx(e.target.checked)} /> PPTX</label>
        </div>
        <button className="la-go" disabled={busy} onClick={start}>
          {busy ? '生成中…' : (checkedKeys.length > 1 && multiMode === 'combined' ? '合并生成 1 份课件' : (checkedKeys.length ? '分别生成 ' + checkedKeys.length + ' 份课件' : '生成课件'))}
        </button>
        {liveStatus ? <StatusCard s={liveStatus} /> : null}
        {err ? <div className="la-err">{err}</div> : null}
        {result ? <ResultView r={result} /> : null}
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState(() => { try { return localStorage.getItem('la.view') || 'panel' } catch (e) { return 'panel' } })
  const switchView = (v) => { setView(v); try { localStorage.setItem('la.view', v) } catch (e) {} }
  return (
    <div className="app-shell">
      <header className="app-head">
        <div className="app-title" onClick={() => switchView('panel')}>宝宝巴士</div>
        <div className="app-head-actions">
          <a className="la-upbtn" href="/api/study-assistant/learning-center" target="_blank" rel="noreferrer">学习中心</a>
          <button className="la-upbtn" onClick={() => switchView(view === 'settings' ? 'panel' : 'settings')}>
            {view === 'settings' ? '返回' : '设置'}
          </button>
        </div>
      </header>
      {view === 'settings' ? <SettingsView onDone={() => switchView('panel')} /> : <Panel />}
    </div>
  )
}
