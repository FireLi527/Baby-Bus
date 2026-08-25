import React, { useEffect, useState } from 'react'
import { get, post } from './api.js'
import FilePicker from './FilePicker.jsx'
import GenerationOptions from './GenerationOptions.jsx'
import { buildGenerationSubmission } from './generation-request.js'
import useJobPolling from './useJobPolling.js'

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
  const [checked, setChecked] = useState({})

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
    setBusy(false); clearStatus()
    loadTaxonomy()
    if (r && r.batch) { setResult(r); return }
    if (r && r.ok) setResult(r)
    else setErr((r && r.error) || '生成失败')
  }

  const { liveStatus, pollJob, resumeJob, beginStatus, clearStatus } = useJobPolling(renderResultOf)

  useEffect(() => {
    let startDir = ''
    try { startDir = localStorage.getItem('la.lastDir') || '' } catch (e) {}
    listDir(startDir)
    let lastJob = ''
    try { lastJob = localStorage.getItem('la.lastJob') || '' } catch (e) {}
    if (lastJob) resumeJob(lastJob).then(active => { if (active) setBusy(true) })
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
    const isCombined = keys.length > 1 && multiMode === 'combined'
    const isBatch = keys.length > 0
    const job = (isCombined ? 'comb-' : (isBatch ? 'bat-' : 'la-')) + Date.now() + '-' + Math.floor(Math.random() * 1e6)
    const submission = buildGenerationSubmission({
      checked,
      selectedPath: sel,
      selectedName: selName,
      courses: taxonomy.courses,
      courseMode,
      newCourseName: courseNew,
      multiMode,
      combinedName,
      depth,
      wantHtml,
      wantPptx,
      job,
    })
    if (submission.error) { setErr(submission.error); return }
    setBusy(true); setErr(''); setResult(null)
    beginStatus({ found: true, stage: 'extract', detail: '正在提交生成任务…', currentFile: submission.currentFile, started: Date.now(), elapsed: 0, timeline: [] })
    post(submission.endpoint, submission.body)
      .then(r => {
        if (r && r.ok) {
          if (r.started) pollJob(r.job || job)
          else renderResultOf(r)
        } else { setBusy(false); clearStatus(); setErr((r && r.error) || '任务提交失败') }
      })
      .catch(e => { setBusy(false); clearStatus(); setErr('任务提交异常: ' + (e && e.message || e)) })
  }

  const checkedKeys = Object.keys(checked)

  return (
    <div className="app-page">
      <h1>生成课件</h1>
      <FilePicker
        dir={dir}
        parent={parent}
        entries={entries}
        pathInput={pathInput}
        selectedPath={sel}
        selectedName={selName}
        checked={checked}
        onPathInput={setPathInput}
        onListDir={listDir}
        onPickFolder={pickFolder}
        onToggle={toggleCheck}
        onSelectAll={selectAllFiles}
        onClearChecked={() => setChecked({})}
        onSelect={entry => { setSel(entry.path); setSelName(entry.name) }}
        onRename={renameEntry}
      />
      <GenerationOptions
        courses={taxonomy.courses}
        courseMode={courseMode}
        courseNew={courseNew}
        multiMode={multiMode}
        combinedName={combinedName}
        depth={depth}
        wantHtml={wantHtml}
        wantPptx={wantPptx}
        checkedCount={checkedKeys.length}
        busy={busy}
        liveStatus={liveStatus}
        error={err}
        result={result}
        onRefreshCourses={loadTaxonomy}
        onCourseMode={setCourseMode}
        onCourseNew={setCourseNew}
        onMultiMode={setMultiMode}
        onCombinedName={setCombinedName}
        onDepth={setDepth}
        onWantHtml={setWantHtml}
        onWantPptx={setWantPptx}
        onStart={start}
      />
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
