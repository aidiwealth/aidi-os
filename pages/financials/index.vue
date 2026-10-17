<script setup lang="ts">
import { rollUp, combine, type FinRow } from '~/shared/fin-view'
const { canPath } = useModuleAccess()
// Financials. Finvry companies: always their own company. Aidi OS: the group (consolidated) or any fund, entity or company.
useHead({ title: 'Financials' })
interface Line { key: string; label: string; section: string }
interface Subjects { company: { subject: string; name: string; currency: string; reporting: string | null; rate_as_of: string | null } | null; entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string; relationship: string }[]; currencies: string[]; lines: Line[]; derived: { key: string; label: string }[] }
interface St { id: string | null; period_end: string; period_type: string; currency: string; lines: Record<string, number>; kpis: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; derived: Record<string, number | null> }
const { data: subj } = await useFetch<Subjects>('/api/financials/subjects')
const { data: me } = await useFetch<{ roles: string[]; entity_scoped?: boolean }>('/api/auth/me', { key: 'me' })
// Someone limited to some companies sees those companies, not the group consolidation.
const scoped = computed(() => !!me.value?.entity_scoped)
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const co = computed(() => subj.value?.company ?? null)
const subjLabel = computed(() => { const m = subject.value.match(/^(entity|company):(.+)$/); if (!m) return ''; return (m[1] === 'entity' ? subj.value?.entities : subj.value?.companies)?.find((x) => x.id === m[2])?.name ?? '' })
const subject = ref(co.value?.subject ?? (me.value?.entity_scoped && subj.value?.entities[0] ? 'entity:' + subj.value.entities[0].id : 'group')); const periodType = ref('month'); const view = ref<'month' | 'quarter' | 'year' | 'custom'>('month'); watch(view, (v) => { periodType.value = v === 'custom' ? 'month' : v }); const currency = ref(co.value?.currency ?? 'USD')
watch(co, (c) => { if (c) { subject.value = c.subject; currency.value = c.currency } })
watchEffect(() => { if (!co.value && subject.value === 'group' && subj.value?.currencies.length && !subj.value.currencies.includes(currency.value)) currency.value = subj.value.currencies[0]! })
const original = ref(false)
const rawQ = computed(() => (original.value ? '1' : undefined))
const { data, refresh } = await useFetch<{ name: string; statements: St[]; cash_with_securities?: boolean; cash_policy?: boolean | null }>('/api/financials', { query: { subject, period_type: periodType, currency, raw: rawQ }, watch: [subject, periodType, currency, original] })
const converting = computed(() => !!co.value?.reporting && !original.value && rows.value.some((r) => r.currency === co.value?.reporting))
const rows = computed(() => data.value?.statements ?? [])
// Monthly figures, for quarters and years that were only entered month by month, and for a custom range.
const { data: mdata, refresh: refreshM } = await useFetch<{ statements: St[] }>('/api/financials', { query: { subject, period_type: 'month', currency, raw: rawQ }, watch: [subject, currency, original] })
const monthly = computed(() => mdata.value?.statements ?? [])
watch(data, () => { if (periodType.value !== 'month') void refreshM() })
const range = reactive({ from: '', to: '' })
watch(monthly, (m) => { if (m.length && !range.to) { range.to = m[m.length - 1]!.period_end.slice(0, 7); range.from = m[Math.max(0, m.length - 12)]!.period_end.slice(0, 7) } }, { immediate: true })
const inRange = computed(() => monthly.value.filter((r) => r.period_end.slice(0, 7) >= range.from && r.period_end.slice(0, 7) <= range.to))
const vrows = computed<St[]>(() => {
  if (view.value === 'custom') return inRange.value
  if (view.value === 'month' || rows.value.length) return rows.value
  return rollUp(monthly.value as unknown as FinRow[], view.value).map((r) => ({ ...r, id: null, notes: null, show_to_lps: false, source: 'rolled' })) as unknown as St[]
})
const rolled = computed(() => view.value !== 'month' && view.value !== 'custom' && !rows.value.length && vrows.value.length > 0)
const rangeTotal = computed(() => (view.value === 'custom' && inRange.value.length ? combine(inRange.value as unknown as FinRow[], inRange.value[inRange.value.length - 1]!.period_end, 'custom') : null))
const latest = computed(() => (rangeTotal.value as unknown as St | null) ?? vrows.value[vrows.value.length - 1]); const prev = computed(() => (view.value === 'custom' ? undefined : vrows.value[vrows.value.length - 2]))
// Cash: the latest period that has it (a P&L-only month should not blank the balance).
const cashKnown = computed(() => { const src = view.value === 'custom' ? inRange.value : vrows.value; for (let i = src.length - 1; i >= 0; i--) { const v = src[i]!.derived.cash; if (v != null) return { v, at: src[i]!.period_end } } return null })
// Treasury bills and other marketable securities (the investments line): asked once whether to count them as cash.
const hasSec = computed(() => monthly.value.some((r) => typeof r.lines.investments === 'number' && r.lines.investments !== 0))
const secOn = computed(() => !!data.value?.cash_with_securities)
async function setSec(v: boolean) { try { await $fetch('/api/financials/visibility', { method: 'POST', body: { cash_with_securities: v } }); await refresh(); await refreshM() } catch (e) { msg.value = errOf(e, 'Could not save.') } }
// Standard statements (PDF or Excel) with the logo and comments.
const sf = reactive({ open: false, period_type: 'month', count: 12, format: 'pdf', comments: '', note_income: '', note_balance: '', note_cash: '', room: false, busy: false, msg: '' })
function openStatements() { Object.assign(sf, { open: true, period_type: view.value === 'custom' ? 'month' : view.value, count: view.value === 'year' ? 3 : view.value === 'quarter' ? 4 : 12, msg: '', busy: false }) }
async function draftComments() {
  sf.msg = ''
  try { const a = await $fetch<{ headline: string; insights: { title: string; detail: string }[]; flags: { item: string; why: string }[] } | null>('/api/financials/analysis', { query: { subject: co.value?.subject ?? subject.value } }); if (a) sf.comments = [a.headline, ...a.insights.map((i) => i.title + '. ' + i.detail)].join('\n\n') }
  catch (e) { sf.msg = errOf(e, 'Could not draft comments.') }
}
async function makeStatements() {
  sf.busy = true; sf.msg = ''
  try {
    const fd = new FormData(); for (const k of ['period_type', 'count', 'format', 'comments', 'note_income', 'note_balance', 'note_cash'] as const) fd.append(k, String(sf[k])); fd.append('subject', co.value?.subject ?? subject.value); fd.append('room', sf.room ? '1' : '0')
    const res = await fetch('/api/financials/statements-file', { method: 'POST', body: fd, credentials: 'same-origin' })
    if (!res.ok) { const j = await res.json().catch(() => null) as { data?: { error?: { message?: string } } } | null; throw new Error(j?.data?.error?.message ?? 'Could not make the statements.') }
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]) ?? 'financial-statements.' + sf.format; a.click(); URL.revokeObjectURL(a.href)
    ok.value = 'Statements downloaded' + (sf.room ? ' and added to the data room (Financials).' : '.'); sf.open = false
  } catch (e) { sf.msg = (e as Error).message } finally { sf.busy = false }
}
const runwayKnown = computed(() => { const b = latest.value?.derived.burn; return cashKnown.value && b ? Math.round((cashKnown.value.v / b) * 10) / 10 : null })
const cur = computed(() => latest.value?.currency ?? currency.value)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const CURS = computed(() => [...new Set(['USD', 'NGN', ...(co.value ? [] : subj.value?.currencies ?? [])])])
const curName = (c: string) => ({ USD: 'US dollar (USD)', NGN: 'Naira (NGN)', GBP: 'Pound (GBP)', EUR: 'Euro (EUR)' } as Record<string, string>)[c] ?? c
const lbl = (d: string, t: string = view.value === 'custom' ? 'month' : view.value) => t === 'quarter' ? 'Q' + Math.ceil(Number(d.slice(5, 7)) / 3) + ' ' + d.slice(2, 4) : new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', t === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const rangeLbl = computed(() => (inRange.value.length ? lbl(inRange.value[0]!.period_end, 'month') + ' – ' + lbl(inRange.value[inRange.value.length - 1]!.period_end, 'month') : ''))
const pts = (k: string) => vrows.value.filter((r) => r.derived[k] != null).map((r) => ({ label: lbl(r.period_end), value: r.derived[k] as number }))
const change = (k: string) => { const a = latest.value?.derived[k], b = prev.value?.derived[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100) }
// Operating expenses only (no cost of revenue; R&D is left out as it may be capitalised).
const mix = computed(() => { const d = latest.value?.derived ?? {}; return [['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_ga', 'General & admin'], ['opex_other', 'Other operating']].map(([k, l]) => ({ label: l!, value: Number(d[k!] ?? 0) })) })
const pctFmt = (v: number | null | undefined) => (v == null ? '—' : v + '%')
const tab = ref<'overview' | 'statements' | 'shares'>('overview')
// Bulk delete / clear.
const picked = ref<string[]>([]); const clearOpen = ref(false)
watch([subject, periodType], () => { picked.value = [] })
const allPicked = computed(() => { const ids = rows.value.filter((r) => r.id).map((r) => r.id as string); return ids.length > 0 && ids.every((i) => picked.value.includes(i)) })
function pickAll(on: boolean) { picked.value = on ? rows.value.filter((r) => r.id).map((r) => r.id as string) : [] }
async function cleared(m: string) { clearOpen.value = false; picked.value = []; ok.value = m; await Promise.all([refresh(), refreshM()]) }
// Figures that do not add up, across every saved period.
const { data: checks } = await useLazyFetch<{ checks: { period_end: string; period_type: string; what: string; detail: string; severity: string; source: string | null }[] }>('/api/financials/checks', { query: { subject }, watch: [subject], server: false, default: () => ({ checks: [] }) })
const checksOpen = ref(false)
const title = computed(() => co.value?.name ?? data.value?.name ?? 'Financials')

