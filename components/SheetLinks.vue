<script setup lang="ts">
// Live-linked spreadsheets: link a shared Google Sheet, Excel online or Dropbox file, choose which rows feed
// Financials (statement lines and custom metrics) or a forecast, and it stays in step: read on open, daily, or on
// "Sync now".
interface Link { id: string; name: string; url: string; target: 'financials' | 'forecast'; subject: string | null; forecast_id: string | null; forecast: string | null; currency: string; sheet: string | null; mapping: { label: string; to: string }[]; auto: boolean; mode?: 'rows' | 'ai'; ai_map?: AiM | null; last_synced_at: string | null; last_error: string | null; last_result: { months?: number; skipped?: string[]; sheet?: string } | null }
interface AiBlock { sheet: string; title: string; label_col: string; scale: number; periods: { col: string; period_type: string; period_end: string; projected: boolean }[]; rows: { row: number; label: string; to: string; kpi: string; pct: boolean }[]; use?: boolean }
interface AiM { company: { name: string; description: string; website: string }; reporting_currency: string; fiscal_year_end: string; tabs: { sheet: string; what: string; used: boolean }[]; blocks: AiBlock[]; facts: { sheet: string; label: string; value: string; goes_to: string }[]; suggestions: { metric: string; why: string }[]; notes: string }
interface AiRes { document_id?: string | null; file?: string | null; provider: string; tabs: string[]; map: AiM; preview: { months: number; quarters: number; years: number; projected: number; missing: string[]; found: number; periods: { period_type: string; period_end: string; lines: number; kpis: number; revenue: number | null; net_income: number | null; cash: number | null }[] } }
interface Prev { provider: string; keys: { key: string; label: string }[]; sheets: { sheet: string; months: string[]; rows: { label: string; last_month: string; last_value: number; months: number }[]; suggestion: { label: string; to: string }[] }[] }
const props = withDefaults(defineProps<{ target: 'financials' | 'forecast'; subject?: string; subjectLabel?: string; currency?: string; forecasts?: { id: string; name: string }[]; forecastId?: string; canEdit?: boolean }>(), { subject: '', subjectLabel: '', currency: 'USD', forecasts: () => [], forecastId: '', canEdit: false })
const emit = defineEmits<{ synced: [] }>()
const links = ref<Link[]>([])
const shown = computed(() => links.value.filter((l) => props.target === 'forecast' || !props.subject || l.subject === props.subject))
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? d
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
const prev = ref<Prev | null>(null), map = ref<Record<string, string>>({}), keep = ref<{ label: string; to: string }[] | null>(null)
const tab = computed(() => prev.value?.sheets.find((s) => s.sheet === f.sheet) ?? prev.value?.sheets[0] ?? null)
function start(l?: Link) {
  Object.assign(f, { id: l?.id ?? '', name: l?.name ?? '', url: l?.url ?? '', sheet: l?.sheet ?? '', forecast_id: l?.forecast_id ?? props.forecastId ?? props.forecasts[0]?.id ?? '', currency: l?.currency ?? props.currency, auto: l?.auto ?? true, mode: l ? (l.mode ?? 'rows') : props.target === 'financials' ? 'ai' : 'rows' })
  keep.value = l?.mapping ?? null; prev.value = null; ai.value = null; fail.value = null; upFile.value = null; openB.value = null; map.value = {}; msg.value = ''; step.value = 1; open.value = true
  if (l) { if (f.mode === 'ai') aiRead(); else read() }
}
function applyMap() {
  const t = tab.value; if (!t) return
  const src = keep.value && (f.sheet === '' || t.sheet === f.sheet) ? keep.value : t.suggestion
  map.value = Object.fromEntries(t.rows.map((r) => [r.label, src.find((m) => m.label.toLowerCase() === r.label.toLowerCase())?.to ?? '']))
}
async function read() {
  if (!f.url.trim()) { msg.value = 'Paste the share link.'; return }
  busy.value = true; msg.value = ''
  try {
    prev.value = await $fetch<Prev>('/api/sheet-links/preview', { method: 'POST', body: { url: f.url, target: props.target } })
    if (!prev.value.sheets.some((s) => s.sheet === f.sheet)) f.sheet = prev.value.sheets[0]!.sheet
    if (!f.name) f.name = f.sheet ? prev.value.provider + ': ' + f.sheet : prev.value.provider
    applyMap(); step.value = 2
  } catch (e) { msg.value = err(e, 'Could not read that sheet.') } finally { busy.value = false }
}
// Read with AI: the whole workbook, any layout.
// The read runs on the server in the background; this follows it and shows where it is.
const prog = ref(''), fail = ref<{ message: string; advice: string[] } | null>(null)
const STAGE: Record<string, string> = { fetch: 'Fetching the workbook…', parse: 'Opening the workbook…', ai: 'Reading the tabs…' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Or upload the workbook (an .xlsx or .csv): read the same way, brought in once.
const upFile = ref<File | null>(null)
function pickFile(e: Event) { upFile.value = (e.target as HTMLInputElement).files?.[0] ?? null; if (upFile.value) { fail.value = null; void aiRead() } }
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
function next() { fail.value = null; if (f.mode === 'ai') aiRead(); else read() }
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
const LINE_LABEL: Record<string, string> = { revenue: 'Revenue', cogs: 'Cost of revenue', gross_profit: 'Gross profit', opex_payroll: 'Payroll', opex_marketing: 'Sales & marketing', opex_rnd: 'R&D', opex_ga: 'G&A', opex_other: 'Other operating costs', opex_total: 'Total operating costs', ebitda: 'EBITDA', depreciation: 'D&A', interest: 'Interest', tax: 'Tax', net_income: 'Net income', cash: 'Cash', receivables: 'Receivables', investments: 'Investments', other_assets: 'Other assets', total_assets: 'Total assets', payables: 'Payables', debt: 'Debt', other_liabilities: 'Other liabilities', total_liabilities: 'Total liabilities', equity: 'Equity', operating_cf: 'Operating cash flow', investing_cf: 'Investing cash flow', financing_cf: 'Financing cash flow' }
const asWhat = (r: AiBlock['rows'][number]) => (r.to === 'kpi' ? 'Metric: ' + (r.kpi || r.label) : LINE_LABEL[r.to] ?? r.to)
const PT: Record<string, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' }
const span = (b: AiBlock) => { const a = b.periods.filter((p) => !p.projected).map((p) => p.period_end).sort(); const pr = b.periods.filter((p) => p.projected).length; return (a.length ? a.length + ' ' + (b.periods[0]?.period_type ?? 'period') + (a.length === 1 ? '' : 's') + ' to ' + perLabel(b.periods[0]?.period_type ?? 'month', a[a.length - 1]!) : 'no actuals') + (pr ? ' · ' + pr + ' projected' : '') }
const perLabel = (t: string, d: string) => { const x = new Date(d + 'T00:00:00Z'); return t === 'year' ? 'FY' + x.getUTCFullYear() : t === 'quarter' ? 'Q' + (Math.floor(x.getUTCMonth() / 3) + 1) + ' ' + x.getUTCFullYear() : x.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }
const factGroups = computed(() => { const g: Record<string, AiM['facts']> = {}; for (const x of ai.value?.map.facts ?? []) (g[x.goes_to || 'Other'] ??= []).push(x); return g })
const kept = computed(() => ai.value?.map.blocks.filter((b) => b.use !== false).length ?? 0)
const money0 = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('en-US'))
watch(() => f.sheet, () => { if (step.value === 2) { keep.value = null; applyMap() } })
const used = computed(() => Object.values(map.value).filter((v) => v && v !== 'kpi'))
const dup = (k: string) => k && k !== 'kpi' && used.value.filter((v) => v === k).length > 1
const chosen = computed(() => Object.values(map.value).filter(Boolean).length)
async function save() {
  if (props.target === 'forecast' && !f.forecast_id) { msg.value = 'Save a forecast first, then link the sheet to it.'; return }
  busy.value = true; msg.value = ''
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
  <div class="sl">
    <div class="slh"><div><b>Linked sheets</b><span class="sub">{{ target === 'forecast' ? 'Months from your sheet become figures in a forecast' : 'Rows from your sheet fill these statements' }}, kept in step automatically.</span></div>
      <button v-if="canEdit && (target === 'forecast' || (subject && subject !== 'group'))" class="btn secondary sm" type="button" @click="start()">Link a sheet</button></div>
    <p v-if="note" :class="noteErr ? 'error' : 'okm'">{{ note }}</p>
    <ul v-if="shown.length" class="sll">
      <li v-for="l in shown" :key="l.id">
        <div class="slm"><b>{{ l.name }}</b><span>{{ l.target === 'forecast' ? 'Forecast: ' + (l.forecast ?? '—') : l.mode === 'ai' ? 'Read with AI · ' + l.currency : (l.sheet ? 'Tab ' + l.sheet + ' · ' : '') + l.currency }} · {{ l.mode === 'ai' ? (l.ai_map?.blocks.length ?? 0) + ' table' + (l.ai_map?.blocks.length === 1 ? '' : 's') : l.mapping.length + ' row' + (l.mapping.length === 1 ? '' : 's') }} · synced {{ ago(l.last_synced_at) }}{{ l.last_result?.months !== undefined && !l.last_error ? ' (' + l.last_result.months + (l.mode === 'ai' ? ' periods' : ' months') + ')' : '' }}{{ l.auto ? '' : ' · manual only' }}</span>
          <span v-if="l.last_error" class="slx">{{ l.last_error }}</span><span v-if="l.mode === 'ai' && l.ai_map?.suggestions?.length" class="sgl">Worth adding to the sheet: {{ l.ai_map.suggestions.slice(0, 4).map((x) => x.metric).join(', ') }}</span></div>
        <div v-if="canEdit" class="sla"><button class="link" type="button" :disabled="busyId === l.id" @click="syncNow(l)">{{ busyId === l.id ? 'Syncing…' : 'Sync now' }}</button><button class="link" type="button" @click="start(l)">{{ l.mode === 'ai' ? 'Read again with AI' : 'Edit' }}</button><button class="link" type="button" @click="unlink(l)">Unlink</button></div>
      </li>
    </ul>
    <p v-else-if="target === 'financials' && (!subject || subject === 'group')" class="sub">Choose a company or entity to link a sheet.</p>
    <AppModal :open="open" :title="f.id ? 'Edit linked sheet' : 'Link a sheet'" wide @close="open = false">
      <div v-if="step === 1" class="slf">
        <label class="fl">Share link<input v-model="f.url" type="url" maxlength="600" placeholder="https://docs.google.com/spreadsheets/d/… or an Excel online / Dropbox link"></label>
        <div v-if="target === 'financials'" class="mo"><label class="ck"><input v-model="f.mode" type="radio" value="ai"> <span><b>Read the whole workbook with AI</b><span class="sub"> For full financial models: many tabs, years or quarters, actuals beside projections, side-by-side tables, two currencies. AI finds where each figure is; the figures are then read straight from your cells on every sync.</span></span></label>
          <label class="ck"><input v-model="f.mode" type="radio" value="rows"> <span><b>Choose rows myself</b><span class="sub"> One tab with the months across one heading row (Jan 2026, Feb 2026…) and line names down a column.</span></span></label>
          <template v-if="f.mode === 'ai'"><label class="fl cur">Reporting currency<input v-model="f.currency" maxlength="3" pattern="[A-Z]{3}"></label>
            <DropZone accept=".xlsx,.csv" :disabled="busy" :label="upFile ? upFile.name : 'Or drop the workbook here'" :hint="upFile ? 'Drop another file to replace it' : '.xlsx or .csv, read the same way and brought in once · or click to choose'" @change="pickFile" /></template></div>
        <p class="sub">Share the file so anyone with the link can view it.</p>
        <p v-if="prog" class="prg">{{ prog }} <span class="sub">Big workbooks take a minute or two; you can keep this open.</span></p>
        <div v-if="fail" class="fl2"><b>{{ fail.message }}</b><ul v-if="fail.advice.length"><li v-for="a in fail.advice" :key="a">{{ a }}</li></ul>
          <span class="fla"><button class="link" type="button" :disabled="busy" @click="aiRead">Try again</button><button v-if="f.mode === 'ai'" class="link" type="button" @click="f.mode = 'rows'; fail = null">Choose rows myself instead</button></span></div>
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
        <p v-if="ai.map.notes" class="sub">{{ ai.map.notes }}</p>
        <p v-if="ai.preview.missing.length" class="sub">Not found in the cells: {{ ai.preview.missing.slice(0, 6).join('; ') }}{{ ai.preview.missing.length > 6 ? '…' : '' }}</p>
        <details class="sub"><summary>What each tab holds</summary><ul class="sg"><li v-for="t in ai.map.tabs" :key="t.sheet"><b>{{ t.sheet }}</b> {{ t.what }}{{ t.used ? '' : ' (not used)' }}</li></ul></details>
        <label v-if="!ai?.document_id" class="ck"><input v-model="f.auto" type="checkbox"> Keep in step automatically (daily, and when this page opens)</label>
        <p v-else class="sub">An uploaded file is brought in once. To keep figures in step, link the sheet instead.</p>
      </div>
      <div v-else-if="prev && tab" class="slf">
        <div class="g3">
          <label class="fl">Name<input v-model="f.name" maxlength="120"></label>
          <label v-if="prev.sheets.length > 1" class="fl">Tab<select v-model="f.sheet"><option v-for="s in prev.sheets" :key="s.sheet" :value="s.sheet">{{ s.sheet }}</option></select></label>
          <label v-if="target === 'forecast'" class="fl">Forecast<select v-model="f.forecast_id"><option v-for="x in forecasts" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
          <label v-else class="fl">Currency<input v-model="f.currency" maxlength="3" pattern="[A-Z]{3}"></label>
        </div>
        <p class="sub">{{ prev.provider }} · {{ tab.months.length }} months, {{ mon(tab.months[0]!) }} to {{ mon(tab.months[tab.months.length - 1]!) }}{{ target === 'financials' ? ' (months after this one are left out)' : '' }} · into {{ target === 'forecast' ? 'the forecast as given months' : subjectLabel || 'this company' }}</p>
        <div class="tw"><table class="mt" data-nosearch><thead><tr><th>Row in your sheet</th><th class="n">Latest</th><th>Use as</th></tr></thead>
          <tbody><tr v-for="r in tab.rows" :key="r.label" :class="{ off: !map[r.label] }"><td>{{ r.label }}</td><td class="n">{{ fmt(r.last_value) }} <span class="sub">{{ mon(r.last_month) }}</span></td>
            <td><select v-model="map[r.label]" :class="{ bad: dup(map[r.label] ?? '') }" :aria-label="'Use ' + r.label + ' as'"><option value="">Don't use</option><option v-for="k in prev.keys" :key="k.key" :value="k.key">{{ k.label }}</option></select></td></tr></tbody></table></div>
        <label class="ck"><input v-model="f.auto" type="checkbox"> Keep in step automatically (daily, and when this page opens)</label>
      </div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <template #foot>
        <button class="btn secondary" type="button" @click="step > 1 && !f.id ? (step = 1) : (open = false)">{{ step > 1 && !f.id ? 'Back' : 'Cancel' }}</button>
        <button v-if="step === 1" class="btn" type="button" :disabled="busy" @click="next">{{ busy ? (f.mode === 'ai' ? 'Reading…' : 'Reading…') : f.mode === 'ai' ? 'Read with AI' : 'Read sheet' }}</button>
        <button v-else-if="step === 3" class="btn" type="button" :disabled="busy || !kept" @click="saveAi">{{ busy ? (ai?.document_id ? 'Bringing in…' : 'Linking…') : (ai?.document_id ? 'Bring in ' : 'Link ') + kept + ' table' + (kept === 1 ? '' : 's') }}</button>
        <button v-else class="btn" type="button" :disabled="busy || !chosen || used.length !== new Set(used).size" @click="save">{{ busy ? 'Linking…' : 'Link ' + chosen + ' row' + (chosen === 1 ? '' : 's') }}</button>
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
</style>
