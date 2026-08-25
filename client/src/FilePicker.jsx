import React from 'react'

export default function FilePicker({
  dir,
  parent,
  entries,
  pathInput,
  selectedPath,
  selectedName,
  checked,
  onPathInput,
  onListDir,
  onPickFolder,
  onToggle,
  onSelectAll,
  onClearChecked,
  onSelect,
  onRename,
}) {
  const list = entries || []
  const checkedCount = Object.keys(checked || {}).length
  return (
    <div className="la-card">
      <div className="la-sec">1. 选择资料</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="la-input" style={{ flex: 1, minWidth: 0 }} placeholder="输入文件夹路径" value={pathInput}
          onChange={e => onPathInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onListDir(pathInput) }} />
        <button className="la-upbtn" title="选择文件夹" onClick={onPickFolder}>选择</button>
        <button className="la-upbtn" title="进入该文件夹" onClick={() => onListDir(pathInput)}>进入</button>
        <button className="la-upbtn" title="上一级" disabled={!parent} onClick={() => onListDir(parent)}>⬆</button>
      </div>
      <div className="la-dirpath">当前：{dir || '…'}</div>
      <div className="la-hint">输入文件夹保持原样。</div>
      {list.some(entry => !entry.isDir) ? (
        <div className="la-batchbar">
          <button className="la-upbtn" onClick={onSelectAll}>全选</button>
          <button className="la-upbtn" onClick={onClearChecked}>清空</button>
          {checkedCount ? <span className="la-batchcount">已选 {checkedCount} 个文件</span> : null}
        </div>
      ) : null}
      <div className="la-list">
        {entries === null ? <div className="la-hint">正在读取…</div>
          : list.length === 0 ? <div className="la-hint">该文件夹下没有支持的文件（PPTX/DOCX/XLSX/PDF/IPYNB/代码）</div>
          : list.map(entry => entry.isDir ? (
            <div key={entry.path} className="la-dirrow" onClick={() => onListDir(entry.path)}>
              <span>📁</span><span className="la-dirname">{entry.name}</span>
              <button className="la-renbtn" title="重命名" onClick={event => { event.stopPropagation(); onRename(entry) }}>✏️</button>
            </div>
          ) : (
            <div key={entry.path} className={'la-file' + (selectedPath === entry.path ? ' la-on' : '')} onClick={() => onSelect(entry)}>
              <input type="checkbox" className="la-checkbox" checked={!!checked[entry.path]} title="加入本次生成"
                onChange={() => onToggle(entry)} onClick={event => event.stopPropagation()} />
              <span className="la-ext">{(entry.ext || '').slice(1).toUpperCase()}</span>
              <span className="la-fname">{entry.name}</span>
            </div>
          ))}
      </div>
      {selectedPath ? <div className="la-selbox">已选：{selectedName}</div> : null}
    </div>
  )
}