// add / edit (popup)
const showForm = ref(false); const msg = ref(''); const ok = ref(''); const busy = ref(false); const aiNote = ref('')
const now = new Date(); const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
const blank = () => ({ subject: co.value?.subject ?? (subject.value === 'group' ? '' : subject.value), period_type: periodType.value, month: lastMonth.toISOString().slice(0, 7), q: Math.floor(lastMonth.getUTCMonth() / 3) + 1, year: lastMonth.getUTCFullYear(),
  currency: co.value?.currency ?? currency.value, lines: {} as Record<string, string>, kpis: [] as { name: string; value: string }[], notes: '', show_to_lps: false, document_id: '' })
const form = reactive(blank())
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
const periodEnd = computed(() => form.period_type === 'month' ? (form.month ? lastDay(Number(form.month.slice(0, 4)), Number(form.month.slice(5, 7))) : '') : form.period_type === 'quarter' ? lastDay(form.year, form.q * 3) : form.year + '-12-31')
function setFromEnd(end: string, type: string) { const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7)); form.period_type = type; form.month = end.slice(0, 7); form.year = y; form.q = Math.ceil(m / 3) }
const years = Array.from({ length: 12 }, (_, i) => now.getUTCFullYear() - i)
const isFund = computed(() => { const m = form.subject.match(/^entity:(.+)$/); return !co.value && !!m && ['fund', 'spv'].includes(subj.value?.entities.find((e) => e.id === m[1])?.kind ?? '') })
function openForm(s?: St) {
  Object.assign(form, blank()); aiNote.value = ''; msg.value = ''; showForm.value = true
  if (s) { setFromEnd(s.period_end, s.period_type); Object.assign(form, { currency: s.currency, notes: s.notes ?? '', show_to_lps: s.show_to_lps, lines: Object.fromEntries(Object.entries(s.lines).map(([k, v]) => [k, String(v)])), kpis: Object.entries(s.kpis).map(([name, v]) => ({ name, value: String(v) })) }) }
}
const num = (s: string) => (s === undefined || String(s).trim() === '' ? null : Number(String(s).replace(/[^0-9.\-]/g, '')))
const src = reactive({ gs: '', busy: '', qb: null as null | { locked?: boolean; needs_reconnect?: boolean; configured: boolean; connected: boolean; company: string | null; last_pulled_at: string | null } })
async function loadSources() { if (!form.subject || form.subject === 'group') { src.qb = null; return } try { const s = await $fetch<{ quickbooks: { locked?: boolean; needs_reconnect?: boolean; configured: boolean; connected: boolean; company: string | null; last_pulled_at: string | null }; gsheet: { url: string } }>('/api/integrations/status', { query: { subject: form.subject } }); src.qb = s.quickbooks; if (!src.gs) src.gs = s.gsheet.url } catch { src.qb = null } }
watch(() => [showForm.value, form.subject], () => { if (showForm.value) loadSources() })
function applyProposal(r: { period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id?: string; source?: string }) {
  if (r.period_end) setFromEnd(r.period_end, r.period_type)
  const c = (r.currency || form.currency).toUpperCase()
  Object.assign(form, { currency: CURS.value.includes(c) ? c : form.currency, document_id: r.document_id ?? form.document_id, lines: Object.fromEntries(Object.entries(r.lines).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])), kpis: Object.entries(r.kpis).map(([name, v]) => ({ name, value: String(v) })) })
  aiNote.value = (r.source ? 'From ' + r.source + '. ' : '') + r.notes + ' Check every figure before saving.'
}
const errOf = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
async function fromGoogle() { src.busy = 'gs'; msg.value = ''; try { applyProposal(await $fetch('/api/financials/gsheet', { method: 'POST', body: { url: src.gs, subject: form.subject, wanted: periodEnd.value || 'latest period' } })) } catch (e) { msg.value = errOf(e, 'Could not read the Google Sheet.') } finally { src.busy = '' } }
const qbWall = ref(false)
async function fromQuickBooks() { if (!periodEnd.value) { msg.value = 'Choose the period first.'; return } src.busy = 'qb'; msg.value = ''; try { applyProposal(await $fetch('/api/integrations/quickbooks/pull', { method: 'POST', body: { subject: form.subject, period_type: form.period_type, period_end: periodEnd.value } })) } catch (e) { msg.value = errOf(e, 'Could not pull from QuickBooks.'); if ((e as { data?: { data?: { error?: { code?: string } } } }).data?.data?.error?.code === 'quickbooks_reconnect') await loadSources() } finally { src.busy = '' } }
async function qbDisconnect() { if (!confirm('Disconnect QuickBooks for this entity or company?')) return; await $fetch('/api/integrations/quickbooks/disconnect', { method: 'POST', body: { subject: form.subject } }); await loadSources() }
onMounted(() => { const q = useRoute().query; if (q.qb === 'upgrade') qbWall.value = true; if (q.qb === 'connected') { ok.value = 'QuickBooks connected. Open "Add a statement" and choose Pull from QuickBooks.' } else if (q.qb === 'failed' || q.qb === 'cancelled') msg.value = q.qb === 'failed' ? 'QuickBooks connection failed. Please try again.' : 'QuickBooks connection cancelled.' })
async function fromSheet(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('file', f); fd.append('wanted', periodEnd.value || 'latest period')
  try {
    const r = await $fetch<{ period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id: string; more_periods: MorePeriod[] }>('/api/financials/extract', { method: 'POST', body: fd })
    more.value = r.more_periods ?? []
    if (r.period_end) setFromEnd(r.period_end, r.period_type)
    const c = (r.currency || form.currency).toUpperCase()
    Object.assign(form, { currency: CURS.value.includes(c) ? c : form.currency, document_id: r.document_id, lines: Object.fromEntries(Object.entries(r.lines).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])), kpis: Object.entries(r.kpis).map(([name, v]) => ({ name, value: String(v) })) })
    aiNote.value = r.notes + ' Check every figure before saving.'
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read the file.' } finally { busy.value = false }
}
// Other periods found in the same file (a bank statement over several months, a multi-year P&L): saved in one go.
interface MorePeriod { period_end: string; period_type: string; lines: Record<string, number | null>; kpis: Record<string, number> }
const more = ref<MorePeriod[]>([]); const moreBusy = ref(false)
async function saveMore() {
  moreBusy.value = true; msg.value = ''
  let n = 0
  try {
    for (const p of more.value) {
      await $fetch('/api/financials/statements', { method: 'POST', body: { subject: form.subject, period_type: p.period_type, period_end: p.period_end, currency: form.currency,
        lines: Object.fromEntries(Object.entries(p.lines).filter(([, v]) => v !== null)), kpis: p.kpis, notes: 'Read from the same file as ' + (periodEnd.value || 'the main period') + '.', document_id: form.document_id || undefined } })
      n++
    }
    ok.value = n + ' more period' + (n === 1 ? '' : 's') + ' saved from the file.'; more.value = []; await refresh()
  } catch (e) { msg.value = errOf(e, 'Saved ' + n + ' of ' + more.value.length + ' periods; the rest could not be saved.') } finally { moreBusy.value = false }
}
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ replaced: boolean }>('/api/financials/statements', { method: 'POST', body: { subject: form.subject, period_type: form.period_type, period_end: periodEnd.value, currency: form.currency,
      lines: Object.fromEntries(Object.entries(form.lines).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== null)), kpis: Object.fromEntries(form.kpis.filter((k) => k.name.trim() && num(k.value) !== null).map((k) => [k.name.trim(), num(k.value)])),
      notes: form.notes || undefined, show_to_lps: isFund.value && form.show_to_lps, document_id: form.document_id || undefined } })
    ok.value = r.replaced ? 'Statement updated.' : 'Statement saved.'; showForm.value = false; subject.value = form.subject; periodType.value = form.period_type; currency.value = form.currency; await refresh()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}

