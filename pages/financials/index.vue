<script setup lang="ts">
import { rollUp, combine, type FinRow, burnReview } from '~/shared/fin-view'
const { canPath } = useModuleAccess()
// Financials. Finvry companies: always their own company. Aidi OS: the group (consolidated) or any fund, entity or company.
useHead({ title: 'Financials' })
interface Line { key: string; label: string; section: string }
interface Subjects { company: { subject: string; name: string; currency: string; reporting: string | null; rate_as_of: string | null; structure?: 'single' | 'group' | null } | null; entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string; relationship: string }[]; currencies: string[]; lines: Line[]; derived: { key: string; label: string }[]; pages?: { id: string; name: string; currency: string | null; main: boolean }[]; paid?: boolean }
interface St { id: string | null; period_end: string; period_type: string; currency: string; lines: Record<string, number>; kpis: Record<string, number>; detail?: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; derived: Record<string, number | null>; cf_generated?: boolean; parts?: { who: string; currency: string; rate: number; uses: { quote: string; month: string; per_usd: number; source: 'book' | 'book_near' | 'history' | 'daily'; from_month?: string }[]; lines: Record<string, number> }[]; left_out?: string[]; eliminated?: { receivables: number; payables: number; equity: number; unreconciled: number; income: number; costs: number; items: { line: string; name: string; value: number; who: string }[] } }
// The company (or the group) being viewed lives in the address (?s=), shared with every Financials sub-page.
const fs = await useFinScope()
const subj = fs.subj as unknown as Ref<Subjects | null>
const { data: me } = await useFetch<{ roles: string[]; entity_scoped?: boolean }>('/api/auth/me', { key: 'me' })
// Someone limited to some companies sees those companies, not the group consolidation.
const scoped = computed(() => !!me.value?.entity_scoped)
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const baseCo = computed(() => subj.value?.company ?? null)
// One company or a group: asked once; a group is offered to add its first subsidiary.
const structDone = ref(false)
async function structAnswered(v: 'single' | 'group') { structDone.value = true; if (v === 'group') { if (subj.value?.paid) subForm.open = true; else subWall.value = true } }
const subjLabel = computed(() => { const m = subject.value.match(/^(entity|company):(.+)$/); if (!m) return ''; return (m[1] === 'entity' ? subj.value?.entities : subj.value?.companies)?.find((x) => x.id === m[2])?.name ?? '' })
const subject = fs.s
const periodType = ref('month'); const view = ref<'month' | 'quarter' | 'year' | 'custom'>('month'); watch(view, (v) => { periodType.value = v === 'custom' ? 'month' : v }); const currency = ref(fs.currencyOf(fs.s.value))
// Each view's own currency: a company its own, the group the reporting currency.
watch(subject, (v) => { currency.value = fs.currencyOf(v) })
// A company's Financials pages: the company, each subsidiary (own name and currency) and, with subsidiaries, the group.
const pages = computed(() => subj.value?.pages ?? [])
const co = computed(() => {
  const c = baseCo.value; if (!c) return null
  if (subject.value === 'group') return { ...c, subject: 'group', name: (pages.value[0]?.name ?? c.name) + ' · group', currency: currency.value }
  const p = pages.value.find((x) => 'entity:' + x.id === subject.value)
  return p ? { ...c, subject: 'entity:' + p.id, name: p.name, currency: p.currency ?? c.currency } : c
})
const isGroup = computed(() => !!baseCo.value && subject.value === 'group')
useHead({ title: computed(() => (co.value && pages.value.length > 1 ? co.value.name + ' · ' : '') + 'Financials') })
function pickPage(v: string) { if (v === '+add') { subForm.open = true; return } subject.value = v }
const subForm = reactive({ open: false, name: '', currency: baseCo.value?.currency ?? 'USD', country: '', busy: false, msg: '' })
const subWall = ref(false)
async function addSub() {
  if (!subj.value?.paid) { subForm.open = false; subWall.value = true; return }
  subForm.busy = true; subForm.msg = ''
  try { const r = await $fetch<{ subject: string }>('/api/financials/subsidiaries', { method: 'POST', body: { name: subForm.name, currency: subForm.currency, country: subForm.country } }); await refreshNuxtData(); subForm.open = false; subForm.name = ''; pickPage(r.subject) }
  catch (e) { subForm.msg = errOf(e, 'Could not add the subsidiary.') } finally { subForm.busy = false }
}
const ren = reactive({ open: false, name: '', currency: '', busy: false, msg: '' })
const curPage = computed(() => pages.value.find((x) => 'entity:' + x.id === subject.value) ?? null)
function openRename() { if (!curPage.value) return; Object.assign(ren, { open: true, name: curPage.value.name, currency: curPage.value.currency ?? baseCo.value?.currency ?? 'USD', msg: '' }) }
async function saveRename() {
  ren.busy = true; ren.msg = ''
  try { await $fetch('/api/financials/subsidiaries/' + curPage.value!.id, { method: 'POST', body: { name: ren.name, currency: curPage.value!.main ? undefined : ren.currency } }); await refreshNuxtData(); ren.open = false; if (!curPage.value?.main) currency.value = ren.currency }
  catch (e) { ren.msg = errOf(e, 'Could not rename.') } finally { ren.busy = false }
}
async function removeSub() {
  if (!curPage.value || curPage.value.main || !confirm('Remove ' + curPage.value.name + ' and all its figures? This cannot be undone.')) return
  try { await $fetch('/api/financials/subsidiaries/' + curPage.value.id, { method: 'DELETE' }); ren.open = false; subject.value = baseCo.value!.subject; await refreshNuxtData() } catch (e) { ren.msg = errOf(e, 'Could not remove it.') }
}
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
// Group figures: the latest month's intercompany eliminations (balances are at a date, so the latest month is the one to check).
const elim = computed(() => (subject.value === 'group' ? [...monthly.value].reverse().find((r) => r.eliminated) ?? null : null))
const fxOpen = ref(false)
const elimX = computed(() => elim.value?.eliminated ?? null)
const elimMonth = computed(() => (elim.value ? new Date(elim.value.period_end.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''))
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
const sf = reactive({ open: false, kind: 'report' as 'report' | 'statements', year: 0, warned: false, period_type: 'month', count: 12, format: 'pdf', comments: '', note_income: '', note_balance: '', note_cash: '', room: false, busy: false, msg: '' })
// The annual report's details (directors, CFO, offices, bankers…) and the years it can cover.
const rp = reactive({ years: [] as { year: number; label: string; months: number }[], missing: [] as { key: string; label: string }[], open: false })
async function loadRp() { try { const r = await $fetch<{ years: typeof rp.years; missing: typeof rp.missing }>('/api/financials/report-profile', { query: { subject: co.value?.subject ?? subject.value } }); rp.years = r.years; rp.missing = r.missing; if (!rp.years.some((y) => y.year === sf.year)) sf.year = rp.years[0]?.year ?? 0 } catch { /* the statements still work */ } }
function openStatements() { void loadRp(); Object.assign(sf, { warned: false, open: true, period_type: view.value === 'custom' ? 'month' : view.value, count: view.value === 'year' ? 3 : view.value === 'quarter' ? 4 : 12, msg: '', busy: false }) }
async function draftComments() {
  sf.msg = ''
  try { const a = await $fetch<{ headline: string; insights: { title: string; detail: string }[]; flags: { item: string; why: string }[] } | null>('/api/financials/analysis', { query: { subject: co.value?.subject ?? subject.value } }); if (a) sf.comments = [a.headline, ...a.insights.map((i) => i.title + '. ' + i.detail)].join('\n\n') }
  catch (e) { sf.msg = errOf(e, 'Could not draft comments.') }
}
async function makeStatements() {
  sf.busy = true; sf.msg = ''
  try {
    if (sf.kind === 'report' && rp.missing.length && !sf.warned) { sf.warned = true; return }
    const fd = new FormData(); for (const k of ['kind', 'year', 'period_type', 'count', 'format', 'comments', 'note_income', 'note_balance', 'note_cash'] as const) fd.append(k, String(sf[k])); fd.append('subject', co.value?.subject ?? subject.value); fd.append('room', sf.room ? '1' : '0')
    const res = await fetch('/api/financials/statements-file', { method: 'POST', body: fd, credentials: 'same-origin' })
    if (!res.ok) { const j = await res.json().catch(() => null) as { data?: { error?: { message?: string } } } | null; throw new Error(j?.data?.error?.message ?? 'Could not make the statements.') }
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]) ?? 'financial-statements.' + sf.format; a.click(); URL.revokeObjectURL(a.href)
    ok.value = (sf.kind === 'report' ? 'Investor financial report' : 'Statements') + ' downloaded' + (sf.room ? ' and added to the data room (Financials).' : '.'); sf.open = false
  } catch (e) { sf.msg = (e as Error).message } finally { sf.busy = false }
}
// Burn and runway checked three ways on the monthly figures (3-month average); else the latest period's burn.
const review = computed(() => burnReview(monthly.value as unknown as FinRow[]))
// Where each dollar of revenue went over the last three months.
const unit = computed(() => { const l3 = monthly.value.slice(-3); if (!l3.length) return null; const sum = (k: string) => l3.reduce((a, r) => a + (Number(r.derived[k] ?? 0) || 0), 0); return { revenue: sum('revenue'), cogs: sum('cogs'), opex: sum('opex_total'), label: l3.length === 1 ? lbl(l3[0]!.period_end, 'month') : lbl(l3[0]!.period_end, 'month') + ' – ' + lbl(l3[l3.length - 1]!.period_end, 'month') } })
// No runway from a cash balance two or more months older than the latest figures (it says nothing about today).
const cashStale = computed(() => { const c = cashKnown.value, l = latest.value; if (!c || !l) return false; const m = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)); return m(l.period_end) - m(c.at) >= 2 })
// Monthly view: burn is the 3-month average (one month alone swings with bills paid or collected); other views keep
// the period's own figure.
const burnShown = computed(() => view.value === 'month' && review.value.status !== 'none' ? (review.value.profitable ? 0 : review.value.burn) : latest.value?.derived.burn ?? null)
const runwayKnown = computed(() => { if (cashStale.value) return null; if (review.value.status !== 'none' && review.value.runway !== null) return review.value.runway; const b = latest.value?.derived.burn; return cashKnown.value && b ? Math.round((cashKnown.value.v / b) * 10) / 10 : null })
const cur = computed(() => latest.value?.currency ?? currency.value)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const CURS = computed(() => [...new Set(['USD', 'NGN', ...(co.value ? pages.value.map((p) => p.currency ?? '').filter(Boolean) : subj.value?.currencies ?? [])])])
const curName = (c: string) => ({ USD: 'US dollar (USD)', NGN: 'Naira (NGN)', GBP: 'Pound (GBP)', EUR: 'Euro (EUR)' } as Record<string, string>)[c] ?? c
const lbl = (d: string, t: string = view.value === 'custom' ? 'month' : view.value) => t === 'quarter' ? 'Q' + Math.ceil(Number(d.slice(5, 7)) / 3) + ' ' + d.slice(2, 4) : new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', t === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const rangeLbl = computed(() => (inRange.value.length ? lbl(inRange.value[0]!.period_end, 'month') + ' – ' + lbl(inRange.value[inRange.value.length - 1]!.period_end, 'month') : ''))
const pts = (k: string) => vrows.value.filter((r) => r.derived[k] != null).map((r) => ({ label: lbl(r.period_end), value: r.derived[k] as number }))
const change = (k: string) => { const a = latest.value?.derived[k], b = prev.value?.derived[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100) }
// Operating expenses only (no cost of revenue; R&D is left out as it may be capitalised).
const mix = computed(() => { const d = latest.value?.derived ?? {}; return [['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_ga', 'General & admin'], ['opex_other', 'Other operating']].map(([k, l]) => ({ label: l!, value: Number(d[k!] ?? 0) })) })
const pctFmt = (v: number | null | undefined) => (v == null ? '—' : v + '%')
const route0 = useRoute()
type Tab = 'overview' | 'statements' | 'shares' | 'consolidation' | 'reports'
const TABS: Tab[] = ['statements', 'shares', 'consolidation', 'reports']
const tabOf = (t: unknown): Tab => TABS.find((x) => x === t) ?? 'overview'
const tab = computed<Tab>({ get: () => { const t = tabOf(route0.query.tab); return (t === 'consolidation' && subject.value !== 'group') || (t === 'shares' && subject.value === 'group') ? 'overview' : t }, set: (v) => { void navigateTo({ query: { ...route0.query, tab: v === 'overview' ? undefined : v } }, { replace: true }) } })
const { data: modsF } = useNuxtData<{ code: string; locked?: boolean }[]>('modules')
const custLocked = computed(() => !!modsF.value?.find((m) => m.code === 'fin_customers' && m.locked))
// The monthly management report for the executive team (Startup and Scale).
const rptMod = computed(() => (modsF.value as { code: string; locked?: boolean; usable?: boolean }[] | null | undefined)?.find((m) => m.code === 'fin_report') ?? null)
const mr = reactive({ open: false })
// Retention and customer report for the view: one company's customers, or the group's combined.
const crpt = ref(false)
const custOf = computed(() => (subject.value === 'group' ? '' : fs.entityId.value ?? ''))
// The heading says exactly what is shown: the consolidated group, or one company.
const viewName = computed(() => (subject.value === 'group' ? (co.value ? (pages.value.find((p) => p.main)?.name ?? baseCo.value?.name ?? 'The') + ' group' : 'Group') : fs.current.value?.label ?? (data.value?.name ?? 'Financials')))
const viewSub = computed(() => (subject.value === 'group' ? 'Consolidated in ' + currency.value + ': ' + (co.value ? pages.value.length + ' companies' : 'every fund and entity') + ', after taking out what they owe and bill each other.' : (fs.current.value?.sub ?? '') + (co.value ? '. Its own figures; the group adds every company together.' : '')))
function mrDone(m: string) { mr.open = false; ok.value = m }
// Bulk delete / clear.
const picked = ref<string[]>([]); const clearOpen = ref(false); const coaOpen = ref(false)
watch([subject, periodType], () => { picked.value = [] })
const allPicked = computed(() => { const ids = rows.value.filter((r) => r.id).map((r) => r.id as string); return ids.length > 0 && ids.every((i) => picked.value.includes(i)) })
function pickAll(on: boolean) { picked.value = on ? rows.value.filter((r) => r.id).map((r) => r.id as string) : [] }
async function cfAnswered() { await Promise.all([refresh(), refreshM()]) }
async function cleared(m: string) { clearOpen.value = false; picked.value = []; ok.value = m; await Promise.all([refresh(), refreshM()]) }
// Figures that do not add up, across every saved period.
const { data: checks } = await useLazyFetch<{ checks: { period_end: string; period_type: string; what: string; detail: string; severity: string; source: string | null }[] }>('/api/financials/checks', { query: { subject }, watch: [subject], server: false, default: () => ({ checks: [] }) })
const checksOpen = ref(false)
const title = computed(() => co.value?.name ?? data.value?.name ?? 'Financials')

