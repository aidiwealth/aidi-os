// Every data table in the app gets a search box above it and, when it is long, pages below it (25 rows a page, or
// 50 / 100). Lists marked data-paginate get the same pages for their items. Tables inside written content (editor,
// Markdown, invoices) and anything marked data-nosearch are left alone; data-nopage keeps search but not pages.
// Starts only after the app has hydrated, so the server-rendered page is never changed under Vue.
export default defineNuxtPlugin((nuxtApp) => {
  const SKIP = '.mdb, .md, .ProseMirror, .re, .inv, .invoice, .doc-body, [data-nosearch]'
  const SIZES = [25, 50, 100]
  interface St { bar: HTMLElement | null; input: HTMLInputElement | null; count: HTMLElement | null; pager: HTMLElement; page: number; size: number; anchor: HTMLElement }
  const tables = new Map<HTMLElement, St>()
  const itemsOf = (el: HTMLElement): HTMLElement[] => el.tagName === 'TABLE' ? Array.from((el as HTMLTableElement).tBodies).flatMap((b) => Array.from(b.rows)) : (Array.from(el.children) as HTMLElement[]).filter((c) => !c.hasAttribute('data-tsr'))
  const pageable = (el: HTMLElement) => !el.closest('[data-nopage]')
  function apply(el: HTMLElement) {
    const s = tables.get(el); if (!s) return
    const words = (s.input?.value ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean)
    const all = itemsOf(el), hits: HTMLElement[] = []
    for (const r of all) { const hit = !words.length || words.every((w) => (r.textContent ?? '').toLowerCase().includes(w)); if (hit) hits.push(r); else r.style.display = 'none' }
    const paged = pageable(el) && hits.length > SIZES[0]!
    const pages = paged ? Math.ceil(hits.length / s.size) : 1
    s.page = Math.min(s.page, pages - 1)
    hits.forEach((r, i) => { r.style.display = !paged || (i >= s.page * s.size && i < (s.page + 1) * s.size) ? '' : 'none' })
    if (s.count) s.count.textContent = words.length ? hits.length + ' of ' + all.length : ''
    s.pager.hidden = !paged
    if (paged) {
      const from = s.page * s.size + 1, to = Math.min(hits.length, (s.page + 1) * s.size)
      s.pager.innerHTML = '<span class="tpg-n">' + from + '–' + to + ' of ' + hits.length + '</span>' +
        '<label class="tpg-s">Show <select aria-label="Rows per page">' + SIZES.map((n) => '<option' + (n === s.size ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<button type="button" data-p="prev"' + (s.page === 0 ? ' disabled' : '') + ' aria-label="Previous page">‹ Prev</button><span class="tpg-p">Page ' + (s.page + 1) + ' of ' + pages + '</span>' +
        '<button type="button" data-p="next"' + (s.page >= pages - 1 ? ' disabled' : '') + ' aria-label="Next page">Next ›</button>'
    }
  }
  // Put the box before the table's own wrapper (a scroll box or bordered card that holds only the table).
  function anchorOf(t: HTMLElement): HTMLElement {
    let el: HTMLElement = t
    while (el.parentElement && el.parentElement.id !== 'main' && !el.parentElement.classList.contains('inner') && el.parentElement.children.length === 1 && el.parentElement.tagName !== 'SECTION') el = el.parentElement
    return el
  }
  function attach(el: HTMLElement, search: boolean) {
    if (tables.has(el) || !el.closest('#main') || el.closest(SKIP)) return
    const n = itemsOf(el).length
    if (n < 2 || (!search && n <= SIZES[0]!)) return
    const a = anchorOf(el)
    let bar: HTMLElement | null = null, input: HTMLInputElement | null = null, count: HTMLElement | null = null
    if (search) {
      bar = document.createElement('div'); bar.className = 'tsr'; bar.setAttribute('data-tsr', '')
      bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search this table" aria-label="Search this table"><span class="tsr-n"></span>'
      input = bar.querySelector('input')!; count = bar.querySelector('.tsr-n') as HTMLElement
      input.addEventListener('input', () => { const s = tables.get(el); if (s) s.page = 0; apply(el) })
      a.parentElement?.insertBefore(bar, a)
    }
    const pager = document.createElement('div'); pager.className = 'tpg'; pager.setAttribute('data-tsr', ''); pager.hidden = true
    pager.addEventListener('click', (ev) => { const b = (ev.target as HTMLElement).closest('button'); const s = tables.get(el); if (!b || !s) return; s.page += b.dataset.p === 'next' ? 1 : -1; if (s.page < 0) s.page = 0; apply(el); a.scrollIntoView?.({ block: 'nearest' }) })
    pager.addEventListener('change', (ev) => { const s = tables.get(el); if (!s) return; s.size = Number((ev.target as HTMLSelectElement).value) || SIZES[0]!; s.page = 0; apply(el) })
    a.parentElement?.insertBefore(pager, a.nextSibling)
    tables.set(el, { bar, input, count, pager, page: 0, size: SIZES[0]!, anchor: a })
    apply(el)
  }
  let queued = false
  function scan() {
    queued = false
    for (const [t, e] of tables) { if (!t.isConnected) { e.bar?.remove(); e.pager.remove(); tables.delete(t) } else apply(t) }
    document.querySelectorAll<HTMLElement>('#main table').forEach((t) => attach(t, true))
    document.querySelectorAll<HTMLElement>('#main [data-paginate]').forEach((l) => attach(l, false))
  }
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(scan) } }
  if (typeof MutationObserver === 'undefined') return
  let started = false
  const start = () => {
    if (started) return; started = true
    new MutationObserver((list) => { if (list.some((m) => !(m.target as HTMLElement).closest?.('[data-tsr]'))) later() }).observe(document.body, { childList: true, subtree: true })
    later()
  }
  // After hydration has fully finished (async pages included) and the browser is idle; app:mounted is too early, as a
  // page still hydrating would find these extra elements and mismatch.
  onNuxtReady(() => { start() })
  nuxtApp.hook('page:finish', () => { if (started) later() })
})