// share links
const { data: shares, refresh: rshares } = await useFetch<{ id: string; title: string; subject: string; metrics: string[]; views: number; last_viewed_at: string | null; expires: string; expired: boolean }[]>('/api/financials/shares')
const sh = reactive({ open: false, title: '', metrics: ['revenue', 'net_income', 'cash'] as string[], days: 30, url: '' })
const metricOptions = computed(() => [...(subj.value?.lines ?? []).filter((l) => l.section !== 'cf').map((l) => ({ key: l.key, label: l.label })), ...(subj.value?.derived ?? []), ...Object.keys(latest.value?.kpis ?? {}).map((k) => ({ key: 'kpi:' + k, label: k }))])
async function share() {
  msg.value = ''
  try { const r = await $fetch<{ url: string }>('/api/financials/shares', { method: 'POST', body: { title: sh.title || title.value, subject: subject.value, period_type: periodType.value, currency: cur.value, metrics: sh.metrics, days: sh.days } }); sh.url = r.url; await rshares() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the link.' }
}
const SECS = [['pl', 'Profit and loss', 'Revenue, costs and profit for the period'], ['bs', 'Balance sheet', 'What the company owns and owes at period end'], ['cf', 'Cash flow', 'Cash in and out during the period']] as const
</script>

<template>
  <section>
    <p class="label">{{ co ? 'Investors' : 'Records' }}</p>
    <div class="head">
      <div class="tl"><h1>Financials</h1>
        <select v-if="!co" v-model="subject" class="subj" aria-label="Show figures for"><option v-if="!scoped" value="group">Group (consolidated)</option>
          <optgroup v-if="subj?.entities.length" label="Funds and entities"><option v-for="e in subj.entities" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
          <optgroup v-if="subj?.companies.length" label="Portfolio and group companies"><option v-for="c in subj.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}{{ c.relationship === 'subsidiary' ? ' (subsidiary)' : '' }}</option></optgroup></select>
        <span v-else class="co">{{ co.name }}</span></div>
      <div class="tools">
        <div class="seg" role="group" aria-label="Show by"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly'], ['custom', 'Custom']]" :key="k" :class="{ on: view === k }" @click="view = k as typeof view">{{ l }}</button></div>
        <select v-if="!co && subject === 'group'" v-model="currency" aria-label="Currency"><option v-for="c in CURS" :key="c" :value="c">{{ c }}</option></select>
        <div v-if="co?.reporting" class="seg" role="group" aria-label="Show in"><button :class="{ on: !original }" @click="original = false">{{ co.reporting }}</button><button :class="{ on: original }" @click="original = true">Original</button></div>
        <NuxtLink v-if="canPath('/financials/boards')" to="/financials/boards" class="btn secondary bdl">Boards</NuxtLink>
        <button v-if="rows.length || monthly.length" class="btn secondary" type="button" @click="openStatements">Statements (PDF / Excel)</button>
        <button v-if="canEdit" class="btn" type="button" @click="openForm()">Add figures</button>
      </div>
    </div>
    <p v-if="!co && subject === 'group'" class="hint">Adds up every fund and entity, plus companies marked as subsidiaries, in {{ currency }}. Intercompany amounts are not eliminated.</p>
    <p v-if="converting" class="hint">Shown in {{ co?.reporting }} for reporting, converted at the latest daily exchange rate{{ co?.rate_as_of ? ' (' + new Date(co.rate_as_of).toLocaleDateString('en-GB') + ')' : '' }}. Your figures are stored in their original currency; switch to Original to edit. Billing is not affected.</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg && !showForm" class="error">{{ msg }}</p>

    <ClientOnly><BankFeeds v-if="canEdit" compact class="feeds" /></ClientOnly>
    <ClientOnly><SheetLinks target="financials" :subject="co?.subject ?? subject" :subject-label="co?.name ?? subjLabel" :currency="co?.currency ?? currency" :can-edit="canEdit" @synced="refresh()" /></ClientOnly>
    <div v-if="view === 'custom' && monthly.length" class="rng"><label>From<input v-model="range.from" type="month" :max="range.to"></label><label>To<input v-model="range.to" type="month" :min="range.from"></label><span>{{ inRange.length }} month{{ inRange.length === 1 ? '' : 's' }}: totals for the range, balances at its end</span></div>
    <p v-if="rolled" class="hint">Added up from your monthly figures (no {{ view === 'year' ? 'yearly' : 'quarterly' }} statements were entered).</p>
    <div v-if="co && canEdit && hasSec && data?.cash_policy == null" class="secq"><span><b>Your figures include investments such as treasury bills.</b> Count them with cash and show "Cash & marketable securities"? Runway then uses both.</span><span class="sb"><button class="btn sm" type="button" @click="setSec(true)">Yes, add them to cash</button><button class="btn secondary sm" type="button" @click="setSec(false)">No, bank balance only</button></span></div>
    <template v-if="vrows.length && latest">
      <nav class="tabs"><button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button><button :class="{ on: tab === 'statements' }" @click="tab = 'statements'">Statements <em>{{ rows.length }}</em></button><button :class="{ on: tab === 'shares' }" @click="tab = 'shares'">Sharing <em>{{ shares?.length ?? 0 }}</em></button><NuxtLink v-if="canPath('/financials/boards')" to="/financials/boards" class="tabl">Boards →</NuxtLink></nav>
      <template v-if="tab === 'overview'">
        <div class="fx-stats">
          <StatTile :label="'Revenue · ' + (view === 'custom' ? rangeLbl : lbl(latest.period_end))" icon="money" tone="b" :note="view === 'custom' ? 'Total for the range' : change('revenue') == null ? 'First period' : (change('revenue')! > 0 ? '▲ ' : '▼ ') + Math.abs(change('revenue')!) + '% vs previous'" :note-tone="(change('revenue') ?? 0) > 0 ? 'up' : (change('revenue') ?? 0) < 0 ? 'dn' : ''"><Money :value="latest.derived.revenue" :currency="cur" /></StatTile>
          <StatTile :label="(latest.derived.net_income ?? 0) < 0 ? 'Net loss' : 'Net income'" icon="chart" tone="n" :red="(latest.derived.net_income ?? 0) < 0"><Money :value="latest.derived.net_income" :currency="cur" /><template #note>EBITDA <Money :value="latest.derived.ebitda" :currency="cur" /></template></StatTile>
          <StatTile :label="secOn ? 'Cash & marketable securities' : 'Cash'" icon="billing" tone="g" :note="(cashKnown && cashKnown.at !== latest.period_end ? 'At ' + lbl(cashKnown.at, 'month') + ' · ' : '') + (runwayKnown ? runwayKnown + ' months runway' : latest.derived.burn === 0 ? 'Cash-flow positive' : cashKnown ? 'Runway needs burn' : 'Not in the figures')"><Money :value="cashKnown?.v ?? null" :currency="cur" /></StatTile>
          <StatTile label="Gross margin" icon="chart" tone="c" :value="pctFmt(latest.derived.gross_margin)"><template #note>Burn <Money :value="latest.derived.burn" :currency="cur" /> / month</template></StatTile>
        </div>
        <div class="charts">
          <TrendChart title="Revenue" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('revenue')" :foot="view === 'custom' ? 'Total, ' + rangeLbl : vrows.length + ' periods'" :foot-value="latest.derived.revenue ?? null" />
          <TrendChart title="Profit and loss" unit="usd" bars :symbol="SYM[cur] ?? cur + ' '" :points="pts('net_income')" :foot="view === 'custom' ? 'Net income, ' + rangeLbl : 'Net income after all costs'" :foot-value="latest.derived.net_income ?? null" />
          <TrendChart :title="secOn ? 'Cash & securities' : 'Cash'" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('cash')" :foot="cashKnown ? 'At ' + lbl(cashKnown.at, 'month') : 'Period end'" :foot-value="cashKnown?.v ?? null" />
        </div>
        <FinAnalysis v-if="co" :subject="co.subject" />
        <div v-if="checks?.checks.length" class="ck2"><button type="button" class="ckh" :aria-expanded="checksOpen" @click="checksOpen = !checksOpen"><span class="dot" /><b>{{ checks.checks.length }} figure{{ checks.checks.length === 1 ? '' : 's' }} to check</b><span>Totals in your figures that do not add up. Fix them at the source (the sheet or file) and sync again.</span><em>{{ checksOpen ? 'Hide' : 'Show' }}</em></button>
          <ul v-if="checksOpen"><li v-for="(c, i) in checks.checks" :key="i" :class="c.severity"><b>{{ lbl(c.period_end, c.period_type) }} · {{ c.what }}</b><span>{{ c.detail }}</span><em v-if="c.source === 'sheet'">From the linked sheet</em></li></ul></div>
        <div class="two"><div class="card"><DonutChart :title="'Operating expenses · ' + (view === 'custom' ? rangeLbl : lbl(latest.period_end))" total-label="Operating expenses" :currency="cur" :segments="mix" /></div>
          <div class="card"><h3>Latest periods</h3><div v-for="r in [...vrows].reverse().slice(0, 5)" :key="r.period_end" class="lp"><span>{{ lbl(r.period_end) }}</span><span><Money :value="r.derived.revenue" :currency="r.currency" /></span><span :class="{ neg: (r.derived.net_income ?? 0) < 0 }"><Money :value="r.derived.net_income" :currency="r.currency" /></span></div>
            <button class="link" @click="tab = 'statements'">All statements →</button></div></div>
      </template>
      <div v-else-if="tab === 'statements'" class="card flat"><div v-if="canEdit && !converting && subject !== 'group'" class="bulk"><span>{{ picked.length ? picked.length + ' selected' : 'Select periods to delete them, or clear some figures' }}</span><button v-if="picked.length" class="link" type="button" @click="picked = []">Unselect</button><button class="btn secondary sm" type="button" @click="clearOpen = true">{{ picked.length ? 'Delete or clear selected' : 'Delete or clear figures' }}</button></div><div class="scroll"><table class="table"><thead><tr><th v-if="canEdit && !converting && subject !== 'group'" class="cb"><input type="checkbox" :checked="allPicked" aria-label="Select all" @change="pickAll(($event.target as HTMLInputElement).checked)"></th><th>Period</th><th class="n">Revenue</th><th class="n">Gross margin</th><th class="n">EBITDA</th><th class="n">Net income</th><th class="n">Cash</th><th /></tr></thead>
        <tbody><tr v-for="r in [...rows].reverse()" :key="r.period_end" :class="{ pk: r.id && picked.includes(r.id) }"><td v-if="canEdit && !converting && subject !== 'group'" class="cb"><input v-if="r.id" v-model="picked" type="checkbox" :value="r.id" :aria-label="'Select ' + lbl(r.period_end)"></td><td><b>{{ lbl(r.period_end) }}</b><span class="sub">{{ r.source === 'upload' ? 'From spreadsheet' : r.source === 'sheet' ? 'Linked sheet' : r.source === 'api' ? 'From the API' : r.source === 'group' ? 'Consolidated' : 'Entered' }}{{ r.show_to_lps ? ' · shown to LPs' : '' }}</span></td>
          <td class="n"><Money :value="r.derived.revenue" :currency="r.currency" /></td><td class="n">{{ pctFmt(r.derived.gross_margin) }}</td><td class="n"><Money :value="r.derived.ebitda" :currency="r.currency" /></td>
          <td class="n"><Money :value="r.derived.net_income" :currency="r.currency" /></td><td class="n"><Money :value="r.derived.cash" :currency="r.currency" /></td>
          <td class="n"><template v-if="r.id && canEdit && !converting"><button class="link" type="button" @click="openForm(r)">Edit</button> · <DeleteButton type="statement" :id="r.id" :name="lbl(r.period_end) + ' statement'" link @deleted="refresh()" /></template></td></tr></tbody></table></div></div>
      <template v-else>
        <FinVisibility v-if="co && canEdit" />
        <div class="card frm"><div class="sh"><div><h3>Share your financials</h3><p class="hint">A private link showing only the metrics you pick. It expires, and you get an email when it is viewed.</p></div></div>
          <div class="g3"><label class="label">Title<input v-model="sh.title" :placeholder="title" maxlength="200"></label><label class="label">Expires after<select v-model.number="sh.days"><option :value="7">7 days</option><option :value="30">30 days</option><option :value="90">90 days</option><option :value="365">1 year</option></select></label></div>
          <div class="mets"><label v-for="m in metricOptions" :key="m.key" class="chk"><input v-model="sh.metrics" type="checkbox" :value="m.key" :disabled="!sh.metrics.includes(m.key) && sh.metrics.length >= 8"> {{ m.label }}</label></div>
          <div class="row"><button class="btn" type="button" :disabled="!sh.metrics.length || !canEdit" @click="share">Create link</button><span v-if="sh.url" class="small">Link: <a :href="webUrl(sh.url)" target="_blank" rel="noopener">{{ sh.url }}</a></span></div></div>
        <div v-if="shares?.length" class="card flat"><table class="table"><tbody><tr v-for="s in shares" :key="s.id"><td><b>{{ s.title }}</b><span class="sub">{{ s.metrics.length }} metric{{ s.metrics.length === 1 ? '' : 's' }} · {{ s.expired ? 'expired' : 'expires ' + s.expires }}</span></td>
          <td>{{ s.views }} view{{ s.views === 1 ? '' : 's' }}<span class="sub">{{ s.last_viewed_at ? 'last ' + new Date(s.last_viewed_at).toLocaleString('en-GB') : 'not opened yet' }}</span></td>
          <td class="n"><DeleteButton v-if="canEdit" type="fin_share" :id="s.id" :name="s.title" link @deleted="rshares()" /></td></tr></tbody></table></div>
        <EmptyState v-else card icon="link" title="No share links yet" text="Create one above and send it to an investor or partner." />
      </template>
    </template>
    <EmptyState v-else card icon="financials" :title="co ? 'Add your first month' : 'No figures yet' + (subject === 'group' ? '' : ' for ' + (data?.name ?? ''))"
      :text="co ? 'Drop in the profit and loss or management accounts you already keep and we read it for you to check, or type the figures in. Your dashboard, investor page and updates fill in from here.' : 'Add a profit and loss, balance sheet or KPI sheet for any fund, entity or company, monthly, quarterly or yearly. Upload a spreadsheet or type the figures in.'">
      <button v-if="canEdit" class="btn" @click="openForm()">Add figures</button></EmptyState>

    <AppModal :open="showForm" :title="rows.some((r) => r.period_end === periodEnd && r.period_type === form.period_type) ? 'Edit figures' : 'Add figures'" wide @close="showForm = false">
      <form id="finf" class="frm" @submit.prevent="save">
        <DropZone accept=".xlsx,.csv,.pdf,application/pdf" :disabled="busy" :label="busy ? 'Reading your file…' : 'Fill from a file'" hint="Drop accounts or a bank statement (Excel, CSV or PDF) and we map the figures for you to check · or click to choose" @change="fromSheet" />
        <div v-if="more.length" class="more"><span><b>{{ more.length }} more period{{ more.length === 1 ? '' : 's' }} in this file</b>: {{ more.map((p) => p.period_end.slice(0, 7)).join(', ') }}. Save the one below first, or save these as they were read.</span><button type="button" class="btn secondary sm" :disabled="moreBusy || !form.subject" @click="saveMore">{{ moreBusy ? 'Saving…' : 'Save these ' + more.length }}</button></div>
        <div v-if="form.subject && form.subject !== 'group'" class="srcs">
          <div class="src"><span class="sl"><b>Google Sheets</b><em>Share the sheet as "Anyone with the link: Viewer", then paste the link.</em></span><span class="sr"><input v-model="src.gs" placeholder="https://docs.google.com/spreadsheets/d/…"><button type="button" class="btn secondary sm" :disabled="!src.gs || !!src.busy" @click="fromGoogle">{{ src.busy === 'gs' ? 'Reading…' : 'Import' }}</button></span></div>
          <div v-if="src.qb" class="src"><span class="sl"><b>QuickBooks</b><em>{{ src.qb.connected ? 'Connected' + (src.qb.company ? ' · ' + src.qb.company : '') + (src.qb.last_pulled_at ? ' · last pulled ' + new Date(src.qb.last_pulled_at).toLocaleDateString('en-GB') : '') : src.qb.configured ? 'Pull P&L, balance sheet and cash flow for the period you choose.' : 'Not set up on this server yet.' }}</em></span>
            <span class="sr"><template v-if="src.qb.locked"><span class="lock">Startup &amp; Scale</span><button type="button" class="btn secondary sm" @click="qbWall = true">Connect QuickBooks</button></template><template v-else-if="src.qb.connected && src.qb.needs_reconnect"><span class="rc">Connection expired</span><a class="btn sm" :href="'/api/integrations/quickbooks/connect?subject=' + encodeURIComponent(form.subject)">Reconnect QuickBooks</a></template><template v-else-if="src.qb.connected"><button type="button" class="btn secondary sm" :disabled="!!src.busy" @click="fromQuickBooks">{{ src.busy === 'qb' ? 'Pulling…' : 'Pull this period' }}</button><button type="button" class="lnk" @click="qbDisconnect">Disconnect</button></template><a v-else-if="src.qb.configured" class="btn secondary sm" :href="'/api/integrations/quickbooks/connect?subject=' + encodeURIComponent(form.subject)">Connect QuickBooks</a></span></div></div>
        <p v-if="aiNote" class="note">{{ aiNote }}</p>
        <div class="g4">
          <label v-if="!co" class="label">For<select v-model="form.subject" required><option value="" disabled>Choose</option>
            <optgroup label="Funds and entities"><option v-for="e in subj?.entities ?? []" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
            <optgroup v-if="subj?.companies.length" label="Portfolio and group companies"><option v-for="c in subj.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}</option></optgroup></select></label>
          <label class="label">Period<select v-model="form.period_type"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
          <label v-if="form.period_type === 'month'" class="label">Month<input v-model="form.month" type="month" required></label>
          <template v-else-if="form.period_type === 'quarter'"><label class="label">Quarter<select v-model.number="form.q"><option v-for="n in 4" :key="n" :value="n">Q{{ n }}</option></select></label><label class="label">Year<select v-model.number="form.year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label></template>
          <label v-else class="label">Year<select v-model.number="form.year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label>
          <label class="label">Currency<select v-model="form.currency" required><option v-for="c in CURS" :key="c" :value="c">{{ curName(c) }}</option></select></label>
        </div>
        <details v-for="[sec, t, d] in SECS" :key="sec" class="sec" :open="sec === 'pl'"><summary><b>{{ t }}</b><span>{{ d }}</span></summary>
          <div class="g4"><label v-for="l in (subj?.lines ?? []).filter((x) => x.section === sec)" :key="l.key" class="label">{{ l.label }}<span class="money"><i>{{ SYM[form.currency] ?? '' }}</i><input v-model="form.lines[l.key]" inputmode="decimal" placeholder="—"></span></label></div></details>
        <details class="sec"><summary><b>Other KPIs</b><span>Customers, headcount, AUM or anything else you track</span></summary>
          <div v-for="(k, i) in form.kpis" :key="i" class="kr"><input v-model="k.name" placeholder="e.g. Customers" maxlength="60"><input v-model="k.value" inputmode="decimal" placeholder="Value"><button type="button" class="link" @click="form.kpis.splice(i, 1)">Remove</button></div>
          <button type="button" class="link" @click="form.kpis.push({ name: '', value: '' })">+ Add a KPI</button></details>
        <label class="label">Notes (optional)<textarea v-model="form.notes" rows="2" maxlength="1000" /></label>
        <label v-if="isFund" class="chk"><input v-model="form.show_to_lps" type="checkbox"> Show these fund financials to LPs in their portal</label>
        <p class="hint">Enter costs as positive numbers; keep the sign on net income, EBITDA and cash flows. Totals left blank are worked out for you. A balance sheet with all three totals must balance.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="showForm = false">Cancel</button><button class="btn" type="submit" form="finf" :disabled="busy">Save figures</button></template>
    </AppModal>
    <AppModal :open="sf.open" title="Financial statements" wide @close="sf.open = false">
      <div class="frm"><p class="hint">Income statement, balance sheet and cash flow in a standard layout, with your logo and comments. Unaudited management figures.</p>
        <div class="g4"><label class="label">Columns<select v-model="sf.period_type"><option value="month">Months</option><option value="quarter">Quarters</option><option value="year">Years</option></select></label>
          <label class="label">How many<select v-model.number="sf.count"><option v-for="n in (sf.period_type === 'year' ? [1, 2, 3, 5] : sf.period_type === 'quarter' ? [4, 6, 8, 12] : [3, 6, 12, 18, 24])" :key="n" :value="n">Last {{ n }}</option></select></label>
          <label class="label">Format<select v-model="sf.format"><option value="pdf">PDF</option><option value="xlsx">Excel</option></select></label>
</div>
        <CompanyLogo :company="co?.name ?? title" note="The logo on the statements is the one set in Settings." />
        <label class="label">Management comments<textarea v-model="sf.comments" rows="5" maxlength="8000" placeholder="What happened in the period, what drove the numbers, what comes next" /><button type="button" class="link" @click="draftComments">Draft from the analysis</button></label>
        <div class="g3b"><label class="label">Comment on the income statement<textarea v-model="sf.note_income" rows="2" maxlength="1500" /></label><label class="label">On the balance sheet<textarea v-model="sf.note_balance" rows="2" maxlength="1500" /></label><label class="label">On the cash flow<textarea v-model="sf.note_cash" rows="2" maxlength="1500" /></label></div>
        <label v-if="co" class="chk"><input v-model="sf.room" type="checkbox"> Also add it to the data room (Financials folder)</label>
        <p v-if="secOn" class="hint">Treasury bills and similar are shown as marketable securities, with a "Cash and marketable securities" line.</p>
        <p v-if="sf.msg" class="error">{{ sf.msg }}</p></div>
      <template #foot><button class="btn secondary" @click="sf.open = false">Cancel</button><button class="btn" :disabled="sf.busy" @click="makeStatements">{{ sf.busy ? 'Making…' : 'Download ' + (sf.format === 'pdf' ? 'PDF' : 'Excel') }}</button></template>
    </AppModal>
    <ClientOnly><FinClear :open="clearOpen" :subject="co?.subject ?? subject" :selected="picked" :lines="subj?.lines ?? []" :months="rows.map((r) => r.period_end)" @close="clearOpen = false" @done="cleared" /></ClientOnly>
    <AppModal :open="qbWall" title="QuickBooks" wide @close="qbWall = false"><Paywall code="quickbooks" label="QuickBooks" /></AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; } .tl { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; } .tl h1 { margin: 0; }
