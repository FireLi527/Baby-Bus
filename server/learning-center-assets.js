// 学习中心独立资源。不要放进 embedded.mjs，避免重新抽取课件渲染器时被覆盖。
export const INDEX_CSS = `body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;background:#f7f8fb;color:#1c2333;margin:0;line-height:1.7}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px}
h1{font-size:26px}
.ix-note{color:#6b7280;font-size:13px;margin:-12px 0 14px}
.ix-course{background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin:12px 0;box-shadow:0 1px 3px rgba(16,24,40,.05);overflow:hidden}
.ix-course summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 20px;cursor:pointer;list-style:none}
.ix-course summary::-webkit-details-marker{display:none}
.ix-course summary:after{content:'›';color:#64748b;font-size:25px;line-height:1;transition:transform .18s ease}
.ix-course[open] summary:after{transform:rotate(90deg)}
.ix-course[open] summary{border-bottom:1px solid #e5e7eb}
.ix-title{font-size:18px;font-weight:700;color:#1f2937}
.ix-count{margin-left:auto;color:#6b7280;font-size:13px;white-space:nowrap}
.ix-materials{padding:4px 20px 10px}
.ix-course-tools{padding:12px 20px 0}
.ix-material{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid #eef0f4}
.ix-material:last-child{border-bottom:0}
.ix-material-title{font-size:15px;font-weight:650;color:#263044}
.ix-meta{color:#6b7280;font-size:13px;margin-top:4px}
.ix-actions{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}
.ix-action{display:inline-block;color:#4f46e5;text-decoration:none;font-size:13px;font-weight:600;background:#eef2ff;border:1px solid #c7d2fe;border-radius:7px;padding:5px 10px}
.ix-action:hover{background:#e0e7ff}
.ix-gloss{display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;color:#4f46e5;border-radius:8px;padding:6px 14px;text-decoration:none;font-weight:600;font-size:14px}
.ix-gloss:hover{background:#e0e7ff}
.ix-empty{color:#6b7280}
@media(max-width:640px){.ix-material{align-items:flex-start;flex-direction:column}.ix-actions{margin-top:2px}.ix-course summary{padding:15px 16px}.ix-materials{padding-left:16px;padding-right:16px}}`

export const IX_JS = `(function(){
  var ABS = '/study-assistant/file?p='
  document.addEventListener('click', function(ev){
    var t = ev.target
    var a = t && t.closest ? t.closest('a.ix-open') : null
    if (!a) return
    if (location.protocol === 'file:') return
    ev.preventDefault()
    var abs = a.getAttribute('data-abs') || ''
    var go = function(url){ var w = window.open(url, '_blank'); if (!w) location.href = url }
    if (!abs) { go(a.getAttribute('href')) ; return }
    fetch('/api/study-assistant/resolve-course?p=' + encodeURIComponent(abs))
      .then(function(r){ return r.json() })
      .then(function(j){ go(j.url || ABS + encodeURIComponent(abs)) })
      .catch(function(){ go(ABS + encodeURIComponent(abs)) })
  })
  var version = document.documentElement.getAttribute('data-center-version') || ''
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    setInterval(function(){
      if (document.hidden) return
      fetch(location.href, { cache: 'no-store' })
        .then(function(r){ return r.text() })
        .then(function(html){
          var match = html.match(/data-center-version=['\"]([^'\"]+)/)
          if (match && match[1] !== version) location.reload()
        })
        .catch(function(){})
    }, 10000)
  } else if (location.protocol === 'file:') {
    setInterval(function(){ if (!document.hidden) location.reload() }, 30000)
  }
})()`