// add / edit (popup)
const showForm = ref(false); const msg = ref(''); const ok = ref(''); const busy = ref(false); const aiNote = ref('')
const now = new Date(); const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
const blank = () => ({ subject: co.value?.subject ?? (subject.value === 'group' ? '' : subject.value), period_type: periodType.value, month: lastMonth.toISOString().slice(0, 7), q: Math.floor(lastMonth.getUTCMonth() / 3) + 1, year: lastMonth.getUTCFullYear(),
  currency: co.value?.currency ?? currency.value, lines: {} as Record<string, string>, kpis: [] as { name: string; value: string }[], cats: [] as { name: string; line: string; value: string }[], notes: '', show_to_lps: false, document_id: '' })
const form = reactive(blank())
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
const periodEnd = computed(() => form.period_type === 'month' ? (form.month ? lastDay(Number(form.month.slice(0, 4)), Number(form.month.slice(5, 7))) : '') : form.period_type === 'quarter' ? lastDay(form.year, form.q * 3) : form.year + '-12-31')
function setFromEnd(end: string, type: string) { const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7)); form.period_type = type; form.month = end.slice(0, 7); form.year = y; form.q = Math.ceil(m / 3) }
const years = Array.from({ length: 12 }, (_, i) => now.getUTCFullYear() - i)
const isFund = computed(() => { const m = form.subject.match(/^entity:(.+)$/); return !co.value && !!m && ['fund', 'spv'].includes(subj.value?.entities.find((e) => e.id === m[1])?.kind ?? '') })
function openForm(s?: St) {
  Object.assign(form, blank()); aiNote.value = ''; msg.value = ''; showForm.value = true
  if (s) { setFromEnd(s.period_end, s.period_type); Object.assign(form, { currency: s.currency, notes: s.notes ?? '', show_to_lps: s.show_to_lps, lines: Object.fromEntries(Object.entries(s.lines).map(([k, v]) => [k, String(v)])), kpis: Object.entries(s.kpis).map(([name, v]) => ({ name, value: String(v) })), cats: Object.entries(s.detail ?? {}).map(([k, v]) => ({ line: k.slice(0, k.indexOf('|')), name: k.slice(k.indexOf('|') + 1), value: String(v) })) }) }
}
const num = (s: string) => (s === undefined || String(s).trim() === '' ? null : Number(String(s).replace(/[^0-9.\-]/g, '')))
const src = reactive({ gs: '', busy: '', qb: null as null | { locked?: boolean; needs_reconnect?: boolean; configured: boolean; connected: boolean; company: string | null; last_pulled_at: string | null } })
async function loadSources() { if (!form.subject || form.subject === 'group') { src.qb = null; return } try { const s = await $fetch<{ quickbooks: { locked?: boolean; needs_reconnect?: boolean; configured: boolean; connected: boolean; company: string | null; last_pulled_at: string | null }; gsheet: { url: string } }>('/api/integrations/status', { query: { subject: form.subject } }); src.qb = s.quickbooks; if (!src.gs) src.gs = s.gsheet.url } catch { src.qb = null } }
watch(() => [showForm.value, form.subject], () => { if (showForm.value) loadSources() })
function applyProposal(r: { period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id?: string; source?: string; categories?: { name: string; line: string; value: number }[] }) {
  if (r.period_end) setFromEnd(r.period_end, r.period_type)
  const c = (r.currency || form.currency).toUpperCase()
  Object.assign(form, { currency: CURS.value.includes(c) ? c : form.currency, document_id: r.document_id ?? form.document_id, lines: Object.fromEntries(Object.entries(r.lines).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])), kpis: Object.entries(r.kpis).map(([name, v]) => ({ name, value: String(v) })), cats: (r.categories ?? []).map((c) => ({ name: c.name, line: c.line, value: String(c.value) })) })
  aiNote.value = (r.source ? 'From ' + r.source + '. ' : '') + r.notes + ' Check every figure before saving.'
}
const errOf = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
async function fromGoogle() { src.busy = 'gs'; msg.value = ''; try { const gr = await $fetch<Parameters<typeof applyProposal>[0] & { more_periods?: MorePeriod[] }>('/api/financials/gsheet', { method: 'POST', body: { url: src.gs, subject: form.subject, wanted: periodEnd.value || 'latest period' } }); more.value = gr.more_periods ?? []; applyProposal(gr) } catch (e) { msg.value = errOf(e, 'Could not read the Google Sheet.') } finally { src.busy = '' } }
const qbWall = ref(false)
async function fromQuickBooks() { if (!periodEnd.value) { msg.value = 'Choose the period first.'; return } src.busy = 'qb'; msg.value = ''; try { applyProposal(await $fetch('/api/integrations/quickbooks/pull', { method: 'POST', body: { subject: form.subject, period_type: form.period_type, period_end: periodEnd.value } })) } catch (e) { msg.value = errOf(e, 'Could not pull from QuickBooks.'); if ((e as { data?: { data?: { error?: { code?: string } } } }).data?.data?.error?.code === 'quickbooks_reconnect') await loadSources() } finally { src.busy = '' } }
async function qbDisconnect() { if (!confirm('Disconnect QuickBooks for this entity or company?')) return; await $fetch('/api/integrations/quickbooks/disconnect', { method: 'POST', body: { subject: form.subject } }); await loadSources() }
onMounted(() => { const q = useRoute().query; if (q.qb === 'upgrade') qbWall.value = true; if (q.qb === 'connected') { ok.value = 'QuickBooks connected. Open "Add a statement" and choose Pull from QuickBooks.' } else if (q.qb === 'failed' || q.qb === 'cancelled') msg.value = q.qb === 'failed' ? 'QuickBooks connection failed. Please try again.' : 'QuickBooks connection cancelled.' })
async function fromSheet(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('file', f); fd.append('wanted', periodEnd.value || 'latest period')
  try {
    const r = await $fetch<{ period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id: string; more_periods: MorePeriod[]; categories?: { name: string; line: string; value: number }[] }>('/api/financials/extract', { method: 'POST', body: fd })
    // Every period in the file: this one in the form (with the company's own categories), the rest saved in one go.
    more.value = r.more_periods ?? []
    applyProposal(r)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read the file.' } finally { busy.value = false }
}
// Other periods found in the same file (a bank statement over several months, a multi-year P&L): saved in one go.
interface MorePeriod { period_end: string; period_type: string; lines: Record<string, number | null>; kpis: Record<string, number>; categories?: { name: string; line: string; value: number }[] }
const more = ref<MorePeriod[]>([]); const moreBusy = ref(false)
async function saveMore() {
  moreBusy.value = true; msg.value = ''
  let n = 0
  try {
    for (const p of more.value) {
      await $fetch('/api/financials/statements', { method: 'POST', body: { subject: form.subject, period_type: p.period_type, period_end: p.period_end, currency: form.currency,
        lines: Object.fromEntries(Object.entries(p.lines).filter(([, v]) => v !== null)), kpis: p.kpis, detail: Object.fromEntries((p.categories ?? []).map((c) => [c.line + '|' + c.name, c.value])), notes: 'Read from the same file as ' + (periodEnd.value || 'the main period') + '.', document_id: form.document_id || undefined } })
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
      detail: Object.fromEntries(form.cats.filter((c) => c.name.trim() && num(c.value) !== null).map((c) => [c.line + '|' + c.name.trim(), num(c.value)])),
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
    <FinHeader manage @add="pickPage('+add')" @rename="openRename" />
    <div class="head">
      <div class="tl"><h1>{{ viewName }}</h1><p class="vsub">{{ viewSub }}</p></div>
      <div v-if="tab !== 'reports'" class="tools">
        <div class="seg" role="group" aria-label="Show by"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly'], ['custom', 'Custom']]" :key="k" :class="{ on: view === k }" @click="view = k as typeof view">{{ l }}</button></div>
        <select v-if="(!co || isGroup) && subject === 'group'" v-model="currency" aria-label="Currency"><option v-for="c in CURS" :key="c" :value="c">{{ c }}</option></select>
        <div v-if="co?.reporting && !isGroup" class="seg" role="group" aria-label="Show in"><button :class="{ on: !original }" @click="original = false">{{ co.reporting }}</button><button :class="{ on: original }" @click="original = true">Original</button></div>
        <button v-if="canEdit && !isGroup" class="btn" type="button" @click="openForm()">Add figures</button>
      </div>
    </div>
    <p v-if="converting" class="hint">Shown in {{ co?.reporting }} for reporting, converted at the latest daily exchange rate{{ co?.rate_as_of ? ' (' + new Date(co.rate_as_of).toLocaleDateString('en-GB') + ')' : '' }}. Your figures are stored in their original currency; switch to Original to edit. Billing is not affected.</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg && !showForm" class="error">{{ msg }}</p>

    <!-- The group's consolidation: each company, the eliminations and the group, the rates used, and intercompany. -->
    <template v-if="tab === 'consolidation'">
      <p class="hint">{{ co ? 'Adds up the company and every subsidiary' : 'Adds up every fund and entity, plus companies marked as subsidiaries,' }} in {{ currency }}, each month at your book rate for it (Exchange rates), else your nearest book rate, else the daily rate. Amounts the companies owe or bill each other are taken out.</p>
      <ClientOnly><FinConsolidation v-if="monthly.some((r) => r.parts?.length)" :rows="monthly" :currency="currency" :name="viewName" :can-edit="canEdit" @rates="fxOpen = true" /></ClientOnly>
      <FinEliminations v-if="elim" :el="elim.eliminated" :period="elimMonth" :currency="currency" :total-assets="elim.lines.total_assets ?? null" @categories="coaOpen = true" />
      <EmptyState v-if="!monthly.some((r) => r.parts?.length)" card icon="financials" title="Nothing to consolidate yet" text="Add monthly figures for the company and its subsidiaries; the group is worked out from them." />
    </template>
    <!-- Reports for whatever is being viewed: the group or one company. -->
    <template v-else-if="tab === 'reports'">
      <div class="reps">
        <div class="card rep"><h3>Investor financial report</h3><p>Annual report, or statements by period: profit and loss, balance sheet and cash flow{{ subject === 'group' ? ', consolidated, with a note on how the group is put together' : '' }}. PDF or Excel, for investors, lenders and filings.</p>
          <button class="btn" type="button" :disabled="!(rows.length || monthly.length)" @click="openStatements">Make the report</button><span v-if="!(rows.length || monthly.length)" class="mut">Add figures first.</span></div>
        <div v-if="rptMod && (rptMod.usable || rptMod.locked)" class="card rep"><h3>Monthly management report<svg v-if="rptMod.locked" class="tlk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Upgrade to unlock"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></h3><p>A month's performance for {{ subject === 'group' ? 'the group' : viewName }}: growth, costs, cash, runway{{ co ? ', customers and retention' : '' }}, with what to raise with the team.</p>
          <button class="btn" type="button" :disabled="!monthly.length" @click="mr.open = true">Make the report</button></div>
        <div v-if="co && rptMod && rptMod.usable" class="card rep"><h3>Retention and customer report</h3><p>Revenue retention, churn and the customer base for {{ subject === 'group' ? 'the group (every company combined)' : viewName }}, for all customers or one group of them.</p>
          <button class="btn" type="button" @click="crpt = true">Make the report</button></div>
        <div v-if="subject === 'group'" class="card rep"><h3>Consolidation</h3><p>Each company, the eliminations and the group for any month, the exchange rates used, and what the companies owe and bill each other.</p>
          <button class="btn secondary" type="button" @click="tab = 'consolidation'">Open the consolidation</button></div>
      </div>
    </template>
    <template v-else>
    <ClientOnly><StructureAsk v-if="canEdit && baseCo && !baseCo.structure && !structDone && pages.length <= 1" :name="baseCo.name" @answered="structAnswered" /></ClientOnly>
    <ClientOnly><BankFeeds v-if="canEdit && tab === 'overview' && subject !== 'group'" compact class="feeds" /></ClientOnly>
    <ClientOnly v-if="subject !== 'group' && tab !== 'shares'"><SheetLinks target="financials" :subject="co?.subject ?? subject" :subject-label="co?.name ?? subjLabel" :currency="co?.currency ?? currency" :can-edit="canEdit" @synced="refresh()" /></ClientOnly>
    <div v-if="view === 'custom' && monthly.length" class="rng"><label>From<input v-model="range.from" type="month" :max="range.to"></label><label>To<input v-model="range.to" type="month" :min="range.from"></label><span>{{ inRange.length }} month{{ inRange.length === 1 ? '' : 's' }}: totals for the range, balances at its end</span></div>
    <p v-if="rolled" class="hint">Added up from your monthly figures (no {{ view === 'year' ? 'yearly' : 'quarterly' }} statements were entered).</p>
    <ClientOnly><CashFlowAsk v-if="canEdit && !isGroup && monthly.length >= 2 && !monthly.some((r) => ['operating_cf', 'investing_cf', 'financing_cf'].some((k) => typeof r.lines[k] === 'number'))" :subject="co?.subject ?? subject" @answered="cfAnswered" /></ClientOnly>
    <div v-if="co && canEdit && hasSec && data?.cash_policy == null" class="secq"><span><b>Your figures include investments such as treasury bills.</b> Count them with cash and show "Cash & marketable securities"? Runway then uses both.</span><span class="sb"><button class="btn sm" type="button" @click="setSec(true)">Yes, add them to cash</button><button class="btn secondary sm" type="button" @click="setSec(false)">No, bank balance only</button></span></div>
    <template v-if="vrows.length && latest">
      <template v-if="tab === 'overview'">
        <div class="fx-stats">
          <StatTile :label="'Revenue · ' + (view === 'custom' ? rangeLbl : lbl(latest.period_end))" icon="money" tone="b" :note="view === 'custom' ? 'Total for the range' : change('revenue') == null ? 'First period' : (change('revenue')! > 0 ? '▲ ' : '▼ ') + Math.abs(change('revenue')!) + '% vs previous'" :note-tone="(change('revenue') ?? 0) > 0 ? 'up' : (change('revenue') ?? 0) < 0 ? 'dn' : ''"><Money :value="latest.derived.revenue" :currency="cur" /></StatTile>
          <StatTile :label="(latest.derived.net_income ?? 0) < 0 ? 'Net loss' : 'Net income'" icon="chart" tone="n" :red="(latest.derived.net_income ?? 0) < 0"><Money :value="latest.derived.net_income" :currency="cur" /><template #note>EBITDA <Money :value="latest.derived.ebitda" :currency="cur" /></template></StatTile>
          <StatTile :label="secOn ? 'Cash & marketable securities' : 'Cash'" icon="billing" tone="b" :note="(cashKnown && cashKnown.at !== latest.period_end ? 'At ' + lbl(cashKnown.at, 'month') + ' · ' : '') + (runwayKnown ? runwayKnown + ' months runway' : cashStale ? 'No recent cash, so no runway' : latest.derived.burn === 0 ? 'Cash-flow positive' : cashKnown ? 'Runway needs burn' : 'Not in the figures')"><Money :value="cashKnown?.v ?? null" :currency="cur" /></StatTile>
          <StatTile label="Gross margin" icon="chart" tone="b" :value="pctFmt(latest.derived.gross_margin)"><template #note>Burn <Money :value="burnShown" :currency="cur" /> / month{{ view === 'month' && review.status !== 'none' ? ' (3-month average)' : '' }}</template></StatTile>
        </div>
        <BurnCheck v-if="!co && monthly.length >= 2" :review="review" :currency="cur" :with-securities="secOn" />
        <div class="charts">
          <TrendChart title="Revenue" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('revenue')" :foot="view === 'custom' ? 'Total, ' + rangeLbl : vrows.length + ' periods'" :foot-value="latest.derived.revenue ?? null" />
          <TrendChart title="Profit and loss" unit="usd" bars :symbol="SYM[cur] ?? cur + ' '" :points="pts('net_income')" :foot="view === 'custom' ? 'Net income, ' + rangeLbl : 'Net income after all costs'" :foot-value="latest.derived.net_income ?? null" />
          <TrendChart :title="secOn ? 'Cash & securities' : 'Cash'" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('cash')" :foot="cashKnown ? 'At ' + lbl(cashKnown.at, 'month') : 'Period end'" :foot-value="cashKnown?.v ?? null" />
        </div>
        <template v-if="subject === 'group' && co">
          <ClientOnly><FinGroupSummary companies @open="pickPage" /></ClientOnly>
          <p v-if="elimX && elimX.items.length" class="icn">Intercompany taken out for {{ elimMonth }}: <b>{{ briefMoney(elimX.receivables, currency) }}</b> owed and <b>{{ briefMoney(elimX.payables, currency) }}</b> owing within the group{{ Math.abs(elimX.unreconciled) >= 1 ? '; the books differ by ' + briefMoney(Math.abs(elimX.unreconciled), currency) : '' }}. <NuxtLink :to="{ query: { ...$route.query, tab: 'consolidation' } }">See the consolidation →</NuxtLink></p>
        </template>
        <FinAnalysis v-if="co" brief :next-to="{ path: '/financials/next', query: { s: subject } }" :subject="co.subject" :review="monthly.length >= 2 ? review : null" :unit="unit" :currency="cur" :with-securities="secOn" />
        <ClientOnly><ShareTo v-if="co && !isGroup && canEdit && co.subject === baseCo?.subject" :sections="['intro', 'summary', 'scorecard', 'growth', 'cash']" what="these figures" /></ClientOnly>
        <p v-for="(c, i) in (checks?.checks ?? []).filter((x) => x.what === 'Missing months' || x.what === 'Cash missing')" :key="'g' + i" class="gapw"><b>{{ c.what }}.</b> {{ c.detail }}</p>
        <div v-if="checks?.checks.length" class="ck2"><button type="button" class="ckh" :aria-expanded="checksOpen" @click="checksOpen = !checksOpen"><span class="dot" /><b>{{ checks.checks.length }} figure{{ checks.checks.length === 1 ? '' : 's' }} to check</b><span>Totals in your figures that do not add up. Fix them at the source (the sheet or file) and sync again.</span><em>{{ checksOpen ? 'Hide' : 'Show' }}</em></button>
          <ul v-if="checksOpen"><li v-for="(c, i) in checks.checks" :key="i" :class="c.severity"><b>{{ lbl(c.period_end, c.period_type) }} · {{ c.what }}</b><span>{{ c.detail }}</span><em v-if="c.source === 'sheet'">From the linked sheet</em></li></ul></div>
        <div class="two"><div class="card"><DonutChart :title="'Operating expenses · ' + (view === 'custom' ? rangeLbl : lbl(latest.period_end))" total-label="Operating expenses" :currency="cur" :segments="mix" /></div>
          <div class="card"><h3>Latest periods</h3><div v-for="r in [...vrows].reverse().slice(0, 5)" :key="r.period_end" class="lp"><span>{{ lbl(r.period_end) }}</span><span><Money short :value="r.derived.revenue" :currency="r.currency" /></span><span :class="{ neg: (r.derived.net_income ?? 0) < 0 }"><Money short :value="r.derived.net_income" :currency="r.currency" /></span></div>
            <button class="link" @click="tab = 'statements'">All statements →</button></div></div>
      </template>
      <div v-else-if="tab === 'statements'" class="card flat"><ClientOnly><CashFlowAsk v-if="rows.some((r) => r.cf_generated)" :subject="co?.subject ?? subject" show-on @answered="cfAnswered" /></ClientOnly><div v-if="canEdit && !converting && subject !== 'group'" class="bulk"><span>{{ picked.length ? picked.length + ' selected' : 'Select periods to delete them, or clear some figures' }}</span><button type="button" class="link" @click="coaOpen = true">Your categories</button><button v-if="picked.length" class="link" type="button" @click="picked = []">Unselect</button><button class="btn secondary sm" type="button" @click="clearOpen = true">{{ picked.length ? 'Delete or clear selected' : 'Delete or clear figures' }}</button></div><div class="scroll"><table class="table"><thead><tr><th v-if="canEdit && !converting && subject !== 'group'" class="cb"><input type="checkbox" :checked="allPicked" aria-label="Select all" @change="pickAll(($event.target as HTMLInputElement).checked)"></th><th>Period</th><th class="n">Revenue</th><th class="n">Gross margin</th><th class="n">EBITDA</th><th class="n">Net income</th><th class="n">Cash</th><th /></tr></thead>
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
      <button v-if="canEdit && !isGroup" class="btn" @click="openForm()">Add figures</button></EmptyState>
    </template>
    <ClientOnly><FinFxRates :open="fxOpen" :can-edit="canEdit" @close="fxOpen = false" @changed="refresh(); refreshM()" /></ClientOnly>

    <AppModal :open="showForm" :title="rows.some((r) => r.period_end === periodEnd && r.period_type === form.period_type) ? 'Edit figures' : 'Add figures'" wide @close="showForm = false">
      <form id="finf" class="frm" @submit.prevent="save">
        <DropZone accept=".xlsx,.csv,.pdf,application/pdf" :disabled="busy" :label="busy ? 'Reading your file…' : 'Fill from a file'" hint="Excel or CSV: months across, line names down the first column (or the Finvry template), read by line names with no AI. PDF: read with AI, check every figure · or click to choose" @change="fromSheet" />
        <p class="hint tph">No sheet yet? <a href="/api/financials/template">Download the Finvry template</a>: months across, our line names down the side, read exactly every time. Link it under Linked sheets to keep it in step.</p>
        <div v-if="more.length" class="more"><span><b>{{ more.length }} more period{{ more.length === 1 ? '' : 's' }} in this file</b>: {{ more.length > 6 ? more[0]!.period_end.slice(0, 7) + ' to ' + more[more.length - 1]!.period_end.slice(0, 7) : more.map((p) => p.period_end.slice(0, 7)).join(', ') }}. Save the one below first, or save these as they were read.</span><button type="button" class="btn secondary sm" :disabled="moreBusy || !form.subject" @click="saveMore">{{ moreBusy ? 'Saving…' : 'Save these ' + more.length }}</button></div>
        <div v-if="form.subject && form.subject !== 'group'" class="srcs">
          <div class="src"><span class="sl"><b>Google Sheets</b><em>Share the sheet as "Anyone with the link: Viewer", then paste the link.</em></span><span class="sr"><input v-model="src.gs" placeholder="https://docs.google.com/spreadsheets/d/…"><button type="button" class="btn secondary sm" :disabled="!src.gs || !!src.busy" @click="fromGoogle">{{ src.busy === 'gs' ? 'Reading…' : 'Import' }}</button></span></div>
          <div v-if="src.qb" class="src"><span class="sl"><b>QuickBooks</b><em>{{ src.qb.connected ? 'Connected' + (src.qb.company ? ' · ' + src.qb.company : '') + (src.qb.last_pulled_at ? ' · last pulled ' + new Date(src.qb.last_pulled_at).toLocaleDateString('en-GB') : '') : src.qb.configured ? 'Pull P&L, balance sheet and cash flow for the period you choose.' : 'Not set up on this server yet.' }}</em></span>
            <span class="sr"><template v-if="src.qb.locked"><span class="lock">Startup &amp; Scale</span><button type="button" class="btn secondary sm" @click="qbWall = true">Connect QuickBooks</button></template><template v-else-if="src.qb.connected && src.qb.needs_reconnect"><span class="rc">Connection expired</span><a class="btn sm" :href="'/api/integrations/quickbooks/connect?subject=' + encodeURIComponent(form.subject)">Reconnect QuickBooks</a></template><template v-else-if="src.qb.connected"><button type="button" class="btn secondary sm" :disabled="!!src.busy" @click="fromQuickBooks">{{ src.busy === 'qb' ? 'Pulling…' : 'Pull this period' }}</button><button type="button" class="lnk" @click="qbDisconnect">Disconnect</button></template><a v-else-if="src.qb.configured" class="btn secondary sm" :href="'/api/integrations/quickbooks/connect?subject=' + encodeURIComponent(form.subject)">Connect QuickBooks</a></span></div></div>
        <p v-if="aiNote" class="note">{{ aiNote }}</p>
        <ClientOnly><CashFlowAsk v-if="aiNote && /^(entity|company):/.test(form.subject) && !['operating_cf', 'investing_cf', 'financing_cf'].some((k) => form.lines[k])" :subject="form.subject" inline /></ClientOnly>
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
        <details class="sec" :open="form.cats.length > 0"><summary><b>Your categories</b><span>Items that are not a standard line, kept in your chart of accounts{{ form.cats.length ? ' · ' + form.cats.length : '' }}</span></summary>
          <p class="hint" style="margin: 0 14px 8px">Each is added into the line it belongs to when that line is left blank above.</p>
          <div v-for="(c, i) in form.cats" :key="i" class="kr"><input v-model="c.name" placeholder="e.g. Consultants" maxlength="80"><select v-model="c.line" aria-label="Belongs to"><option value="">No line (detail only)</option><option v-for="l in (subj?.lines ?? [])" :key="l.key" :value="l.key">In {{ l.label }}</option></select><input v-model="c.value" inputmode="decimal" placeholder="Value"><button type="button" class="link" @click="form.cats.splice(i, 1)">Remove</button></div>
          <button type="button" class="link" @click="form.cats.push({ name: '', line: 'opex_other', value: '' })">+ Add a category</button></details>
        <label class="label">Notes (optional)<textarea v-model="form.notes" rows="2" maxlength="1000" /></label>
        <label v-if="isFund" class="chk"><input v-model="form.show_to_lps" type="checkbox"> Show these fund financials to LPs in their portal</label>
        <p class="hint">Enter costs as positive numbers; keep the sign on net income, EBITDA and cash flows. Totals left blank are worked out for you. A balance sheet with all three totals must balance.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="showForm = false">Cancel</button><button class="btn" type="submit" form="finf" :disabled="busy">Save figures</button></template>
    </AppModal>
    <AppModal :open="sf.open" title="Investor financial report" wide @close="sf.open = false">
      <div class="frm"><div class="seg kinds" role="group" aria-label="What to make"><button :class="{ on: sf.kind === 'report' }" type="button" @click="sf.kind = 'report'">Annual report</button><button :class="{ on: sf.kind === 'statements' }" type="button" @click="sf.kind = 'statements'">Statements by period</button></div>
        <p class="hint">{{ sf.kind === 'report' ? 'The full set: cover, directors and advisers, report of the directors, accounting policies, balance sheet, statement of operations, changes in equity, cash flows and notes, with the year before for comparison.' : 'Income statement, balance sheet and cash flow side by side for each month, quarter or year.' }}</p>
        <div v-if="sf.kind === 'report'" class="g2r"><label class="label">Year<select v-model.number="sf.year"><option v-for="y in rp.years" :key="y.year" :value="y.year">{{ y.label.replace(/^./, (c) => c.toUpperCase()) }}</option><option v-if="!rp.years.length" :value="0" disabled>No figures yet</option></select></label>
          <label class="label">Format<select v-model="sf.format"><option value="pdf">PDF</option><option value="xlsx">Excel</option></select></label></div>
        <div v-if="sf.kind === 'report'" class="rpd" :class="{ warn: rp.missing.length }"><span v-if="rp.missing.length"><b>{{ rp.missing.length }} detail{{ rp.missing.length === 1 ? '' : 's' }} to fill in:</b> {{ rp.missing.map((m) => m.label).join(', ') }}.</span><span v-else><b>Report details complete.</b> Directors, officers, offices, advisers and bankers are set.</span><button type="button" class="btn secondary sm" @click="rp.open = true">{{ rp.missing.length ? 'Fill in details' : 'Edit details' }}</button></div>
        <div v-else class="g4"><label class="label">Columns<select v-model="sf.period_type"><option value="month">Months</option><option value="quarter">Quarters</option><option value="year">Years</option></select></label>
          <label class="label">How many<select v-model.number="sf.count"><option v-for="n in (sf.period_type === 'year' ? [1, 2, 3, 5] : sf.period_type === 'quarter' ? [4, 6, 8, 12] : [3, 6, 12, 18, 24])" :key="n" :value="n">Last {{ n }}</option></select></label>
          <label class="label">Format<select v-model="sf.format"><option value="pdf">PDF</option><option value="xlsx">Excel</option></select></label>
</div>
        <CompanyLogo :company="co?.name ?? title" note="The logo on the statements is the one set in Settings." />
        <label class="label">{{ sf.kind === 'report' ? 'Review of the business (in the report of the directors)' : 'Management comments' }}<textarea v-model="sf.comments" rows="5" maxlength="8000" placeholder="What happened in the period, what drove the numbers, what comes next" /><button type="button" class="link" @click="draftComments">Draft from the analysis</button></label>
        <div class="g3b"><label class="label">Comment on the income statement<textarea v-model="sf.note_income" rows="2" maxlength="1500" /></label><label class="label">On the balance sheet<textarea v-model="sf.note_balance" rows="2" maxlength="1500" /></label><label class="label">On the cash flow<textarea v-model="sf.note_cash" rows="2" maxlength="1500" /></label></div>
        <label v-if="co" class="chk"><input v-model="sf.room" type="checkbox"> Also add it to the data room (Financials folder)</label>
        <p v-if="secOn" class="hint">Treasury bills and similar are shown as marketable securities, with a "Cash and marketable securities" line.</p>
        <p v-if="sf.warned && rp.missing.length" class="wn">Not filled in yet: {{ rp.missing.map((m) => m.label).join(', ') }}. These are left out of the report. Fill them in first, or download it as it is.</p>
        <p v-if="sf.msg" class="error">{{ sf.msg }}</p></div>
      <template #foot><button class="btn secondary" @click="sf.open = false">Cancel</button><button v-if="sf.warned && rp.missing.length" class="btn secondary" @click="rp.open = true">Fill in details</button><button class="btn" :disabled="sf.busy || (sf.kind === 'report' && !sf.year)" @click="makeStatements">{{ sf.busy ? 'Making…' : sf.warned && rp.missing.length ? 'Download anyway' : 'Download ' + (sf.format === 'pdf' ? 'PDF' : 'Excel') }}</button></template>
    </AppModal>
    <ClientOnly><FinClear :open="clearOpen" :subject="co?.subject ?? subject" :selected="picked" :lines="subj?.lines ?? []" :months="rows.map((r) => r.period_end)" @close="clearOpen = false" @done="cleared" /></ClientOnly>
    <AppModal :open="subForm.open" title="Add a subsidiary" @close="subForm.open = false">
      <form id="subf" class="frm" @submit.prevent="addSub"><p class="hint">Each subsidiary gets its own Financials page, named as you like, in its own currency. The group view adds them all up at the latest daily rate.</p>
        <label class="label">Name<input v-model="subForm.name" required minlength="2" maxlength="120" placeholder="e.g. Kiza Nigeria Ltd"></label>
        <div class="g3"><label class="label">Country (optional)<input v-model="subForm.country" maxlength="60"></label><label class="label">Currency<select v-model="subForm.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR', 'CAD', 'KES', 'GHS', 'ZAR', 'EGP', 'RWF', 'AED']" :key="c" :value="c">{{ c }}</option></select></label></div>
        <p v-if="subForm.msg" class="error">{{ subForm.msg }}</p></form>
      <template #foot><button class="btn secondary" type="button" @click="subForm.open = false">Cancel</button><button class="btn" type="submit" form="subf" :disabled="subForm.busy">Add subsidiary</button></template>
    </AppModal>
    <AppModal :open="ren.open" :title="curPage?.main ? 'Rename this page' : 'Subsidiary'" @close="ren.open = false">
      <form id="renf" class="frm" @submit.prevent="saveRename"><label class="label">Name shown on this Financials page<input v-model="ren.name" required minlength="2" maxlength="120"></label>
        <label v-if="!curPage?.main" class="label">Currency<select v-model="ren.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR', 'CAD', 'KES', 'GHS', 'ZAR', 'EGP', 'RWF', 'AED']" :key="c" :value="c">{{ c }}</option></select></label>
        <p v-if="ren.msg" class="error">{{ ren.msg }}</p></form>
      <template #foot><button v-if="!curPage?.main" class="link del" type="button" @click="removeSub">Remove subsidiary</button><button class="btn secondary" type="button" @click="ren.open = false">Cancel</button><button class="btn" type="submit" form="renf" :disabled="ren.busy">Save</button></template>
    </AppModal>
    <AppModal :open="subWall" title="Subsidiaries" wide @close="subWall = false"><Paywall code="subsidiaries" label="Subsidiaries" /></AppModal>
    <ClientOnly><ChartOfAccounts :open="coaOpen" :can-edit="canEdit" @close="coaOpen = false" @changed="refresh()" /></ClientOnly>
    <ClientOnly><ReportDetails :open="rp.open" @close="rp.open = false" @saved="(m) => { rp.missing = m; sf.warned = false }" /></ClientOnly>
    <ClientOnly><MgmtReport v-if="mr.open && !rptMod?.locked" :open="mr.open" :subject="co?.subject ?? subject" :company="viewName" :cust="custOf" @close="mr.open = false" @done="mrDone" /></ClientOnly>
    <ClientOnly><MgmtReport v-if="crpt" :open="crpt" :subject="co?.subject ?? subject" :company="viewName" :cust="custOf" :only="['retention', 'customers']" title="Retention and customer report" @close="crpt = false" @done="(m) => { crpt = false; ok = m }" /></ClientOnly>
    <AppModal v-if="mr.open && rptMod?.locked" :open="mr.open" title="Monthly management report" wide @close="mr.open = false"><Paywall code="fin_report" label="Monthly management report" /></AppModal>
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
.bdl { text-decoration: none; } .tsub { display: flex; align-items: center; gap: 5px; padding: 10px 0; color: var(--c-muted); text-decoration: none; font-size: 15px; } .tsub:hover { color: var(--c-ink); } .tlk { width: 12px; height: 12px; } .kinds { align-self: flex-start; } .g2r { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; max-width: 560px; } .g2r select { width: 100%; } .rpd { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--c-rule); background: #f7f9fc; padding: 10px 14px; font-size: 13px; } .rpd.warn { background: #fff8eb; border-color: #f0d9a8; color: #6b4a07; } .wn { margin: 0; font-size: 13px; color: #8a5a0a; } .rn { font-size: 13px; } .link.del { color: var(--c-danger); margin-right: auto; }
.bulk { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13px; color: var(--c-muted); } .bulk > span { margin-right: auto; } .cb { width: 34px; padding-right: 0; } .cb input { margin: 0; } tr.pk td { background: #f5f7fb; }
.srcs { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; } .src { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fff; flex-wrap: wrap; } .sl { display: flex; flex-direction: column; } .sl b { font-size: 13.5px; } .sl em { font-style: normal; font-size: 12px; color: var(--c-muted); } .sr { display: flex; gap: 8px; align-items: center; flex: 1; justify-content: flex-end; min-width: 260px; } .sr input { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .lnk { background: none; border: 0; color: var(--c-danger); cursor: pointer; font: inherit; font-size: 12.5px; }
.rc { font-size: 12.5px; color: var(--c-warn); }
.lock { font-size: 11.5px; font-weight: 600; padding: 3px 8px; background: #fff6e6; color: #a5650b; white-space: nowrap; }
.more { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--c-rule); background: var(--c-paper-2); padding: 10px 12px; font-size: 13px; color: var(--c-ink-soft); }
.gapw { margin: 0 0 10px; padding: 10px 14px; border: 1px solid #d9e2ef; background: #f5f7fb; font-size: 13.5px; color: var(--c-ink); } .gapw b { font-weight: 500; }
.tph { margin: 6px 0 0; } .tph a { color: var(--c-blue-deep); }
.vsub { margin: 2px 0 0; font-size: 13.5px; color: var(--c-muted); } .icn { margin: 0 0 14px; font-size: 13.5px; color: var(--c-ink-soft); } .icn b { font-weight: 500; } .icn a { color: var(--c-blue-deep); text-decoration: none; }
.reps { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; } .rep { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; } .rep h3 { margin: 0; font-size: 17px; font-weight: 500; color: var(--c-navy); display: flex; gap: 6px; align-items: center; } .rep p { margin: 0 0 4px; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.5; flex: 1; } .rep .mut { font-size: 12.5px; color: var(--c-muted); }
</style>