.subj { font-family: var(--font-heading); font-size: 18px; border: 0; border-bottom: 1px dashed var(--c-rule-strong); background: transparent; color: var(--c-blue-deep); padding: 2px 4px; cursor: pointer; } .co { font-family: var(--font-heading); font-size: 20px; color: var(--c-muted); }
.tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .seg { display: flex; border: 1px solid var(--c-rule-strong); background: #fff; } .seg button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.hint { color: var(--c-muted); font-size: 12.5px; margin: 4px 0 8px; } .small { font-size: 12.5px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 12px 0 16px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; background: var(--c-paper-2); padding: 1px 7px; margin-left: 4px; }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .two h3 { margin: 0 0 10px; }
.lp { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .lp span:not(:first-child) { text-align: right; } .lp .neg { color: var(--c-danger); } .two .link { margin-top: 10px; }
.flat { padding: 0; overflow: hidden; margin-bottom: 12px; } .scroll { overflow-x: auto; } .table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; }
td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.frm { display: flex; flex-direction: column; gap: 12px; } .card.frm { margin-bottom: 12px; } .sh h3 { margin: 0; } .note { background: var(--c-signal-soft); padding: 10px 12px; font-size: 13.5px; margin: 0; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 12px; } .g3 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.sec { border: 1px solid var(--c-rule); background: #fff; } .sec summary { list-style: none; cursor: pointer; padding: 12px 14px; display: flex; gap: 12px; align-items: baseline; } .sec summary::-webkit-details-marker { display: none; } .sec summary::after { content: '+'; margin-left: auto; color: var(--c-muted); font-size: 18px; } .sec[open] summary::after { content: '−'; }
.sec summary span { font-size: 12.5px; color: var(--c-muted); } .sec .g4, .sec .kr, .sec > .link { margin: 0 14px 12px; } .sec > .link { display: inline-block; margin-bottom: 14px; }
.money { display: flex; align-items: center; border: 1px solid var(--c-rule-strong); background: #fff; } .money i { font-style: normal; color: var(--c-muted); font-size: 13px; padding: 0 0 0 9px; } .money input { border: 0; flex: 1; min-width: 0; width: 100%; } .g4 > label, .g4 > * { min-width: 0; } .g4 input, .g4 select { width: 100%; box-sizing: border-box; }
.kr { display: flex; gap: 8px; } .kr input:first-child { flex: 2; } .kr input { flex: 1; } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .mets { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
@media (max-width: 1000px) { .g4 { grid-template-columns: 1fr 1fr; } .charts, .two, .g3 { grid-template-columns: 1fr; } }
.feeds { margin: 12px 0; }
.secq { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; background: #f5f7fb; border: 1px solid #d9e2ef; padding: 12px 16px; font-size: 13.5px; margin: 0 0 12px; } .secq .sb { display: flex; gap: 8px; } .btn.sm { padding: 6px 12px; font-size: 13px; } .g3b { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 12px; } @media (max-width: 800px) { .g3b { grid-template-columns: 1fr; } }
.rng { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin: 4px 0 10px; font-size: 13px; color: var(--c-muted); } .rng label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.ck2 { background: #fff; border: 1px solid var(--c-rule); margin: 0 0 12px; } .ckh { width: 100%; display: flex; gap: 10px; align-items: baseline; background: none; border: 0; padding: 12px 16px; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; flex-wrap: wrap; } .ckh .dot { width: 8px; height: 8px; border-radius: 50%; background: #c98a1c; align-self: center; } .ckh span:not(.dot) { color: var(--c-muted); font-size: 13px; flex: 1; } .ckh em { font-style: normal; color: var(--c-blue-deep); }
.ck2 ul { list-style: none; margin: 0; padding: 0 16px 10px; } .ck2 li { display: grid; grid-template-columns: 220px 1fr auto; gap: 12px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .ck2 li b { font-weight: 500; } .ck2 li.error b { color: var(--c-danger); } .ck2 li span { color: var(--c-ink-soft); } .ck2 li em { font-style: normal; font-size: 12px; color: var(--c-muted); }
@media (max-width: 800px) { .ck2 li { grid-template-columns: 1fr; } }
.tabl { margin-left: auto; padding: 10px 0; color: var(--c-blue-deep); text-decoration: none; font-size: 14px; }
.bdl { text-decoration: none; }
.bulk { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13px; color: var(--c-muted); } .bulk > span { margin-right: auto; } .cb { width: 34px; padding-right: 0; } .cb input { margin: 0; } tr.pk td { background: #f5f7fb; }
.srcs { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; } .src { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fff; flex-wrap: wrap; } .sl { display: flex; flex-direction: column; } .sl b { font-size: 13.5px; } .sl em { font-style: normal; font-size: 12px; color: var(--c-muted); } .sr { display: flex; gap: 8px; align-items: center; flex: 1; justify-content: flex-end; min-width: 260px; } .sr input { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .lnk { background: none; border: 0; color: var(--c-danger); cursor: pointer; font: inherit; font-size: 12.5px; }
.rc { font-size: 12.5px; color: var(--c-warn); }
.lock { font-size: 11.5px; font-weight: 600; padding: 3px 8px; background: #fff6e6; color: #a5650b; white-space: nowrap; }
.more { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--c-rule); background: var(--c-paper-2); padding: 10px 12px; font-size: 13px; color: var(--c-ink-soft); }
</style>
