<script setup lang="ts">
// Live-linked spreadsheets: link a shared Google Sheet, Excel online or Dropbox file, choose which rows feed
// Financials (statement lines and custom metrics) or a forecast, and it stays in step: read on open, daily, or on
// "Sync now".
interface Link { show_source?: boolean; id: string; name: string; url: string; target: 'financials' | 'forecast'; subject: string | null; forecast_id: string | null; forecast: string | null; currency: string; sheet: string | null; mapping: { label: string; to: string }[]; auto: boolean; mode?: 'rows' | 'ai'; ai_map?: AiM | null; last_synced_at: string | null; last_error: string | null; last_result: { months?: number; skipped?: string[]; sheet?: string } | null }
interface AiBlock { sheet: string; title: string; label_col: string; scale: number; periods: { col: string; period_type: string; period_end: string; projected: boolean }[]; rows: { row: number; label: string; to: string; kpi: string; pct: boolean }[]; use?: boolean }
interface AiM { company: { name: string; description: string; website: string }; reporting_currency: string; fiscal_year_end: string; tabs: { sheet: string; what: string; used: boolean }[]; blocks: AiBlock[]; facts: { sheet: string; label: string; value: string; goes_to: string }[]; suggestions: { metric: string; why: string }[]; notes: string }
interface AiRes { template?: boolean; document_id?: string | null; file?: string | null; provider: string; tabs: string[]; map: AiM; preview: { months: number; quarters: number; years: number; projected: number; missing: string[]; found: number; periods: { period_type: string; period_end: string; lines: number; kpis: number; revenue: number | null; net_income: number | null; cash: number | null; total_assets?: number | null; total_liabilities?: number | null; equity?: number | null }[] } }
interface Prev { provider: string; document_id?: string | null; file?: string | null; keys: { key: string; label: string }[]; sheets: { sheet: string; months: string[]; rows: { label: string; last_month: string; last_value: number; months: number }[]; suggestion: { label: string; to: string }[] }[] }
const props = withDefaults(defineProps<{ target: 'financials' | 'forecast'; subject?: string; subjectLabel?: string; currency?: string; forecasts?: { id: string; name: string }[]; forecastId?: string; canEdit?: boolean }>(), { subject: '', subjectLabel: '', currency: 'USD', forecasts: () => [], forecastId: '', canEdit: false })
const emit = defineEmits<{ synced: [] }>()
const links = ref<Link[]>([])
// A forecast's links: only those of the forecasts on this page (in a group, the company's own).
// Rolled up to one line once sheets are linked, if the person chose so (remembered per browser, per kind).
const rolled = ref(false)
onMounted(() => { try { rolled.value = localStorage.getItem('sheets-rolled:' + props.target) === '1' } catch { /* no storage */ } })
watch(rolled, (v) => { try { localStorage.setItem('sheets-rolled:' + props.target, v ? '1' : '0') } catch { /* no storage */ } })
const shown = computed(() => links.value.filter((l) => (props.target === 'forecast' ? !props.forecasts || !l.forecast_id || props.forecasts.some((f) => f.id === l.forecast_id) : !props.subject || l.subject === props.subject)))
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? d
async function showSource(l: Link, v: boolean) { try { await $fetch('/api/financials/visibility', { method: 'POST', body: { link_id: l.id, show_source: v } }); l.show_source = v } catch { /* left as it was */ } }
async function load() { try { links.value = (await $fetch<{ links: Link[] }>('/api/sheet-links', { query: { target: props.target } })).links } catch { links.value = [] } }
onMounted(async () => {
  await load()
  // Bring stale links up to date in the background, then refresh what the page shows.
  if (links.value.some((l) => l.auto && (!l.last_synced_at || Date.now() - new Date(l.last_synced_at).getTime() > 3600_000))) {
    try { const r = await $fetch<{ synced: number }>('/api/sheet-links/stale', { method: 'POST', query: { target: props.target } }); await load(); if (r.synced) emit('synced') } catch { /* shown on the link */ }
  }
})
const busyId = ref(''), note = ref(''), noteErr = ref(false)
async function syncNow(l: Link) {
  busyId.value = l.id; note.value = ''
  try { const r = await $fetch<{ months: number; skipped: string[] }>('/api/sheet-links/' + l.id + '/sync', { method: 'POST' }); note.value = l.name + ': ' + r.months + ' month' + (r.months === 1 ? '' : 's') + ' updated' + (r.skipped.length ? '; skipped ' + r.skipped.join(', ') : '') + '.'; noteErr.value = false; emit('synced') }
  catch (e) { note.value = err(e, 'Could not read the sheet.'); noteErr.value = true } finally { busyId.value = ''; await load() }
}
async function unlink(l: Link) { if (!confirm('Unlink "' + l.name + '"? Figures already brought in stay.')) return; await $fetch('/api/sheet-links/' + l.id, { method: 'DELETE' }).catch(() => {}); await load() }
const ago = (t: string | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago' }
const mon = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// The link form.
const open = ref(false), step = ref(1), busy = ref(false), msg = ref('')
const f = reactive({ id: '', name: '', url: '', sheet: '', forecast_id: '', currency: 'USD', auto: true, mode: 'ai' as 'rows' | 'ai' })
const ai = ref<AiRes | null>(null), openB = ref<number | null>(null)
// Before the first link, the founder checks the latest months' key figures against the sheet (a row in the wrong
// line that still adds up is the one mistake no check can catch).
const confirmed = ref(false)
const recent = computed(() => (ai.value?.preview.periods ?? []).filter((p) => p.period_type === 'month').slice(-3).reverse())
const prev = ref<Prev | null>(null), map = ref<Record<string, string>>({}), keep = ref<{ label: string; to: string }[] | null>(null)
const tab = computed(() => prev.value?.sheets.find((s) => s.sheet === f.sheet) ?? prev.value?.sheets[0] ?? null)
function start(l?: Link) {
  Object.assign(f, { id: l?.id ?? '', name: l?.name ?? '', url: l?.url ?? '', sheet: l?.sheet ?? '', forecast_id: l?.forecast_id ?? props.forecastId ?? props.forecasts[0]?.id ?? '', currency: l?.currency ?? props.currency, auto: l?.auto ?? true, mode: 'rows' })
  keep.value = l?.mapping ?? null; prev.value = null; ai.value = null; confirmed.value = !!l; fail.value = null; upFile.value = null; openB.value = null; map.value = {}; msg.value = ''; step.value = 1; open.value = true
  // A link first read with AI opens here as rows to choose: figures come only from rows the founder picked.
  if (l) read()
}
function applyMap() {
  const t = tab.value; if (!t) return
  const src = keep.value && (f.sheet === '' || t.sheet === f.sheet) ? keep.value : t.suggestion
  map.value = Object.fromEntries(t.rows.map((r) => [r.label, src.find((m) => m.label.toLowerCase() === r.label.toLowerCase())?.to ?? '']))
  // A row named like one of the company's own categories goes there.
  for (const r of t.rows) if (!map.value[r.label]) { const a = accts.value.find((x) => x.name.toLowerCase() === r.label.trim().toLowerCase()); if (a) map.value[r.label] = 'cat:' + a.parent + ':' + a.name }
  // A suggested category that already exists keeps the line it was saved under.
  for (const [k, v] of Object.entries(map.value)) if (v.startsWith('cat:')) { const nm = v.split(':').slice(2).join(':').toLowerCase(); const a = accts.value.find((x) => x.name.toLowerCase() === nm); if (a) map.value[k] = 'cat:' + a.parent + ':' + a.name }
}
// The company's own categories (chart of accounts): rows that are not a standard line go into one instead of failing.
const accts = ref<{ id: string; name: string; parent: string }[]>([])
async function loadAccts() { if (props.target !== 'financials') return; try { accts.value = (await $fetch<{ accounts: { id: string; name: string; parent: string }[] }>('/api/financials/accounts')).accounts } catch { /* optional */ } }
const nc = reactive({ row: '', name: '', parent: 'opex_other', busy: false, msg: '' })
function pick(label: string, v: string) { if (v === '__new') { map.value[label] = ''; Object.assign(nc, { row: label, name: label.replace(/\s*\(\d+\)$/, ''), parent: guessParent(label), msg: '' }) } }
function guessParent(l: string) { const s = l.toLowerCase(); return /payable|accrued|prepayment|deferred|liabilit|tax(es)? payable/.test(s) ? 'other_liabilities' : /capital|equity|reserve|retained|treasury|share/.test(s) ? 'equity' : /strategic|stake|associate|long[- ]term invest|equity invest/.test(s) ? 'long_term_investments' : /receivable|prepaid|investment|property|equipment|intangible|asset|loan/.test(s) ? 'other_assets' : /income|gain|dividend|interest earned/.test(s) ? 'other_income' : /cost of (sales|revenue)|direct/.test(s) ? 'cogs' : 'opex_other' }
async function addCat() {
  nc.busy = true; nc.msg = ''
  try { const r = await $fetch<{ id: string; name: string; parent: string; to: string }>('/api/financials/accounts', { method: 'POST', body: { name: nc.name, parent: nc.parent } }); if (!accts.value.some((a) => a.id === r.id)) accts.value.push({ id: r.id, name: r.name, parent: r.parent }); map.value[nc.row] = r.to; nc.row = '' }
  catch (e) { nc.msg = err(e, 'Could not add the category.') } finally { nc.busy = false }
}
const catLabel = (a: { name: string; parent: string }) => a.name + (a.parent ? ' (in ' + (LINE_LABEL[a.parent] ?? a.parent) + ')' : ' (detail only)')
async function read() {
  if (!upFile.value && !f.url.trim()) { msg.value = props.target === 'financials' ? 'Paste the share link, or upload the file.' : 'Paste the share link.'; return }
  busy.value = true; msg.value = ''
  try {
    await loadAccts()
    let body: FormData | Record<string, string>
    if (upFile.value) { const fd = new FormData(); fd.append('file', upFile.value); fd.append('target', props.target); body = fd }
    else body = { url: f.url, target: props.target }
    prev.value = await $fetch<Prev>('/api/sheet-links/preview', { method: 'POST', body })
    if (!prev.value.sheets.some((s) => s.sheet === f.sheet)) f.sheet = prev.value.sheets[0]!.sheet
    if (!f.name) f.name = prev.value.file ? prev.value.file : f.sheet ? prev.value.provider + ': ' + f.sheet : prev.value.provider
    applyMap(); step.value = 2
  } catch (e) { msg.value = err(e, 'Could not read that sheet.') } finally { busy.value = false }
}
// Read with AI: the whole workbook, any layout.
// The read runs on the server in the background; this follows it and shows where it is.
const prog = ref(''), fail = ref<{ message: string; advice: string[] } | null>(null)
const STAGE: Record<string, string> = { fetch: 'Fetching the workbook…', parse: 'Opening the workbook…', ai: 'Reading the tabs…' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Or upload the workbook (an .xlsx or .csv): the rows are chosen the same way and brought in once.
const upFile = ref<File | null>(null)
function pickFile(e: Event) { upFile.value = (e.target as HTMLInputElement).files?.[0] ?? null; if (upFile.value) { fail.value = null; void read() } }
async function aiRead() {
  if (!upFile.value && !f.url.trim()) { msg.value = 'Paste the share link, or upload the file.'; return }
  busy.value = true; msg.value = ''; fail.value = null; prog.value = upFile.value ? 'Uploading…' : STAGE.fetch!
  try {
    let body: FormData | Record<string, string>
    if (upFile.value) { const fd = new FormData(); fd.append('file', upFile.value); fd.append('subject', props.subject); fd.append('currency', f.currency); body = fd }
    else body = { url: f.url, subject: props.subject, currency: f.currency }
    const { id } = await $fetch<{ id: string }>('/api/sheet-links/ai-read', { method: 'POST', body })
    const started = Date.now()
    for (;;) {
      await sleep(2000)
      const r = await $fetch<{ status: string; stage: string; progress: { done?: number; total?: number; last?: string }; result?: AiRes; error?: { message: string; advice: string[] } }>('/api/sheet-links/ai-read/' + id).catch(() => null)
      if (!r) { if (Date.now() - started > 15 * 60_000) throw new Error('lost'); continue }
      if (r.status === 'done' && r.result) {
        ai.value = r.result
        for (const b of ai.value.map.blocks) b.use = true
        if (!f.name) f.name = ai.value.map.company.name ? ai.value.map.company.name + ' model' : ai.value.provider + ' workbook'
        step.value = 3; break
      }
      if (r.status === 'failed') { fail.value = r.error ?? { message: 'The read failed.', advice: ['Try again.'] }; break }
      prog.value = r.stage === 'ai' && r.progress.total ? 'Reading tab ' + Math.min((r.progress.done ?? 0) + 1, r.progress.total) + ' of ' + r.progress.total + '…' : STAGE[r.stage] ?? 'Working…'
    }
  } catch (e) {
    const status = (e as { status?: number; statusCode?: number }).status ?? (e as { statusCode?: number }).statusCode
    fail.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message
      ? { message: err(e, ''), advice: [] }
      : { message: status === 504 || status === 502 ? 'The server took too long to answer.' : 'We lost contact with the server while reading.', advice: ['Try again in a minute.', 'Or download the workbook as Excel and upload it under Financials → Add figures.'] }
  } finally { busy.value = false; prog.value = '' }
}
function next() { fail.value = null; read() }
async function saveAi() {
  if (!ai.value) return
  busy.value = true; msg.value = ''
  if (ai.value.document_id) {
    try {
      const r = await $fetch<{ months: number; skipped: string[] }>('/api/sheet-links/ai-import', { method: 'POST', body: { document_id: ai.value.document_id, subject: props.subject, currency: f.currency, map: ai.value.map } })
      open.value = false; noteErr.value = false; upFile.value = null
      note.value = 'Brought in ' + r.months + ' period' + (r.months === 1 ? '' : 's') + ' from ' + (ai.value.file ?? 'the file') + (r.skipped.length ? '; skipped ' + r.skipped.join(', ') : '') + '. An uploaded file does not stay in step; upload it again or link the sheet to keep it current.'
      emit('synced')
    } catch (e) { msg.value = err(e, 'Could not bring the figures in.') } finally { busy.value = false }
    return
  }
  try {
    const r = await $fetch<{ months?: number; skipped?: string[]; error?: string }>('/api/sheet-links', { method: 'POST', body: { id: f.id || undefined, name: f.name, url: f.url, target: 'financials', subject: props.subject, currency: f.currency, auto: f.auto, mode: 'ai', ai_map: ai.value.map } })
    open.value = false; noteErr.value = !!r.error
    note.value = r.error ? 'Linked, but the first read failed: ' + r.error : 'Linked. ' + (r.months ?? 0) + ' period' + (r.months === 1 ? '' : 's') + ' brought in' + (r.skipped?.length ? '; skipped ' + r.skipped.join(', ') : '') + '.'
    await load(); emit('synced')
  } catch (e) { msg.value = err(e, 'Could not save the link.') } finally { busy.value = false }
}
const LINE_LABEL: Record<string, string> = { revenue: 'Revenue', cogs: 'Cost of revenue', gross_profit: 'Gross profit', opex_payroll: 'Payroll', opex_marketing: 'Sales & marketing', opex_rnd: 'R&D', opex_ga: 'G&A', opex_other: 'Other operating costs', opex_total: 'Total operating costs', ebitda: 'EBITDA', depreciation: 'D&A', interest: 'Interest expense', other_income: 'Other income', tax: 'Tax', net_income: 'Net income', cash: 'Cash', receivables: 'Receivables', investments: 'Short-term investments', long_term_investments: 'Long-term investments', other_assets: 'Other assets', total_assets: 'Total assets', payables: 'Payables', debt: 'Debt', other_liabilities: 'Other liabilities', total_liabilities: 'Total liabilities', equity: 'Equity', operating_cf: 'Operating cash flow', investing_cf: 'Investing cash flow', financing_cf: 'Financing cash flow' }
const asWhat = (r: AiBlock['rows'][number]) => { if (r.to === 'kpi') return 'Metric: ' + (r.kpi || r.label); if (r.to.startsWith('cat:')) { const [, p = '', ...n] = r.to.split(':'); return 'Your category: ' + n.join(':') + (p ? ' (in ' + (LINE_LABEL[p] ?? p) + ')' : '') } return LINE_LABEL[r.to] ?? r.to }
const PT: Record<string, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' }
const span = (b: AiBlock) => { const a = b.periods.filter((p) => !p.projected).map((p) => p.period_end).sort(); const pr = b.periods.filter((p) => p.projected).length; return (a.length ? a.length + ' ' + (b.periods[0]?.period_type ?? 'period') + (a.length === 1 ? '' : 's') + ' to ' + perLabel(b.periods[0]?.period_type ?? 'month', a[a.length - 1]!) : 'no actuals') + (pr ? ' · ' + pr + ' projected' : '') }
const perLabel = (t: string, d: string) => { const x = new Date(d + 'T00:00:00Z'); return t === 'year' ? 'FY' + x.getUTCFullYear() : t === 'quarter' ? 'Q' + (Math.floor(x.getUTCMonth() / 3) + 1) + ' ' + x.getUTCFullYear() : x.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }
const factGroups = computed(() => { const g: Record<string, AiM['facts']> = {}; for (const x of ai.value?.map.facts ?? []) (g[x.goes_to || 'Other'] ??= []).push(x); return g })
const kept = computed(() => ai.value?.map.blocks.filter((b) => b.use !== false).length ?? 0)
const money0 = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('en-US'))
watch(() => f.sheet, () => { if (step.value === 2) { keep.value = null; applyMap() } })
// Categories suggested for rows (from the sheet's sections) that are not in the chart of accounts yet.
const fresh = computed(() => [...new Set(Object.values(map.value).filter((v) => v.startsWith('cat:')))].filter((v) => !accts.value.some((a) => 'cat:' + a.parent + ':' + a.name === v)).map((to) => { const [, parent = '', ...n] = to.split(':'); return { to, parent, name: n.join(':') } }))
const used = computed(() => Object.values(map.value).filter((v) => v && v !== 'kpi'))
const dup = (k: string) => props.target === 'forecast' && k && k !== 'kpi' && used.value.filter((v) => v === k).length > 1
const summed = computed(() => props.target === 'financials' && used.value.some((v, i, a) => !v.startsWith('cat:') && a.indexOf(v) !== i))
const chosen = computed(() => Object.values(map.value).filter(Boolean).length)
async function save() {
  if (props.target === 'forecast' && !f.forecast_id) { msg.value = 'Save a forecast first, then link the sheet to it.'; return }
  busy.value = true; msg.value = ''
  const mapping = Object.entries(map.value).filter(([, to]) => to).map(([label, to]) => ({ label, to }))
  if (prev.value?.document_id) {
    try {
      const r = await $fetch<{ months: number; skipped: string[] }>('/api/sheet-links/rows-import', { method: 'POST', body: { document_id: prev.value.document_id, subject: props.subject, currency: f.currency, sheet: tab.value?.sheet ?? '', mapping } })
      open.value = false; noteErr.value = false; upFile.value = null
      note.value = 'Brought in ' + r.months + ' month' + (r.months === 1 ? '' : 's') + ' from ' + (prev.value?.file ?? 'the file') + (r.skipped.length ? '; skipped ' + r.skipped.join(', ') : '') + '. An uploaded file does not stay in step; upload it again or link the sheet to keep it current.'
      emit('synced')
    } catch (e) { msg.value = err(e, 'Could not bring the figures in.') } finally { busy.value = false }
    return
  }
  try {
    const r = await $fetch<{ months?: number; skipped?: string[]; error?: string }>('/api/sheet-links', { method: 'POST', body: { id: f.id || undefined, name: f.name, url: f.url, target: props.target, subject: props.target === 'financials' ? props.subject : undefined, forecast_id: props.target === 'forecast' ? f.forecast_id : undefined, currency: f.currency, sheet: tab.value?.sheet ?? '', auto: f.auto, mapping: Object.entries(map.value).map(([label, to]) => ({ label, to })) } })
    open.value = false; noteErr.value = !!r.error
    note.value = r.error ? 'Linked, but the first read failed: ' + r.error : 'Linked. ' + (r.months ?? 0) + ' month' + (r.months === 1 ? '' : 's') + ' brought in' + (r.skipped?.length ? '; skipped ' + r.skipped.join(', ') : '') + '.'
    await load(); emit('synced')
  } catch (e) { msg.value = err(e, 'Could not save the link.') } finally { busy.value = false }
}
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
</script>
<template>
  <!-- With sheets linked, the section can be rolled up to one line (remembered on this browser). -->
  <div v-if="rolled && shown.length && !note" class="sl rl"><button type="button" class="rlb" :aria-expanded="false" @click="rolled = false"><b>Linked sheets</b><span class="sub">{{ shown.map((l) => l.name).join(', ') }} · synced {{ ago(shown.reduce((m, l) => (l.last_synced_at && (!m || l.last_synced_at > m) ? l.last_synced_at : m), '' as string) || null) }}</span><span v-if="shown.some((l) => l.last_error)" class="rle">Needs attention</span><span class="rls">Show<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg></span></button></div>
  <div v-else class="sl">
    <div class="slh"><div><b>Linked sheets</b><span class="sub">{{ target === 'forecast' ? 'Months from your sheet become figures in a forecast' : 'Rows from your sheet fill these statements' }}, kept in step automatically.</span></div>
      <div class="slr"><button v-if="shown.length" type="button" class="link rlh" :aria-expanded="true" @click="rolled = true">Hide<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6" /></svg></button><button v-if="canEdit && (target === 'forecast' || (subject && subject !== 'group'))" class="btn secondary sm" type="button" @click="start()">Link a sheet</button></div></div>
    <p v-if="note" :class="noteErr ? 'error' : 'okm'">{{ note }}</p>
    <ul v-if="shown.length" class="sll">
      <li v-for="l in shown" :key="l.id">
        <div class="slm"><b>{{ l.name }}</b><span>{{ l.target === 'forecast' ? 'Forecast: ' + (l.forecast ?? '—') : l.mode === 'ai' ? 'Read with AI · ' + l.currency : (l.sheet ? 'Tab ' + l.sheet + ' · ' : '') + l.currency }} · {{ l.mode === 'ai' ? (l.ai_map?.blocks.length ?? 0) + ' table' + (l.ai_map?.blocks.length === 1 ? '' : 's') : l.mapping.length + ' row' + (l.mapping.length === 1 ? '' : 's') }} · synced {{ ago(l.last_synced_at) }}{{ l.last_result?.months !== undefined && !l.last_error ? ' (' + l.last_result.months + (l.mode === 'ai' ? ' periods' : ' months') + ')' : '' }}{{ l.auto ? '' : ' · manual only' }}</span>
          <span v-if="l.last_error" class="slx">{{ l.last_error }}</span><span v-if="l.mode === 'ai' && l.ai_map?.suggestions?.length" class="sgl">Worth adding to the sheet: {{ l.ai_map.suggestions.slice(0, 4).map((x) => x.metric).join(', ') }}</span></div>
        <label v-if="canEdit && l.target === 'financials'" class="shs" title="Investors see this sheet's link as the source of the figures (data room, investor page, updates)"><input type="checkbox" :checked="!!l.show_source" @change="showSource(l, ($event.target as HTMLInputElement).checked)"> Show investors this as the source</label><div v-if="canEdit" class="sla"><button class="link" type="button" :disabled="busyId === l.id" @click="syncNow(l)">{{ busyId === l.id ? 'Syncing…' : 'Sync now' }}</button><button class="link" type="button" @click="start(l)">{{ l.mode === 'ai' ? 'Read again with AI' : 'Edit' }}</button><button class="link" type="button" @click="unlink(l)">Unlink</button></div>
      </li>
    </ul>
    <p v-else-if="target === 'financials' && (!subject || subject === 'group')" class="sub">Choose a company or entity to link a sheet.</p>
    <AppModal :open="open" :title="f.id ? 'Edit linked sheet' : 'Link a sheet'" wide @close="open = false">
      <div v-if="step === 1" class="slf">
        <div v-if="target === 'financials' && !f.id" class="tpl"><div><b>Easiest: start from the Finvry template</b><span class="sub">Months across, our line names down the side, totals worked out for you. Finvry reads it exactly, with no AI, so nothing can land in the wrong line. Fill it in, open it in Google Sheets, and link it here (or drop the file below).</span></div><a class="btn secondary sm" href="/api/financials/template">Download template</a></div>
        <div v-if="target === 'forecast' && !f.id" class="tpl"><div><b>Easiest: start from the Finvry forecast template</b><span class="sub">Months across, the forecast's lines down the side, totals and closing cash worked out for you. Each row is matched by its name, with no AI. Fill it in, open it in Google Sheets, and link it here.</span></div><a class="btn secondary sm" href="/api/forecast/template">Download template</a></div>
        <label class="fl">Share link<input v-model="f.url" type="url" maxlength="600" placeholder="https://docs.google.com/spreadsheets/d/… or an Excel online / Dropbox link"></label>
        <DropZone v-if="target === 'financials' && !f.id" accept=".xlsx,.csv" no-tip :disabled="busy" :label="upFile ? upFile.name : 'Or drop the workbook here'" :hint="upFile ? 'Drop another file to replace it' : '.xlsx or .csv · you choose the rows the same way, brought in once · or click to choose'" @change="pickFile" />
        <p class="sub">One tab with the months across one heading row (Jan 2026, Feb 2026…) and line names down a column. You choose where each row goes; figures are read straight from your cells, with no AI.</p>
        <p class="sub">Share the file so anyone with the link can view it.</p>
        <p v-if="prog" class="prg">{{ prog }} <span class="sub">Big workbooks take a minute or two; you can keep this open.</span></p>
        <div v-if="fail" class="fl2"><b>{{ fail.message }}</b><ul v-if="fail.advice.length"><li v-for="a in fail.advice" :key="a">{{ a }}</li></ul>
          <span class="fla"><button class="link" type="button" :disabled="busy" @click="next">Try again</button></span></div>
      </div>
      <div v-else-if="step === 3 && ai" class="slf">
        <div class="g3"><label v-if="!ai.document_id" class="fl">Name<input v-model="f.name" maxlength="120"></label><label class="fl">Currency<input :value="f.currency" disabled></label></div>
        <p class="sub">{{ ai.provider }} · read {{ ai.tabs.length }} tab{{ ai.tabs.length === 1 ? '' : 's' }}{{ ai.map.company.name ? ' · ' + ai.map.company.name : '' }}{{ ai.map.fiscal_year_end ? ' · year ends ' + ai.map.fiscal_year_end : '' }} · into {{ subjectLabel || 'this company' }}</p>
        <p class="sum">Brings in actuals for {{ [ai.preview.months ? ai.preview.months + ' month' + (ai.preview.months === 1 ? '' : 's') : '', ai.preview.quarters ? ai.preview.quarters + ' quarter' + (ai.preview.quarters === 1 ? '' : 's') : '', ai.preview.years ? ai.preview.years + ' year' + (ai.preview.years === 1 ? '' : 's') : ''].filter(Boolean).join(', ') || 'no periods' }}{{ ai.preview.projected ? '. ' + ai.preview.projected + ' projected or unfinished period' + (ai.preview.projected === 1 ? ' is' : 's are') + ' left out of actuals' : '' }}.</p>
        <h4>Tables found</h4>
        <div class="tw"><table class="mt" data-nosearch><thead><tr><th /><th>Table</th><th>Tab</th><th>Periods</th><th class="n">Rows</th></tr></thead>
          <tbody><template v-for="(b, i) in ai.map.blocks" :key="i"><tr :class="{ off: b.use === false }"><td><input v-model="b.use" type="checkbox" :aria-label="'Use ' + b.title"></td><td><button class="lnk" type="button" @click="openB = openB === i ? null : i">{{ b.title }}</button></td><td>{{ b.sheet }}</td><td>{{ span(b) }}</td><td class="n">{{ b.rows.length }}</td></tr>
            <tr v-if="openB === i" class="sub2"><td /><td colspan="4"><span v-for="r in b.rows" :key="r.row + r.label" class="rm">{{ r.label }} <em>→ {{ asWhat(r) }}</em></span></td></tr></template></tbody></table></div>
        <template v-if="ai.preview.periods.length"><h4>Latest periods</h4>
          <div class="tw sm"><table class="mt" data-nosearch><thead><tr><th>Period</th><th class="n">Revenue</th><th class="n">Net income</th><th class="n">Cash</th><th class="n">Lines · metrics</th></tr></thead>
            <tbody><tr v-for="p in ai.preview.periods.slice().reverse().slice(0, 14)" :key="p.period_type + p.period_end"><td>{{ perLabel(p.period_type, p.period_end) }} <span class="sub">{{ PT[p.period_type] }}</span></td><td class="n">{{ money0(p.revenue) }}</td><td class="n">{{ money0(p.net_income) }}</td><td class="n">{{ money0(p.cash) }}</td><td class="n">{{ p.lines }} · {{ p.kpis }}</td></tr></tbody></table></div></template>
        <template v-if="ai.map.facts.length"><h4>Also in the workbook</h4>
          <div class="fg"><div v-for="(xs, g) in factGroups" :key="g"><b>{{ g }}</b><span v-for="x in xs" :key="x.sheet + x.label" class="fx">{{ x.label }}: {{ x.value }}</span></div></div></template>
        <template v-if="ai.map.suggestions.length"><h4>Worth adding to the sheet</h4><ul class="sg"><li v-for="x in ai.map.suggestions" :key="x.metric"><b>{{ x.metric }}</b> {{ x.why }}</li></ul></template>
        <div v-if="!f.id && recent.length" class="cfm"><h4>Check these against your sheet</h4>
          <div class="tw sm"><table class="mt" data-nosearch><thead><tr><th>Month</th><th class="n">Revenue</th><th class="n">Net income</th><th class="n">Cash</th><th class="n">Total assets</th><th class="n">Liabilities + equity</th></tr></thead>
            <tbody><tr v-for="p in recent" :key="p.period_end"><td>{{ perLabel('month', p.period_end) }}</td><td class="n">{{ money0(p.revenue) }}</td><td class="n">{{ money0(p.net_income) }}</td><td class="n">{{ money0(p.cash) }}</td><td class="n">{{ money0(p.total_assets ?? null) }}</td><td class="n">{{ p.total_liabilities == null && p.equity == null ? '—' : money0((p.total_liabilities ?? 0) + (p.equity ?? 0)) }}</td></tr></tbody></table></div>
          <label class="ck cf"><input v-model="confirmed" type="checkbox"> These match my sheet</label>
          <span class="sub">If one is wrong, open the table above to see which row went where, read it again, or use "Choose rows myself". A row in the wrong line can still add up, so this check matters.</span></div>
        <div v-if="(ai.preview as any).checks?.length" class="chk2"><b>{{ (ai.preview as any).checks.length }} figure{{ (ai.preview as any).checks.length === 1 ? '' : 's' }} in the sheet do not add up</b><span class="sub">They come in as they are; fix them in the sheet and sync again.</span>
          <ul><li v-for="(c, i) in (ai.preview as any).checks.slice(-8).reverse()" :key="i" :class="c.severity"><b>{{ perLabel(c.period_type, c.period_end) }} · {{ c.what }}</b> {{ c.detail }}</li></ul></div>
        <p v-if="ai.map.notes" class="sub">{{ ai.map.notes }}</p>
        <p v-if="ai.preview.missing.length" class="sub">Not found in the cells: {{ ai.preview.missing.slice(0, 6).join('; ') }}{{ ai.preview.missing.length > 6 ? '…' : '' }}</p>
        <details class="sub"><summary>What each tab holds</summary><ul class="sg"><li v-for="t in ai.map.tabs" :key="t.sheet"><b>{{ t.sheet }}</b> {{ t.what }}{{ t.used ? '' : ' (not used)' }}</li></ul></details>
        <label v-if="!ai?.document_id" class="ck"><input v-model="f.auto" type="checkbox"> Keep in step automatically (daily, and when this page opens)</label>
        <p v-else class="sub">An uploaded file is brought in once. To keep figures in step, link the sheet instead.</p>
      </div>
      <div v-else-if="prev && tab" class="slf">
        <div class="g3">
          <label v-if="!prev.document_id" class="fl">Name<input v-model="f.name" maxlength="120"></label>
          <label v-if="prev.sheets.length > 1" class="fl">Tab<select v-model="f.sheet"><option v-for="s in prev.sheets" :key="s.sheet" :value="s.sheet">{{ s.sheet }}</option></select></label>
          <label v-if="target === 'forecast'" class="fl">Forecast<select v-model="f.forecast_id"><option v-for="x in forecasts" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
          <label v-else class="fl">Currency<input v-model="f.currency" maxlength="3" pattern="[A-Z]{3}"></label>
        </div>
        <p class="sub">{{ prev.provider }} · {{ tab.months.length }} months, {{ mon(tab.months[0]!) }} to {{ mon(tab.months[tab.months.length - 1]!) }}{{ target === 'financials' ? ' (months after this one are left out)' : '' }} · into {{ target === 'forecast' ? 'the forecast as given months' : subjectLabel || 'this company' }}</p>
        <div class="tw"><table class="mt" data-nosearch><thead><tr><th>Row in your sheet</th><th class="n">Latest</th><th>Use as</th></tr></thead>
          <tbody><tr v-for="r in tab.rows" :key="r.label" :class="{ off: !map[r.label] }"><td>{{ r.label }}</td><td class="n">{{ fmt(r.last_value) }} <span class="sub">{{ mon(r.last_month) }}</span></td>
            <td><select v-model="map[r.label]" :class="{ bad: dup(map[r.label] ?? '') }" :aria-label="'Use ' + r.label + ' as'" @change="pick(r.label, ($event.target as HTMLSelectElement).value)"><option value="">Don't use</option><optgroup label="Standard lines"><option v-for="k in prev.keys" :key="k.key" :value="k.key">{{ k.label }}</option></optgroup>
              <optgroup v-if="target === 'financials' && accts.length" label="Your categories"><option v-for="a in accts" :key="a.id" :value="'cat:' + a.parent + ':' + a.name">{{ catLabel(a) }}</option></optgroup>
              <optgroup v-if="target === 'financials' && fresh.length" label="New categories (added when you save)"><option v-for="c in fresh" :key="c.to" :value="c.to">{{ catLabel(c) }}</option></optgroup>
              <option v-if="target === 'financials'" value="__new">+ New category…</option></select>
              <div v-if="nc.row === r.label" class="nc"><input v-model="nc.name" maxlength="80" placeholder="Category name"><select v-model="nc.parent" aria-label="Belongs to"><option value="">No line (keep as a detail)</option><option v-for="k in prev.keys.filter((x) => x.key !== 'kpi')" :key="k.key" :value="k.key">In {{ k.label }}</option></select><button type="button" class="btn sm" :disabled="nc.busy || !nc.name.trim()" @click="addCat">Add</button><button type="button" class="lnk" @click="nc.row = ''">Cancel</button><span v-if="nc.msg" class="error">{{ nc.msg }}</span></div></td></tr></tbody></table></div>
        <p v-if="target === 'financials'" class="sub">Rows that are not a standard line can go into your own categories (your chart of accounts). A category is added into its line when the sheet does not give that line; rows sent to the same line are added together.{{ summed ? ' Some rows here go to the same line and will be added together.' : '' }}</p>
        <label v-if="!prev.document_id" class="ck"><input v-model="f.auto" type="checkbox"> Keep in step automatically (daily, and when this page opens)</label>
        <p v-else class="sub">An uploaded file is brought in once. To keep figures in step, link the sheet instead.</p>
      </div>
      <ClientOnly><CashFlowAsk v-if="target === 'financials' && (step === 2 || step === 3) && subject" :subject="subject" inline /></ClientOnly>
      <p v-if="msg" class="error">{{ msg }}</p>
      <template #foot>
        <button class="btn secondary" type="button" @click="step > 1 && !f.id ? (step = 1) : (open = false)">{{ step > 1 && !f.id ? 'Back' : 'Cancel' }}</button>
        <button v-if="step === 1" class="btn" type="button" :disabled="busy" @click="next">{{ busy ? 'Reading…' : 'Read sheet' }}</button>
        <button v-else-if="step === 3" class="btn" type="button" :disabled="busy || !kept || (!f.id && recent.length > 0 && !confirmed)" @click="saveAi">{{ busy ? (ai?.document_id ? 'Bringing in…' : 'Linking…') : (ai?.document_id ? 'Bring in ' : 'Link ') + kept + ' table' + (kept === 1 ? '' : 's') }}</button>
        <button v-else class="btn" type="button" :disabled="busy || !chosen || (target === 'forecast' && used.length !== new Set(used).size)" @click="save">{{ busy ? (prev?.document_id ? 'Bringing in…' : 'Linking…') : (prev?.document_id ? 'Bring in ' : 'Link ') + chosen + ' row' + (chosen === 1 ? '' : 's') }}</button>
      </template>
    </AppModal>
  </div>
</template>
<style scoped>
.sl { border: 1px solid var(--c-rule-strong); background: #fff; padding: 12px 14px; margin: 12px 0 }
.slh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap }
.slh b { display: block; font-size: 14px }
.sub { color: var(--c-muted); font-size: 12.5px }
.sll { list-style: none; margin: 10px 0 0; padding: 0 }
.sll li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--c-rule-strong); flex-wrap: wrap }
.slm { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
.slm span { color: var(--c-muted); font-size: 12.5px }
.slm .slx { color: var(--c-danger) }
.sla { display: flex; gap: 14px; align-items: center }
.sla button { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer }
.sla button:disabled { color: var(--c-muted); cursor: default }
.slf { display: flex; flex-direction: column; gap: 10px }
.fl { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted) }
.fl input, .fl select, .mt select { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 14px; color: var(--c-ink); border-radius: 0 }
.mt { width: 100%; border-collapse: collapse; font-size: 13.5px }
.mt th { position: sticky; top: 0; background: #fafafa; text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12px; padding: 8px 12px; border-bottom: 1px solid var(--c-rule-strong) }
.mt td { padding: 6px 12px; border-top: 1px solid var(--c-rule) }
.mt td:last-child { width: 42% }
.g3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px }
.tw { max-height: 46vh; overflow: auto; border: 1px solid var(--c-rule-strong) }
tr.off td:first-child { color: var(--c-muted) }
select.bad { border-color: var(--c-danger) }
.ck { display: flex; gap: 8px; align-items: center; font-size: 13px }
.okm { color: var(--c-ink); font-size: 13px; margin: 8px 0 0 }
td.n, th.n { text-align: right; white-space: nowrap }
.prg { margin: 0; font-size: 13.5px; color: var(--c-ink) } .fl2 { border: 1px solid var(--c-rule-strong); border-left: 3px solid var(--c-danger); padding: 10px 12px; font-size: 13.5px; display: flex; flex-direction: column; gap: 6px } .fl2 b { font-weight: 500 } .fl2 ul { margin: 0; padding-left: 18px; color: var(--c-ink-soft) } .fla { display: flex; gap: 16px } .fla button { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer }
.mo { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--c-rule); padding: 10px 12px } .mo .ck { align-items: flex-start; font-size: 13.5px } .mo .ck input { margin-top: 3px } .mo .ck b { font-weight: 500 } .cur { max-width: 180px }
.sum { margin: 0; font-size: 14px } h4 { margin: 6px 0 0; font-size: 13px; font-weight: 600 } .tw.sm { max-height: 30vh }
.lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-align: left } tr.sub2 td { background: #fafafa } .rm { display: inline-block; margin: 2px 14px 2px 0; font-size: 12.5px } .rm em { font-style: normal; color: var(--c-muted) }
.fg { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 18px; font-size: 13px } .fg b { display: block; font-weight: 500; margin-bottom: 2px } .fg .fx { display: block; color: var(--c-ink-soft); overflow-wrap: anywhere }
.sg { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft) } .sg b { font-weight: 500; color: var(--c-ink) } .sgl { color: var(--c-muted) }
.chk2 { border: 1px solid #efd9b0; background: #fdf8ee; padding: 10px 12px; font-size: 13px; } .chk2 ul { margin: 8px 0 0; padding-left: 18px; } .chk2 li { margin: 3px 0; color: var(--c-ink-soft); } .chk2 li.error b { color: var(--c-danger); }
.shs { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-ink-soft); white-space: nowrap; }
.nc { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; margin-top: 6px; align-items: center; } .nc input, .nc select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); min-width: 0; } .nc .lnk { background: none; border: 0; color: var(--c-muted); cursor: pointer; font: inherit; font-size: 12.5px; } .nc .error { grid-column: 1 / -1; }
.tpl { display: flex; gap: 14px; align-items: center; justify-content: space-between; border: 1px solid #d9e2ef; background: #f5f7fb; padding: 12px 14px; } .tpl b { display: block; font-weight: 500; margin-bottom: 2px; } .tpl .btn { white-space: nowrap; text-decoration: none; }
.cfm { border: 1px solid var(--c-rule-strong); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; } .cfm h4 { margin: 0; } .cf { font-weight: 500; }
.slr { display: flex; align-items: center; gap: 14px; } .rlh, .rls { display: inline-flex; align-items: center; gap: 4px; } .rlh svg, .rls svg { width: 14px; height: 14px; }
.sl.rl { padding: 0; } .rlb { width: 100%; display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; background: none; border: 0; font: inherit; text-align: left; cursor: pointer; color: inherit; }
.rlb b { font-size: 14px; white-space: nowrap; } .rlb .sub { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .rle { font-size: 12px; color: var(--c-danger); white-space: nowrap; }
.rls { margin-left: auto; font-size: 13px; color: var(--c-blue-deep); white-space: nowrap; align-self: center; }
</style>
