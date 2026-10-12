// A search box above every data table in the app: type to filter its rows (all words must match). Skips tables inside
// written content (editor, Markdown, invoices) and any element marked data-nosearch. Re-applies when rows change.
export default defineNuxtPlugin(() => {
  const SKIP = '.mdb, .md, .ProseMirror, .re, .inv, .invoice, .doc-body, [data-nosearch]'
  const tables = new Map<HTMLTableElement, { bar: HTMLElement; input: HTMLInputElement; count: HTMLElement }>()
  const rowsOf = (t: HTMLTableElement) => Array.from(t.tBodies).flatMap((b) => Array.from(b.rows))
  function filter(t: HTMLTableElement) {
    const e = tables.get(t); if (!e) return
    const words = e.input.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
    let shown = 0; const all = rowsOf(t)
    for (const r of all) { const hit = !words.length || words.every((w) => (r.textContent ?? '').toLowerCase().includes(w)); r.style.display = hit ? '' : 'none'; if (hit) shown++ }
    e.count.textContent = words.length ? shown + ' of ' + all.length : ''
  }
  // Put the box before the table's own wrapper (a scroll box or bordered card that holds only the table).
  function anchorOf(t: HTMLTableElement): HTMLElement {
    let el: HTMLElement = t
    while (el.parentElement && el.parentElement.id !== 'main' && !el.parentElement.classList.contains('inner') && el.parentElement.children.length === 1 && el.parentElement.tagName !== 'SECTION') el = el.parentElement
    return el
  }
  function attach(t: HTMLTableElement) {
    if (tables.has(t) || !t.closest('#main') || t.closest(SKIP) || rowsOf(t).length < 2) return
    const bar = document.createElement('div'); bar.className = 'tsr'; bar.setAttribute('data-tsr', '')
    bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search this table" aria-label="Search this table"><span class="tsr-n"></span>'
    const input = bar.querySelector('input')!, count = bar.querySelector('.tsr-n') as HTMLElement
    input.addEventListener('input', () => filter(t))
    const a = anchorOf(t); a.parentElement?.insertBefore(bar, a)
    tables.set(t, { bar, input, count })
  }
  let queued = false
  function scan() {
    queued = false
    for (const [t, e] of tables) { if (!t.isConnected) { e.bar.remove(); tables.delete(t) } else if (e.input.value) filter(t) }
    document.querySelectorAll<HTMLTableElement>('#main table').forEach(attach)
  }
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(scan) } }
  if (typeof MutationObserver === 'undefined') return
  const start = () => { new MutationObserver((list) => { if (list.some((m) => !(m.target as HTMLElement).closest?.('[data-tsr]'))) later() }).observe(document.body, { childList: true, subtree: true }); later() }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start()
})
