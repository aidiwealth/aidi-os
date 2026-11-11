<script setup lang="ts">
// Finvry cap table: who owns what, the option pool and vesting, SAFEs and notes, and what a priced round or an exit
// would mean for everyone.
import { table, round, vested, liveShares, type Data } from '~/shared/captable'
import { positions, orderRows, commonHolders, currentPrice, type Right } from '~/shared/positions'
useHead({ title: 'Cap table' })
type D = Data & { captable: string; captables: { id: string; name: string; note: string | null; is_main: boolean; updated_at: string; views?: number }[]; holders: (Data['holders'][number] & { email: string | null })[]; safes: { id: string; investor_name: string; amount: number; currency: string; valuation_cap: number | null; discount: number | null; safe_date: string }[]; company: string }
const route = useRoute(), router = useRouter()
const ct = ref(String(route.query.ct ?? ''))
const { data, refresh } = await useFetch<D>('/api/equity', { query: { ct } })
watch(() => data.value?.captable, (id) => { if (id && id !== ct.value) ct.value = id })
const TABS = [['overview', 'Overview'], ['shares', 'Shareholders'], ['options', 'Options'], ['convertibles', 'SAFEs & notes'], ['rights', 'Rights & positions'], ['signing', 'Signing'], ['round', 'Model a round'], ['valuation', 'Valuation'], ['exit', 'Exit']] as const
const tab = ref<string>(String(route.query.t ?? 'overview')); watch([tab, ct], ([t, c]) => router.replace({ query: { ...route.query, t, ct: c || undefined, share: undefined } }))
// Several cap tables (today's, a pro forma, a what-if), each shareable.
const shareOpen = ref(route.query.share === '1')
const { canPath } = useModuleAccess(), hasRoom = computed(() => canPath('/fundraising'))
const cm = reactive({ open: false, mode: 'create' as 'create' | 'copy' | 'rename', name: '', note: '' })
const curCt = computed(() => data.value?.captables.find((c) => c.id === data.value?.captable))
function ctForm(mode: typeof cm.mode) { cm.mode = mode; cm.name = mode === 'rename' ? curCt.value?.name ?? '' : mode === 'copy' ? (curCt.value?.name ?? 'Cap table') + ' (what-if)' : 'Pro forma'; cm.note = mode === 'rename' ? curCt.value?.note ?? '' : ''; cm.open = true; msg.value = '' }
async function ctAct(action: 'create' | 'copy' | 'rename' | 'main' | 'delete') {
  if (action === 'delete' && !await askConfirm('Delete "' + curCt.value?.name + '" and everything on it? Its share links stop working.')) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/equity/captables', { method: 'POST', body: { action, id: action === 'create' ? undefined : ct.value || data.value?.captable, name: cm.name || undefined, note: cm.note } }); cm.open = false; if (action === 'create' || action === 'copy') ct.value = r.id; else if (action === 'delete') ct.value = ''; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const today = new Date().toISOString().slice(0, 10)
const t = computed(() => (data.value ? table(data.value, today) : null))
const n = (v: number) => Math.round(v).toLocaleString('en-US'), pct = (v: number) => (Math.round(v * 100) / 100).toFixed(2) + '%'
const usd = (v: number | null | undefined, c = 'USD') => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: v < 10 ? 4 : 0 }).format(v))
const hn = (id: string) => data.value?.holders.find((h) => h.id === id)?.name ?? '—'
const cn = (id: string) => data.value?.classes.find((c) => c.id === id)?.name ?? '—'
const toCrm = ref(false)
// After an import, offer to bring the investors into Fundraising and Contacts.
async function afterImport(id: string) { ct.value = id; await refresh(); await refreshDocs(); tab.value = 'overview'; if (data.value?.holders.some((h) => h.kind === 'investor')) toCrm.value = true }
const KIND: Record<string, string> = { founder: 'Founder', employee: 'Employee', advisor: 'Advisor', investor: 'Investor', other: 'Other' }
const mix = computed(() => { if (!t.value) return []; const m: Record<string, number> = {}; for (const r of t.value.rows) m[KIND[r.holder.kind] ?? 'Other'] = (m[KIND[r.holder.kind] ?? 'Other'] ?? 0) + r.fd; if (t.value.pool) m['Option pool (available)'] = t.value.pool; return Object.entries(m).map(([label, value]) => ({ label, value })) })
// One form for every record type.
type Ty = 'class' | 'holder' | 'issuance' | 'plan' | 'grant' | 'convertible'
const f = reactive<{ open: boolean; type: Ty; id: string; d: Record<string, any> }>({ open: false, type: 'issuance', id: '', d: {} }), msg = ref(''), busy = ref(false)
const BLANK: Record<Ty, () => Record<string, any>> = {
  class: () => ({ name: '', kind: 'preferred', liq_pref: 1, participating: false, seniority: 1, issue_price: '' }),
  holder: () => ({ name: '', email: '', kind: 'investor' }),
  issuance: () => ({ holder_id: '', holder_name: '', holder_kind: 'founder', class_id: data.value?.classes[0]?.id ?? '', shares: '', price: '', issued_on: today, certificate: '', notes: '' }),
  plan: () => ({ name: 'Equity incentive plan', reserved: '' }),
  grant: () => ({ plan_id: data.value?.plans[0]?.id ?? '', holder_id: '', holder_name: '', holder_kind: 'employee', kind: 'option', shares: '', strike: '', granted_on: today, vest_start: today, vest_months: 48, cliff_months: 12, exercised: 0, cancelled_on: '' }),
  convertible: () => ({ holder_id: '', holder_name: '', holder_kind: 'investor', kind: 'safe', amount: '', currency: 'USD', valuation_cap: '', discount_pct: '', post_money: true, mfn: false, interest_pct: '', issued_on: today, maturity_on: '', status: 'outstanding' }) }
// Add to data room from the Actions menu (the PDF of this cap table goes into the data room's cap table folder).
const roomMsg = ref('')
async function addRoom() { roomMsg.value = 'Adding to the data room…'; try { const r = await $fetch<{ folder: string }>('/api/fundraising/files/generated', { method: 'POST', body: { kind: 'captable', id: data.value?.captable, format: 'pdf' } }); roomMsg.value = 'Added to the ' + r.folder + ' folder of the data room.' } catch { roomMsg.value = 'Could not add it to the data room. Try again.' } }
const TITLE: Record<Ty, string> = { class: 'Share class', holder: 'Holder', issuance: 'Issue shares', plan: 'Option plan', grant: 'Grant options', convertible: 'SAFE or note' }
function edit(type: Ty, row?: Record<string, any>) { f.type = type; f.id = row?.id ?? ''; f.d = { ...BLANK[type](), ...(row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])) : {}) }; msg.value = ''; f.open = true }
async function save(del = false) {
  if (del && !await askConfirm('Delete this record?')) return
  busy.value = true; msg.value = ''
  try { await $fetch('/api/equity', { method: 'POST', body: del ? { type: f.type, id: f.id, delete: true, ct: ct.value || data.value?.captable } : { type: f.type, id: f.id || undefined, data: f.d, ct: ct.value || data.value?.captable } }); f.open = false; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const imp = ref(false), pre = ref<File[]>([]), impFrom = ref<'pulley' | 'carta' | 'files'>('files')
// E-signing: documents out for signature, board consents, certificates.
const { data: es, refresh: refreshEs } = await useFetch<{ me: { name: string; email: string }; docs: import('~/components/EquityDocs.vue').EDoc[] }>('/api/equity/esign', { query: { ct }, default: () => ({ me: { name: '', email: '' }, docs: [] }) })
const consents = computed(() => (es.value?.docs ?? []).filter((d) => d.kind === 'consent' && d.status !== 'void').map((d) => ({ id: d.id, title: d.title, status: d.status })))
const awaiting = computed(() => (es.value?.docs ?? []).filter((d) => (d.kind === 'grant' || d.kind === 'purchase') && d.status !== 'void' && !d.consent_id && !d.consent_outside && !d.applied_id).map((d) => ({ id: d.id, title: d.title })))
const sg = reactive<{ open: boolean; type: 'convertible' | 'grant' | 'issuance'; seed: Record<string, any> }>({ open: false, type: 'convertible', seed: {} })
const cs = reactive({ open: false, pre: [] as string[] })
const signOk = ref<{ text: string; link: string | null } | null>(null)
function startSign(type: 'convertible' | 'grant' | 'issuance', seed?: Record<string, any>) { sg.type = type; sg.seed = seed ?? { ...BLANK[type === 'convertible' ? 'convertible' : type === 'grant' ? 'grant' : 'issuance']() }; f.open = false; sg.open = true }
async function signSent(v: { id: string; my_link: string | null; consent: string }) {
  sg.open = false; tab.value = 'signing'; await refreshEs()
  signOk.value = { text: 'Sent for signature.' + (v.consent === 'new' ? ' Next, the board consent that approves it.' : ''), link: v.my_link }
  if (v.consent === 'new') { cs.pre = [v.id]; cs.open = true }
}
async function consentSent(v: { id: string; my_link: string | null }) { cs.open = false; tab.value = 'signing'; await refreshEs(); signOk.value = { text: 'Board consent sent to the directors.', link: v.my_link } }
async function esChanged() { await Promise.all([refreshEs(), refresh()]) }
const certBusy = ref('')
async function certs(ids?: string[]) { certBusy.value = ids?.[0] ?? 'all'; msg.value = ''; try { await $fetch('/api/equity/certificates', { method: 'POST', body: { ct: ct.value || data.value?.captable, ids } }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not issue certificates.' } finally { certBusy.value = '' } }
// Documents attached to holders (SAFEs, notes, share purchase agreements, certificates).
interface HD { id: string; holder_id: string; convertible_id: string | null; issuance_id: string | null; document_id: string; kind: string; round: string | null; in_room: boolean; title: string }
const { data: hdocs, refresh: refreshDocs } = await useFetch<HD[]>('/api/equity/docs', { query: { ct }, default: () => [] })
const att = reactive({ open: false, preset: {} as { holder_id?: string; convertible_id?: string; issuance_id?: string } })
function attach(preset: typeof att.preset = {}) { att.preset = preset; att.open = true }
const { data: rights, refresh: refreshRights } = await useFetch<Right[]>('/api/equity/rights', { query: { ct }, default: () => [] })
// Flags on the overview: several rounds, power positions.
const pos = computed(() => (data.value ? positions(data.value, today, rights.value ?? [], hdocs.value ?? []) : null))
const flagsOf = (hid: string) => pos.value?.rows.find((r) => r.holder.id === hid)
const docsFor = (k: 'holder_id' | 'convertible_id' | 'issuance_id', id: string) => (hdocs.value ?? []).filter((d) => d[k] === id)
async function detach(d: HD) { if (!await askConfirm('Detach "' + d.title + '"? It stays in Documents.')) return; await $fetch('/api/equity/docs/' + d.id, { method: 'DELETE' }).catch(() => {}); await refreshDocs() }
// Documents on a SAFE / note or a share issuance, managed from its Edit window: upload, replace or remove.
const dk = computed(() => (f.type === 'convertible' ? 'convertible_id' : f.type === 'issuance' ? 'issuance_id' : null) as 'convertible_id' | 'issuance_id' | null)
const fDocs = computed(() => (dk.value && f.id ? docsFor(dk.value, f.id) : []))
const dup = ref(false)
async function upDoc(ev: Event, replace?: HD) {
  const file = (ev.target as HTMLInputElement).files?.[0]; (ev.target as HTMLInputElement).value = ''; if (!file || !dk.value || !f.id) return
  dup.value = true; msg.value = ''
  try {
    const fd = new FormData(); fd.append('ct', String(data.value?.captable ?? '')); fd.append('holder_id', f.d.holder_id); fd.append(dk.value, f.id)
    fd.append('kind', f.type === 'convertible' ? (f.d.kind === 'note' ? 'note' : 'safe') : 'spa'); fd.append('room', replace ? (replace.in_room ? '1' : '0') : '1'); fd.append('file', file)
    await $fetch('/api/equity/docs', { method: 'POST', body: fd })
    if (replace) await $fetch('/api/equity/docs/' + replace.id, { method: 'DELETE' })
    await refreshDocs()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload the document.' } finally { dup.value = false }
}
async function openDoc(id: string) { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') }
// Signed documents reach the cap table on their own; check now and then while some are out.
let esTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { esTimer = setInterval(() => { if ((es.value?.docs ?? []).some((d) => d.status === 'sent')) esChanged() }, 30000) })
onBeforeUnmount(() => clearInterval(esTimer))
async function importSafes() { busy.value = true; try { await $fetch('/api/equity/import-safes', { method: 'POST', body: { ids: data.value!.safes.map((s) => s.id), ct: ct.value || data.value?.captable } }); await refresh() } finally { busy.value = false } }
async function setupCommon() { await $fetch('/api/equity', { method: 'POST', body: { type: 'class', ct: ct.value || data.value?.captable, data: { name: 'Common', kind: 'common', liq_pref: 0, seniority: 0 } } }); await refresh() }
// Round and exit models.
const rd = reactive({ pre_money: 8000000, new_money: 2000000, pool_target_pct: 10, investor: 'New investors', on: today })
// Rows of the round model in the founder's order (founders and common holders first by default); drag to reorder.
const savedOrder = ref<string[]>([])
watch(() => curCt.value, (c) => { savedOrder.value = ((c as unknown as { row_order?: string[] })?.row_order ?? []).slice() }, { immediate: true })
const ovRows = computed(() => (t.value && data.value ? orderRows(t.value.rows.map((r) => ({ ...r, key: r.holder.name, name: r.holder.name, kind: r.holder.kind, size: r.fd })), savedOrder.value, commonHolders(data.value)) : []))
// Pro forma for the data room: every position in shares, % and value at today's price per share, as converted,
// and what each holder would receive in a sale today.
const pf = reactive({ open: false, price: '' as string | number, note: '', busy: false, msg: '', done: '' })
const cp = computed(() => (data.value ? currentPrice(data.value) : { price: null, source: '' }))
function openPf() { Object.assign(pf, { open: true, price: cp.value.price ?? '', note: cp.value.price ? '' : '', busy: false, msg: '', done: '' }) }
const pfVal = computed(() => { const p = Number(pf.price) || 0; return p && t.value ? { fd: t.value.fd * p } : null })
async function savePf() {
  pf.busy = true; pf.msg = ''
  try { const r = await $fetch<{ title: string; folder: string }>('/api/fundraising/files/generated', { method: 'POST', body: { kind: 'proforma', id: data.value!.captable, price: Number(pf.price) || undefined, price_note: Number(pf.price) !== cp.value.price ? (pf.note || 'set by the company') : undefined } }); pf.done = r.title + ' is in the data room, in ' + r.folder + '.' }
  catch (e) { pf.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add it.' } finally { pf.busy = false }
}
const rkey = (r: { name: string; kind: string }) => (r.kind === 'new' ? '__new' : r.kind === 'pool' ? '__pool' : r.name)
const rrRows = computed(() => (rr.value && data.value ? orderRows(rr.value.rows.map((r) => ({ ...r, key: rkey(r), size: r.after })), savedOrder.value, commonHolders(data.value)) : []))
const dragK = ref(''), overK = ref('')
async function dropRow(target: string) {
  const keys = rrRows.value.map((r) => r.key), from = keys.indexOf(dragK.value), to = keys.indexOf(target)
  dragK.value = ''; overK.value = ''
  if (from < 0 || to < 0 || from === to) return
  keys.splice(to, 0, keys.splice(from, 1)[0]!); savedOrder.value = keys
  await $fetch('/api/equity/order', { method: 'POST', body: { ct: data.value?.captable, order: keys } }).catch(() => {})
}
function moveRow(k: string, by: number) { const keys = rrRows.value.map((r) => r.key), i = keys.indexOf(k), j = i + by; if (i < 0 || j < 0 || j >= keys.length) return; dragK.value = k; void dropRow(keys[j]!) }
async function resetOrder() { savedOrder.value = []; await $fetch('/api/equity/order', { method: 'POST', body: { ct: data.value?.captable, order: [] } }).catch(() => {}) }
const rr = computed(() => (data.value && t.value?.fd ? round(data.value, { ...rd, pre_money: Number(rd.pre_money) || 0, new_money: Number(rd.new_money) || 0, pool_target_pct: Number(rd.pool_target_pct) || 0 }, today) : null))
const plansAvail = (pid: string) => { const p = data.value?.plans.find((x) => x.id === pid); return p ? p.reserved - (data.value?.grants.filter((g) => g.plan_id === pid).reduce((s, g) => s + liveShares(g, today), 0) ?? 0) : 0 }

// ── Tab layouts: doughnuts in Finvry's blues, share bars and plain-words notes ──
const KCOL: Record<string, string> = { Founder: '#0c1a2e', Investor: '#8fb3d6', Advisor: '#3d6e99', Employee: '#1c547d', Other: '#a8b4c2', 'Option pool (available)': '#e3e1dc' }
const mixParts = computed(() => { const tot = (mix.value as { label: string; value: number }[]).reduce((a, x) => a + x.value, 0) || 1; return (mix.value as { label: string; value: number }[]).filter((x) => x.value > 0).map((x) => ({ label: x.label, value: x.value, color: KCOL[x.label] ?? '#a8b4c2', note: Math.round(x.value / tot * 100) + '% · ' + briefNum(x.value) })) })
const briefNum = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : n(v))
const founderFd = computed(() => (t.value?.rows ?? []).filter((r) => r.holder.kind === 'founder').reduce((a, r) => a + r.pctFd, 0))
const convParts = computed(() => { if (!pos.value) return []; const f = pos.value.founders.pctConverted ?? pos.value.founders.pctFd, i = pos.value.investors.pctConverted ?? pos.value.investors.pctFd; return [{ label: 'Founders', value: f, color: '#0c1a2e', note: f.toFixed(1) + '%' }, { label: 'Investors', value: i, color: '#8fb3d6', note: i.toFixed(1) + '%' }, { label: 'Others', value: Math.max(0, 100 - f - i), color: '#e3e1dc', note: Math.max(0, 100 - f - i).toFixed(1) + '%' }] })
const kindColor = (k: string) => KCOL[KIND[k] ?? 'Other'] ?? '#a8b4c2'
// Shareholders: certificates issued so far.
const certCount = computed(() => (data.value?.issuances ?? []).filter((i) => (i as any).certificate_doc_id).length)
// A document dropped onto a row: attached to that holder's issuance or SAFE.
const rowDrop = ref('')
async function dropDoc(ev: DragEvent, holder: string, key: 'issuance_id' | 'convertible_id', id: string, kind: string) {
  const file = ev.dataTransfer?.files?.[0]; if (!file) return
  rowDrop.value = id
  try { const fd = new FormData(); fd.append('ct', String(data.value?.captable ?? '')); fd.append('holder_id', holder); fd.append(key, id); fd.append('kind', kind); fd.append('room', '1'); fd.append('file', file); await $fetch('/api/equity/docs', { method: 'POST', body: fd }); await refreshDocs() }
  catch (e) { notify((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not attach the document.') } finally { rowDrop.value = '' }
}
// Options: the pool.
const poolInfo = computed(() => { const res = t.value?.reserved ?? 0, gr = t.value?.allocated ?? 0; return { res, gr, left: Math.max(0, res - gr), pctUsed: res ? Math.min(100, gr / res * 100) : 0 } })
// SAFEs and notes: by cap, documents attached, and only the missing ones when asked.
const liveConv = computed(() => (data.value?.convertibles ?? []).filter((c) => c.status === 'outstanding'))
const capBuckets = computed(() => {
  const b = [{ label: 'Under $1M', lo: 0, hi: 1e6 }, { label: '$1M – $5M', lo: 1e6, hi: 5e6 }, { label: '$5M – $10M', lo: 5e6, hi: 1e7 }, { label: '$10M and up', lo: 1e7, hi: Infinity }, { label: 'No cap', lo: -1, hi: -1 }]
  const rows = b.map((x) => ({ label: x.label, amount: liveConv.value.filter((c) => (x.lo < 0 ? !c.valuation_cap : c.valuation_cap != null && c.valuation_cap >= x.lo && c.valuation_cap < x.hi)).reduce((a, c) => a + c.amount, 0) })).filter((x) => x.amount > 0)
  const max = Math.max(1, ...rows.map((x) => x.amount)); return rows.map((x) => ({ ...x, w: x.amount / max * 100 }))
})
const convWithDoc = computed(() => (data.value?.convertibles ?? []).filter((c) => docsFor('convertible_id', c.id).length).length)
const onlyMissing = ref(false)
const convShown = computed(() => (data.value?.convertibles ?? []).filter((c) => !onlyMissing.value || !docsFor('convertible_id', c.id).length))
function dropSafes(e: Event) { pre.value = Array.from(((e.target as HTMLInputElement).files ?? []) as ArrayLike<File>); impFrom.value = 'files'; imp.value = true }
// Model a round: who owns what before and after, by kind.
const RCOL: Record<string, string> = { founder: '#0c1a2e', investor: '#8fb3d6', advisor: '#3d6e99', employee: '#1c547d', other: '#a8b4c2', pool: '#e3e1dc', new: '#1c547d' }
const RLAB: Record<string, string> = { founder: 'Founders', investor: 'Investors and converted SAFEs', advisor: 'Advisors', employee: 'Team', other: 'Others', pool: 'Option pool', new: 'New investors' }
const rrMix = computed(() => {
  if (!rr.value) return null
  const agg = (k: 'before_pct' | 'after_pct') => { const m: Record<string, number> = {}; for (const r of rr.value!.rows) { const kk = r.kind === 'new' ? 'new' : r.kind; m[kk] = (m[kk] ?? 0) + (r as any)[k] } return Object.entries(m).filter(([, v]) => v > 0.05).map(([k, v]) => ({ k, v, color: k === 'new' ? '#0c1a2e' : RCOL[k] ?? '#a8b4c2', label: RLAB[k] ?? k })) }
  const before = agg('before_pct'), after = agg('after_pct')
  const fb = before.find((x) => x.k === 'founder')?.v ?? 0, fa = after.find((x) => x.k === 'founder')?.v ?? 0
  const newPct = after.find((x) => x.k === 'new')?.v ?? 0, invUp = (after.find((x) => x.k === 'investor')?.v ?? 0) - (before.find((x) => x.k === 'investor')?.v ?? 0)
  const why = fb - fa > 1 ? (invUp > newPct ? 'the SAFEs and notes converting take more of it than the new money does' : 'the new money and the pool top-up take most of it') : ''
  return { before, after: after.map((x) => (x.k === 'new' ? { ...x, color: '#1c547d' } : x)), fb, fa, why }
})
const maxDrop = computed(() => Math.max(1, ...rrRows.value.map((r) => Math.abs(r.after_pct - r.before_pct))))
</script>
<template>
  <section v-if="data && t" class="ct">
    <InvestorTabs />
    <div class="hd"><div><h1>Cap table</h1><p class="lead">Shares, options, SAFEs and notes for {{ data.company }}.</p></div>
      <div class="acts"><button class="btn secondary" @click="shareOpen = true">Share</button>
        <MoreMenu label="Actions"><p>Add</p><button @click="edit('convertible')">Add a SAFE or note</button><button :disabled="!data.plans.length" @click="edit('grant')">Grant options</button><button @click="impFrom = 'files'; imp = true">Import from Pulley, Carta or files</button>
          <hr><p>This cap table</p><button @click="ctForm('copy')">Copy as a what-if</button><button @click="ctForm('create')">New cap table</button><button @click="ctForm('rename')">Rename</button><button v-if="data.captables.length > 1 && !curCt?.is_main" @click="ctAct('main')">Make it the main one</button>
          <template v-if="hasRoom"><hr><p>Investors</p><button @click="addRoom">Add to data room</button><button @click="openPf">Pro forma for investors</button></template>
          <template v-if="data.captables.length > 1"><hr><button class="red" @click="ctAct('delete')">Delete this cap table</button></template></MoreMenu>
        <button class="btn" :disabled="!data.classes.length" @click="edit('issuance')">Issue shares</button></div></div>
    <p v-if="roomMsg" class="ctn">{{ roomMsg }} <NuxtLink v-if="roomMsg.startsWith('Added')" to="/fundraising?t=room">Open the data room →</NuxtLink></p>
    <div v-if="!data.classes.length" class="start card"><h3>Set up your cap table</h3><p>Drop in exports or documents and AI builds it, or start by hand.</p><div class="mvb"><button class="btn secondary" @click="impFrom = 'pulley'; imp = true">Import from Pulley</button><button class="btn secondary" @click="impFrom = 'carta'; imp = true">Import from Carta</button></div><DropZone multiple accept=".pdf,.xlsx,.xlsm,.csv,.docx,.txt" label="Drop your cap table documents here" hint="Spreadsheets, SAFEs, notes, certificates · read with AI" @change="(e: Event) => { pre = Array.from(((e.target as HTMLInputElement).files ?? []) as ArrayLike<File>); impFrom = 'files'; imp = true }" /><button class="btn" @click="setupCommon">Create common shares</button></div>
    <nav v-if="data.captables.length > 1" class="cts"><button v-for="c in data.captables" :key="c.id" :class="{ on: c.id === data.captable }" @click="ct = c.id">{{ c.name }}<span v-if="c.is_main" class="mn">Main</span></button></nav>
    <p v-if="curCt?.note" class="ctn">{{ curCt.note }}</p>
    <nav class="tabs"><button v-for="[k, l] in TABS" :key="k" :class="{ on: tab === k }" @click="tab = k">{{ l }}</button></nav>

    <template v-if="tab === 'overview'">
      <div class="kt4"><div class="kti"><span>Fully diluted shares</span><b>{{ n(t.fd) }}</b><em>Issued, options and the open pool</em></div><div class="kti"><span>Shares issued</span><b>{{ n(t.issued) }}</b><em>{{ t.rows.length }} holders · {{ data.classes.length }} {{ data.classes.length === 1 ? 'class' : 'classes' }}</em></div>
        <div class="kti" :class="{ warn: t.reserved && !t.pool }"><span>Option pool left</span><b>{{ n(t.pool) }}</b><em>{{ n(t.reserved) }} reserved · {{ n(t.allocated) }} granted<template v-if="t.reserved && !t.pool"> · <button class="lk" @click="tab = 'round'">top up</button></template></em></div>
        <div class="kti"><span>SAFEs and notes</span><b>{{ briefMoney(t.convertibleTotal, 'USD') }}</b><em>{{ t.convertibles.length }} outstanding · convert next round</em></div></div>
      <div class="two eq"><div class="card ck"><div class="ckh"><b>Ownership today</b><span>Fully diluted</span></div><RingChart :parts="mixParts" :center="Math.round(founderFd) + '%'" sub="founders" />
          <p class="ex">{{ t.convertibles.length ? 'SAFEs and notes aren\'t shares yet, so they don\'t show here.' : 'Everyone who holds shares or options today.' }}</p></div>
        <div v-if="t.convertibles.length && pos" class="card ck"><div class="ckh"><b>Once the SAFEs convert</b><span>{{ pos.converted ? 'At their caps' : 'Capped ones only' }}</span></div><RingChart :parts="convParts" :center="(convParts[0]?.value ?? 0).toFixed(1) + '%'" sub="founders" />
          <p class="ex note0">{{ (convParts[0]?.value ?? 0) < 50 ? 'After conversion founders hold under half.' : 'Founders keep a majority after conversion.' }} <button class="lk" @click="tab = 'rights'">See rights &amp; positions →</button></p></div>
        <div v-else class="card ck"><div class="ckh"><b>What's next</b></div><p class="ex">No SAFEs or notes outstanding. Model your next priced round to see the dilution.</p><button class="btn secondary sm al" @click="tab = 'round'">Model a round</button></div></div>
      <div class="card pad0"><div class="ch"><h3>Holders</h3><span class="mut">Bars show each holder's share, fully diluted</span></div>
        <div class="tw"><table class="t" data-nosearch><thead><tr><th>Holder</th><th v-for="c in data.classes" :key="c.id" class="r">{{ c.name }}</th><th class="r">Options</th><th class="shc">Share</th><th class="r">% FD</th><th class="r">% issued</th></tr></thead>
        <tbody><tr v-for="r in ovRows" :key="r.holder.id"><td><b>{{ r.holder.name }}</b><span class="sub">{{ KIND[r.holder.kind] }}</span><span v-if="flagsOf(r.holder.id)?.rounds.length! > 1 && r.holder.kind !== 'founder'" class="pf mr" :title="flagsOf(r.holder.id)!.rounds.join(', ')">{{ flagsOf(r.holder.id)!.rounds.length }} rounds</span><button v-if="flagsOf(r.holder.id)?.power" class="pf pw" :title="flagsOf(r.holder.id)!.flags.map((f) => f.text).join(' · ')" @click="tab = 'rights'">Power position</button></td><td v-for="c in data.classes" :key="c.id" class="r">{{ r.byClass[c.id] ? n(r.byClass[c.id]!) : '—' }}</td><td class="r">{{ r.options ? n(r.options) : '—' }}</td><td class="shc"><i class="shb"><i :style="{ width: Math.min(100, r.pctFd) + '%', background: kindColor(r.holder.kind) }" /></i></td><td class="r b">{{ pct(r.pctFd) }}</td><td class="r">{{ pct(r.pctIssued) }}</td></tr>
          <tr v-if="t.pool" class="mut"><td>Option pool (available)</td><td v-for="c in data.classes" :key="c.id" /><td class="r">{{ n(t.pool) }}</td><td class="shc"><i class="shb"><i :style="{ width: (t.pool / t.fd * 100) + '%', background: '#c9d6e5' }" /></i></td><td class="r">{{ pct(t.pool / t.fd * 100) }}</td><td /></tr>
          <tr class="tot"><td>Total</td><td v-for="c in data.classes" :key="c.id" class="r">{{ n(data.issuances.filter((i) => i.class_id === c.id).reduce((s, i) => s + i.shares, 0)) }}</td><td class="r">{{ n(t.granted + t.pool) }}</td><td /><td class="r">100%</td><td class="r">100%</td></tr></tbody></table></div>
        <EmptyState v-if="!t.rows.length" compact icon="equity" title="No shares issued yet" /></div>
      <p v-if="pos?.warnings.length" class="note wrn">{{ pos.warnings[0] }} <button class="lk" @click="tab = 'rights'">See positions and rights</button></p>
    </template>

    <template v-else-if="tab === 'shares'">
      <section v-if="data.issuances.length" class="hero2"><div class="hx"><b>{{ certCount }} of {{ data.issuances.length }} issuances have a certificate</b><i class="pg"><i :style="{ width: Math.max(2, certCount / data.issuances.length * 100) + '%' }" /></i><span>Issue electronic certificates in one go, or send the share documents for signature. Each holder gets theirs by email.</span></div>
        <div class="hb"><button class="btn secondary" :disabled="!data.classes.length" @click="startSign('issuance', { class_id: data.classes[0]?.id, shares: '', price: '', issued_on: today })">Send to sign</button><button v-if="certCount < data.issuances.length" class="btn" :disabled="!!certBusy" @click="certs()">{{ certBusy === 'all' ? 'Issuing…' : 'Issue all certificates' }}</button></div></section>
      <div class="card pad0"><div class="ch"><h3>Share issuances</h3><button class="btn sm" :disabled="!data.classes.length" @click="edit('issuance')">Issue shares</button></div>
        <div class="tw"><table class="t" data-nosearch><thead><tr><th>Date</th><th>Holder</th><th>Class</th><th class="r">Shares</th><th class="r">Price</th><th class="r">Paid</th><th>Paperwork</th><th /></tr></thead>
          <tbody><tr v-for="i in data.issuances" :key="i.id" :class="{ dov: rowDrop === i.id }" title="Drop a share purchase agreement or certificate here to attach it" @dragover.prevent @drop.prevent="dropDoc($event, i.holder_id, 'issuance_id', i.id, 'spa')"><td class="mut">{{ i.issued_on }}</td><td><b>{{ hn(i.holder_id) }}</b></td><td>{{ cn(i.class_id) }}</td><td class="r">{{ n(i.shares) }}</td><td class="r">{{ usd(i.price) }}</td><td class="r">{{ i.price ? usd(i.price * i.shares) : '—' }}</td>
            <td><span class="pw2"><button v-if="(i as any).certificate_doc_id" class="cp ok" @click="openDoc((i as any).certificate_doc_id)">Certificate {{ (i as any).certificate || '' }}</button><button v-else class="cp warn" :disabled="!!certBusy" :title="'Issue the certificate'" @click="certs([i.id])">{{ certBusy === i.id ? 'Issuing…' : 'No certificate · issue' }}</button><span v-if="(i as any).esign_doc_id" class="cp ok">Signed in Finvry</span><button v-for="d in docsFor('issuance_id', i.id)" :key="d.id" class="cp ok" :title="d.title" @click="openDoc(d.document_id)">{{ d.kind === 'spa' ? 'SPA' : d.kind === 'certificate' ? 'Certificate' : 'Document' }}</button><span v-if="!docsFor('issuance_id', i.id).length && !(i as any).esign_doc_id" class="cp">No document</span></span></td>
            <td class="r nw"><button class="lk" @click="attach({ holder_id: i.holder_id, issuance_id: i.id })">Attach</button> <button class="lk" @click="edit('issuance', i)">Edit</button></td></tr></tbody></table></div>
        <p v-if="data.issuances.length" class="hint">Drop a share purchase agreement or certificate onto a row to attach it.</p>
        <EmptyState v-if="!data.issuances.length" compact icon="equity" title="No shares issued yet" /></div>
      <div class="two"><div class="card"><div class="ch0"><h3>Share classes</h3><button class="lk" @click="edit('class')">Add a class</button></div>
          <div v-for="c in data.classes" :key="c.id" class="clc"><span class="clh"><b>{{ c.name }}</b><button class="lk" @click="edit('class', c)">Edit</button></span><span class="mut">{{ n(data.issuances.filter((i) => i.class_id === c.id).reduce((s2, i) => s2 + i.shares, 0)) }} shares · {{ c.kind === 'preferred' ? c.liq_pref + '× preference' + (c.participating ? ', participating' : '') + ' · seniority ' + c.seniority : 'no preference · paid last in a sale' }}</span></div>
          <p class="hint0">Preferred classes from a priced round show here with their preference and seniority.</p></div>
        <div class="card"><div class="ch0"><h3>Holders</h3><span class="row"><button v-if="data.holders.length" class="lk" @click="attach()">Attach a document</button><button v-if="data.holders.length" class="lk" @click="toCrm = true">Add to Fundraising</button><button class="lk" @click="edit('holder')">Add a holder</button></span></div>
          <div v-for="h in data.holders" :key="h.id" class="hr"><span class="av">{{ h.name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') }}</span><span class="hn"><b>{{ h.name }}</b><em>{{ KIND[h.kind] }}{{ h.email ? ' · ' + h.email : '' }}</em><span v-if="docsFor('holder_id', h.id).length" class="dch"><span v-for="d in docsFor('holder_id', h.id)" :key="d.id" class="dc"><button class="lk" :title="d.round ? d.round + (d.in_room ? ' · in the data room' : '') : ''" @click="openDoc(d.document_id)">{{ d.title }}</button><button class="x" :aria-label="'Detach ' + d.title" @click="detach(d)">×</button></span></span></span>
            <span class="ha"><span v-if="!h.email" class="wtxt">Add email to sign</span><button class="lk" @click="attach({ holder_id: h.id })">Attach</button><button class="lk" @click="edit('holder', h)">Edit</button></span></div></div></div>
    </template>

    <template v-else-if="tab === 'signing'">
      <p v-if="signOk" class="ok">{{ signOk.text }} <a v-if="signOk.link" :href="signOk.link" target="_blank" rel="noopener">Sign your part now</a></p>
      <div class="kt4"><div class="kti"><span>Waiting for signatures</span><b class="bl">{{ (es?.docs ?? []).filter((d) => d.status === 'sent').length }}</b></div><div class="kti"><span>Signed</span><b>{{ (es?.docs ?? []).filter((d) => d.status === 'signed' || d.status === 'completed').length }}</b></div><div class="kti"><span>Signed, not on the cap table</span><b>{{ (es?.docs ?? []).filter((d) => d.status !== 'sent' && d.status !== 'void' && d.kind !== 'consent' && !d.applied_id).length }}</b></div><div class="kti"><span>Withdrawn</span><b>{{ (es?.docs ?? []).filter((d) => d.status === 'void').length }}</b></div></div>
      <section class="hero2 col"><b class="h2t">Send something to sign</b><div class="so"><button @click="certs()"><b>Share certificates</b><em>For shares already issued</em></button><button @click="startSign('convertible')"><b>A SAFE</b><em>Y Combinator post-money form</em></button><button @click="startSign('grant')"><b>An option grant</b><em>With the vesting schedule</em></button><button @click="startSign('issuance')"><b>A share purchase</b><em>For new shares</em></button><button @click="cs.pre = []; cs.open = true"><b>A board consent</b><em>To approve grants and issues</em></button></div>
        <span class="hint0">Signed copies attach to the holder and the cap table updates by itself.</span></section>
      <EquityDocs :docs="es?.docs ?? []" @changed="esChanged" @consent="(ids: string[]) => { cs.pre = ids; cs.open = true }" @send="(t2: 'convertible' | 'grant' | 'issuance') => startSign(t2)" />
    </template>
    <template v-else-if="tab === 'options'">
      <div class="two"><div class="card ck"><div class="ckh"><b>Option pool</b><button class="lk" @click="edit('plan')">Add a plan</button></div>
          <div class="pl3"><RingChart :parts="[{ label: 'Granted', value: poolInfo.gr, color: '#1c547d', note: n(poolInfo.gr) }, { label: 'Left', value: poolInfo.left, color: '#c9d6e5', note: n(poolInfo.left) }]" :center="Math.round(poolInfo.pctUsed) + '%'" sub="granted" /></div>
          <p v-if="poolInfo.res && !poolInfo.left" class="ex wbox">The pool is used up. New hires need a top-up, usually agreed with your next round. <button class="lk" @click="tab = 'round'">Model it in a round →</button></p>
          <p v-else-if="!poolInfo.res" class="ex">No pool yet. Add a plan to reserve shares for the team.</p>
          <p v-else class="ex">{{ n(poolInfo.left) }} options left to grant out of {{ n(poolInfo.res) }} reserved.</p></div>
        <div class="card ck"><div class="ckh"><b>How options work here</b></div><p class="ex">A grant gives someone the right to buy shares at the strike price. They vest over time, usually 4 years with a 1-year cliff, and count in the fully diluted total from the day they're granted.</p>
          <div class="chs"><span>{{ data.plans.length }} {{ data.plans.length === 1 ? 'plan' : 'plans' }}</span><span>{{ data.grants.length }} {{ data.grants.length === 1 ? 'grant' : 'grants' }}</span><span class="b">{{ n(data.grants.reduce((a2, g) => a2 + vested(g, today), 0)) }} vested</span><span>{{ n(data.grants.reduce((a2, g) => a2 + (g.exercised || 0), 0)) }} exercised</span></div></div></div>
      <div v-if="data.plans.length > 1" class="card pad0"><div class="ch"><h3>Plans</h3></div>
        <table class="t" data-nosearch><thead><tr><th>Plan</th><th class="r">Reserved</th><th class="r">Granted</th><th class="r">Left</th><th /></tr></thead><tbody><tr v-for="p in data.plans" :key="p.id"><td><b>{{ p.name }}</b></td><td class="r">{{ n(p.reserved) }}</td><td class="r">{{ n(p.reserved - plansAvail(p.id)) }}</td><td class="r b">{{ n(plansAvail(p.id)) }}</td><td class="r"><button class="lk" @click="edit('plan', p)">Edit</button></td></tr></tbody></table></div>
      <div class="card"><div class="ch0"><h3>Grants</h3><button class="btn sm" :disabled="!data.plans.length" @click="edit('grant')">Grant options</button></div>
        <article v-for="g in data.grants" :key="g.id" class="gr" :class="{ off: g.cancelled_on }"><span class="av">{{ hn(g.holder_id).replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') }}</span>
          <span class="gn"><b>{{ hn(g.holder_id) }}</b><em>{{ n(g.shares) }} {{ (g as any).kind === 'rsu' ? 'RSUs' : (g as any).kind === 'restricted' ? 'restricted shares' : 'options' }}{{ g.strike ? ' at ' + usd(g.strike) : '' }} · granted {{ g.granted_on }}{{ g.cancelled_on ? ' · left ' + g.cancelled_on : '' }} · {{ data.plans.find((p) => p.id === g.plan_id)?.name ?? '' }}</em></span>
          <span class="gv"><span class="gvh"><span class="mut">Vested</span><b>{{ n(vested(g, today)) }} of {{ n(g.shares) }}</b></span><i class="pg"><i :style="{ width: (g.shares ? vested(g, today) / g.shares * 100 : 0) + '%' }" /></i><span class="mut">{{ g.vest_months ? g.vest_months + ' months, ' + g.cliff_months + '-month cliff, from ' + g.vest_start : 'Fully vested from ' + g.vest_start }}{{ g.exercised ? ' · ' + n(g.exercised) + ' exercised' : '' }}</span></span>
          <button class="lk" @click="edit('grant', g)">Edit</button></article>
        <EmptyState v-if="!data.grants.length" compact icon="equity" title="No grants yet" text="Grant options from a plan to give the team a stake." /></div>
    </template>

    <template v-else-if="tab === 'convertibles'">
      <section class="hero2"><div class="hx"><span class="ey">Read with AI</span><b>Drop signed SAFEs and notes. AI fills in the amount, cap, discount and date.</b><span>Each document is attached to its investor and filed in the data room by round. You check everything before it's saved.</span></div>
        <div class="hb dzw"><DropZone multiple accept=".pdf,.docx" label="Drop SAFEs here" hint="or click to choose · PDF or Word" @change="dropSafes" /></div></section>
      <div v-if="data.safes.length" class="note">{{ data.safes.length }} SAFE{{ data.safes.length === 1 ? '' : 's' }} drafted in Fundraising {{ data.safes.length === 1 ? 'is' : 'are' }} not on the cap table yet ({{ data.safes.map((s2) => s2.investor_name).join(', ') }}). <button class="lk" :disabled="busy" @click="importSafes">Add {{ data.safes.length === 1 ? 'it' : 'them' }}</button></div>
      <div v-if="liveConv.length" class="three"><div class="card ck"><b class="ckt">Raised on SAFEs and notes</b><b class="bigv">{{ briefMoney(t?.convertibleTotal ?? 0, 'USD') }}</b><span class="mut">{{ liveConv.length }} outstanding · {{ liveConv.filter((c) => c.kind === 'safe').length }} SAFEs{{ liveConv.some((c) => c.kind === 'note') ? ', ' + liveConv.filter((c) => c.kind === 'note').length + ' notes' : '' }}</span><p class="ex">They become shares at your next priced round, at their cap or discount.</p></div>
        <div class="card ck"><b class="ckt">By valuation cap</b><div class="cb"><template v-for="x in capBuckets" :key="x.label"><span>{{ x.label }}</span><i class="shb"><i :style="{ width: x.w + '%' }" /></i><b>{{ briefMoney(x.amount, 'USD') }}</b></template></div><p class="ex">Lower caps convert into more shares.</p></div>
        <div class="card ck" :class="{ wcard: convWithDoc < (data.convertibles.length) }"><b class="ckt">Documents</b><span><b class="bigv sm">{{ convWithDoc }}</b> of {{ data.convertibles.length }} have the signed document</span><i class="pg"><i :style="{ width: (data.convertibles.length ? convWithDoc / data.convertibles.length * 100 : 0) + '%' }" /></i>
          <button v-if="convWithDoc < data.convertibles.length" class="lk al" @click="onlyMissing = !onlyMissing">{{ onlyMissing ? 'Show all' : 'Show the ' + (data.convertibles.length - convWithDoc) + ' missing →' }}</button></div></div>
      <div class="card pad0"><div class="ch"><h3>SAFEs and convertible notes</h3><button class="btn sm" @click="edit('convertible')">Add SAFE or note</button></div>
        <div class="tw"><table class="t" data-nosearch><thead><tr><th>Investor</th><th class="r">Amount</th><th class="r">Cap</th><th class="r">Discount</th><th>Date</th><th>Document</th><th /></tr></thead>
          <tbody><tr v-for="c in convShown" :key="c.id" :class="{ mut: c.status !== 'outstanding', dov: rowDrop === c.id }" title="Drop the signed SAFE or note here to attach it" @dragover.prevent @drop.prevent="dropDoc($event, c.holder_id, 'convertible_id', c.id, c.kind === 'note' ? 'note' : 'safe')"><td><b>{{ hn(c.holder_id) }}</b><span class="sub">{{ c.kind === 'safe' ? (c.post_money ? 'Post-money SAFE' : 'Pre-money SAFE') : 'Note' + (c.interest_pct ? ' · ' + c.interest_pct + '%' : '') }}{{ c.mfn ? ' · MFN' : '' }}{{ c.status !== 'outstanding' ? ' · ' + (c.status === 'converted' ? 'Converted' : 'Cancelled') : '' }}</span></td><td class="r">{{ usd(c.amount, c.currency) }}</td><td class="r">{{ c.valuation_cap ? briefMoney(c.valuation_cap, c.currency) : '—' }}</td><td class="r">{{ c.discount_pct ? c.discount_pct + '%' : '—' }}</td><td class="mut">{{ c.issued_on }}</td>
            <td><button v-if="docsFor('convertible_id', c.id).length" class="cp ok" :title="docsFor('convertible_id', c.id).map((d) => d.title).join(', ')" @click="openDoc(docsFor('convertible_id', c.id)[0]!.document_id)">{{ c.kind === 'note' ? 'Note' : 'SAFE' }} · open</button><button v-else class="cp warn" @click="attach({ holder_id: c.holder_id, convertible_id: c.id })">{{ rowDrop === c.id ? 'Uploading…' : 'Missing · drop or attach' }}</button></td>
            <td class="r"><button class="lk" @click="edit('convertible', c)">Edit</button></td></tr></tbody></table></div>
        <EmptyState v-if="!data.convertibles.length" compact icon="equity" title="No SAFEs or notes" text="Drop signed SAFEs above, or add one by hand." /></div>
    </template>

    <template v-else-if="tab === 'rights'">
      <RightsPositions :data="data" :ct="data.captable" :rights="rights ?? []" :docs="hdocs ?? []" @changed="refreshRights(); refreshDocs()" @open="openDoc" />
    </template>
    <template v-else-if="tab === 'round'">
      <section class="rin"><b>Your next round</b><div class="frm4"><label>Pre-money valuation<input v-model.number="rd.pre_money" type="number" min="0" step="100000"></label><label>Raising<input v-model.number="rd.new_money" type="number" min="0" step="50000"></label><label>Option pool after the round (%)<input v-model.number="rd.pool_target_pct" type="number" min="0" max="50" step="0.5"></label><label>Lead investor<input v-model="rd.investor" maxlength="80"></label></div></section>
      <template v-if="rr">
        <div class="kt4"><div class="kti"><span>Price per share</span><b>{{ usd(rr.price) }}</b></div><div class="kti"><span>Post-money</span><b>{{ briefMoney(rr.post_money, 'USD') }}</b></div><div class="kti"><span>New investors get</span><b>{{ n(rr.new_shares) }}</b><em>shares</em></div><div class="kti"><span>Pool top-up</span><b>{{ n(rr.topup) }}</b><em>Comes out of the pre-money</em></div></div>
        <div v-if="rrMix" class="card"><div class="ch0"><h3>Before and after the round</h3></div>
          <div class="ba"><span class="mut">Before</span><span class="stk"><i v-for="x in rrMix.before" :key="x.k" :style="{ width: x.v + '%', background: x.color }" :title="x.label + ': ' + x.v.toFixed(1) + '%'" /></span><span class="mut">After</span><span class="stk"><i v-for="x in rrMix.after" :key="x.k" :style="{ width: x.v + '%', background: x.color }" :title="x.label + ': ' + x.v.toFixed(1) + '%'" /></span></div>
          <div class="lg2"><span v-for="x in rrMix.after" :key="x.k"><i :style="{ background: x.color }" />{{ x.label }} {{ x.v.toFixed(1) }}%</span></div>
          <p v-if="rrMix.why" class="ex wbox">Founders go from <b>{{ rrMix.fb.toFixed(1) }}%</b> to about <b>{{ rrMix.fa.toFixed(1) }}%</b>: {{ rrMix.why }}. Try a higher pre-money{{ rd.pool_target_pct ? ' or a smaller pool' : '' }} to see the difference.</p></div>
        <div class="card pad0"><div class="ch"><h3>Holder by holder</h3><span class="mut">Drag rows to reorder.<button v-if="savedOrder.length" class="lk" @click="resetOrder">Reset order</button></span></div>
          <div class="tw"><table class="t" data-nosearch><thead><tr><th>Holder</th><th class="r">Before (fully diluted)</th><th class="r">% before</th><th class="r">After</th><th class="r">% after</th><th class="shc">Change</th><th class="r" /></tr></thead>
          <tbody><tr v-for="r in rrRows" :key="r.key" :class="{ new: r.kind === 'new', drg: dragK === r.key, ovr: overK === r.key && dragK !== r.key }" draggable="true" @dragstart="dragK = r.key" @dragover.prevent="overK = r.key" @dragleave="overK === r.key && (overK = '')" @drop.prevent="dropRow(r.key)" @dragend="dragK = ''; overK = ''"><td><span class="hrow"><span class="grip" title="Drag to move, or use the arrow keys" tabindex="0" :aria-label="'Move ' + r.name" @keydown.up.prevent="moveRow(r.key, -1)" @keydown.down.prevent="moveRow(r.key, 1)">⋮⋮</span><b>{{ r.name }}</b></span></td><td class="r">{{ r.before ? n(r.before) : '—' }}</td><td class="r">{{ r.before ? pct(r.before_pct) : '—' }}</td><td class="r">{{ n(r.after) }}</td><td class="r b">{{ pct(r.after_pct) }}</td>
            <td class="shc"><i class="shb"><i :style="{ width: Math.abs(r.after_pct - r.before_pct) / maxDrop * 100 + '%', background: r.after_pct < r.before_pct ? '#b54708' : '#1c547d' }" /></i></td><td class="r" :class="{ neg: r.before && r.after_pct < r.before_pct, pos: r.after_pct > r.before_pct }">{{ r.before ? (r.after_pct - r.before_pct > 0 ? '+' : '−') + Math.abs(Math.round((r.after_pct - r.before_pct) * 10) / 10).toFixed(1) + ' pts' : 'new' }}</td></tr></tbody></table></div></div>
        <div v-if="rr.conversions.length" class="card pad0"><div class="ch"><h3>How the SAFEs and notes convert</h3></div><div class="tw"><table class="t" data-nosearch><thead><tr><th>Investor</th><th class="r">Amount (with interest)</th><th>Converts at</th><th class="r">Price</th><th class="r">Shares</th></tr></thead>
          <tbody><tr v-for="c in rr.conversions" :key="c.conv.id"><td>{{ c.holder }}</td><td class="r">{{ usd(c.amount, c.conv.currency) }}</td><td>{{ c.method === 'cap' ? 'Valuation cap' : c.method === 'discount' ? 'Discount' : 'Round price' }}</td><td class="r">{{ usd(c.price) }}</td><td class="r">{{ n(c.shares) }}</td></tr></tbody></table></div></div>
        <p class="fine">An estimate using standard post-money SAFE terms. Your term sheet and SAFEs decide the final numbers.</p>
      </template>
      <EmptyState v-else card icon="equity" title="Add your shares first" text="Issue the founders' shares to model a round." />
    </template>

    <template v-else-if="tab === 'valuation'">
      <ClientOnly><PeerValuation :ct="data.captable" @to-exit="tab = 'exit'" /></ClientOnly>
    </template>

    <template v-else>
      <ClientOnly><ExitPlanner :data="data" :ct="data.captable" :has-shares="!!t?.fd" /></ClientOnly>
      
    </template>

    <AppModal :open="f.open" :title="(f.id ? 'Edit · ' : '') + TITLE[f.type]" wide @close="f.open = false">
      <div class="ef">
        <template v-if="['issuance', 'grant', 'convertible'].includes(f.type)">
          <div class="g3"><label class="label">Holder<select v-model="f.d.holder_id"><option value="">+ New holder</option><option v-for="h in data.holders" :key="h.id" :value="h.id">{{ h.name }}</option></select></label>
            <template v-if="!f.d.holder_id"><label class="label">New holder's name<input v-model="f.d.holder_name" maxlength="200"></label><label class="label">They are a<select v-model="f.d.holder_kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label></template></div></template>
        <template v-if="f.type === 'class'"><div class="g3"><label class="label">Name<input v-model="f.d.name" maxlength="80" placeholder="e.g. Series Seed Preferred"></label><label class="label">Type<select v-model="f.d.kind"><option value="common">Common</option><option value="preferred">Preferred</option></select></label><label class="label">Original issue price<input v-model="f.d.issue_price" type="number" min="0" step="0.0001"></label></div>
          <div v-if="f.d.kind === 'preferred'" class="g3"><label class="label">Liquidation preference (×)<input v-model="f.d.liq_pref" type="number" min="0" step="0.5"></label><label class="label">Seniority (higher is paid first)<input v-model="f.d.seniority" type="number" min="0" max="20"></label><label class="chk"><input v-model="f.d.participating" type="checkbox"> Participating</label></div></template>
        <template v-if="f.type === 'holder'"><div class="g3"><label class="label">Name<input v-model="f.d.name" maxlength="200"></label><label class="label">Email<input v-model="f.d.email" type="email" maxlength="254"></label><label class="label">They are a<select v-model="f.d.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label></div></template>
        <template v-if="f.type === 'issuance'"><div class="g3"><label class="label">Class<select v-model="f.d.class_id"><option v-for="c in data.classes" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><label class="label">Shares<input v-model="f.d.shares" type="number" min="1"></label><label class="label">Price per share<input v-model="f.d.price" type="number" min="0" step="0.0001"></label></div>
          <div class="g3"><label class="label">Issued on<input v-model="f.d.issued_on" type="date"></label><label class="label">Certificate no.<input v-model="f.d.certificate" maxlength="60"></label><label class="label">Notes<input v-model="f.d.notes" maxlength="1000"></label></div></template>
        <template v-if="f.type === 'plan'"><div class="g3"><label class="label">Plan name<input v-model="f.d.name" maxlength="120"></label><label class="label">Shares reserved<input v-model="f.d.reserved" type="number" min="0"></label></div></template>
        <template v-if="f.type === 'grant'"><div class="g3"><label class="label">Plan<select v-model="f.d.plan_id"><option v-for="p in data.plans" :key="p.id" :value="p.id">{{ p.name }} ({{ n(plansAvail(p.id)) }} available)</option></select></label><label class="label">Type<select v-model="f.d.kind"><option value="option">Stock options</option><option value="rsu">RSUs</option><option value="restricted">Restricted stock</option></select></label><label class="label">Shares<input v-model="f.d.shares" type="number" min="1"></label></div>
          <div class="g3"><label class="label">Exercise (strike) price<input v-model="f.d.strike" type="number" min="0" step="0.0001"></label><label class="label">Granted on<input v-model="f.d.granted_on" type="date"></label><label class="label">Vesting starts<input v-model="f.d.vest_start" type="date"></label></div>
          <div class="g3"><label class="label">Vesting (months)<input v-model="f.d.vest_months" type="number" min="0" max="120"></label><label class="label">Cliff (months)<input v-model="f.d.cliff_months" type="number" min="0" max="60"></label><label class="label">Exercised so far<input v-model="f.d.exercised" type="number" min="0"></label></div>
          <div class="g3"><label class="label">Left the company on (stops vesting)<input v-model="f.d.cancelled_on" type="date"></label></div></template>
        <template v-if="f.type === 'convertible'"><div class="g3"><label class="label">Type<select v-model="f.d.kind"><option value="safe">SAFE</option><option value="note">Convertible note</option></select></label><label class="label">Amount<input v-model="f.d.amount" type="number" min="0"></label><label class="label">Currency<select v-model="f.d.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR', 'KES']" :key="c">{{ c }}</option></select></label></div>
          <div class="g3"><label class="label">Valuation cap<input v-model="f.d.valuation_cap" type="number" min="0"></label><label class="label">Discount %<input v-model="f.d.discount_pct" type="number" min="0" max="99"></label><label class="label">Date<input v-model="f.d.issued_on" type="date"></label></div>
          <div class="g3"><label v-if="f.d.kind === 'note'" class="label">Interest % a year<input v-model="f.d.interest_pct" type="number" min="0" max="100"></label><label v-if="f.d.kind === 'note'" class="label">Maturity date<input v-model="f.d.maturity_on" type="date"></label><label class="label">Status<select v-model="f.d.status"><option value="outstanding">Outstanding</option><option value="converted">Converted</option><option value="cancelled">Cancelled</option></select></label></div>
          <div class="tg"><label v-if="f.d.kind === 'safe'" class="chk"><input v-model="f.d.post_money" type="checkbox"> Post-money SAFE</label><label class="chk"><input v-model="f.d.mfn" type="checkbox"> Most favoured nation</label></div></template>
        <div v-if="dk && f.id && f.d.holder_id" class="edocs"><span class="label">Documents</span>
          <div v-for="d in fDocs" :key="d.id" class="lf" title="Drop a file here to replace it" @dragover.prevent @drop.prevent="upDoc({ target: { files: $event.dataTransfer?.files ?? [] } } as unknown as Event, d)"><span class="ln" :title="d.title">{{ d.title }}</span><em v-if="d.in_room" class="mut">In the data room</em><button type="button" class="lk" @click="openDoc(d.document_id)">Open</button><label class="lk">Replace<input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" hidden :disabled="dup" @change="upDoc($event, d)"></label><button type="button" class="lk red" @click="detach(d)">Remove</button></div>
          <DropZone compact accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" :disabled="dup" :label="dup ? 'Uploading…' : fDocs.length ? 'Drop another document here' : 'Drop the ' + (f.type === 'convertible' ? (f.d.kind === 'note' ? 'note' : 'SAFE') : 'share purchase agreement or certificate') + ' here'" hint="or click to choose · PDF, Word or image" @change="upDoc($event)" />
          <span class="mut sm">Drop a file on a document above to replace it. Removing takes it off this {{ f.type === 'convertible' ? 'SAFE' : 'issuance' }} and out of the data room; the file stays in Documents.</span></div>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="f.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Delete</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button v-if="!f.id && ['issuance', 'grant', 'convertible'].includes(f.type)" class="btn secondary" :disabled="busy" title="Draft, sign and update the cap table" @click="startSign(f.type as 'issuance' | 'grant' | 'convertible', { ...f.d })">Send for e-signature</button><button class="btn" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : f.id ? 'Save' : 'Record only' }}</button></template>
    </AppModal>
 <AttachHolderDoc :open="att.open" :ct="data.captable" :holders="data.holders" :convertibles="data.convertibles as any" :issuances="data.issuances as any" :classes="data.classes" :preset="att.preset" @close="att.open = false" @done="refreshDocs()" />
    <CapToCrm :open="toCrm" :ct="data.captable" @close="toCrm = false" />
    <EquitySign :open="sg.open" :ct="data.captable" :type="sg.type" :seed="sg.seed" :holders="data.holders" :consents="consents" :me="es?.me ?? { name: '', email: '' }" @close="sg.open = false" @sent="signSent" />
    <EquityConsent :open="cs.open" :ct="data.captable" :pending="awaiting" :preselect="cs.pre" :me="es?.me ?? { name: '', email: '' }" @close="cs.open = false" @sent="consentSent" />
    <ShareLinks :open="shareOpen" kind="captable" :object-id="data.captable" :title="curCt?.name ?? 'cap table'" @close="shareOpen = false" />
    <AppModal :open="cm.open" :title="cm.mode === 'create' ? 'New cap table' : cm.mode === 'copy' ? 'Copy as a what-if' : 'Rename cap table'" @close="cm.open = false">
      <div class="ef"><p v-if="cm.mode !== 'rename'" class="mut">{{ cm.mode === 'copy' ? 'A full copy of this cap table to try changes on (a new grant, a secondary, a pro forma) without touching the real one.' : 'An empty cap table, for example a pro forma for the next round. You can fill it by hand or import documents into it.' }}</p>
        <label class="label">Name<input v-model="cm.name" maxlength="120"></label><label class="label">Note (optional)<input v-model="cm.note" maxlength="1000" placeholder="e.g. After the seed round closes"></label><p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="cm.open = false">Cancel</button><button class="btn" :disabled="busy || !cm.name" @click="ctAct(cm.mode)">{{ cm.mode === 'rename' ? 'Save' : 'Create' }}</button></template>
    </AppModal>
    <CapImport :open="imp" :initial="pre" :ct="data.captable" :ct-name="curCt?.name ?? ''" :from="impFrom" :has-data="!!(data.issuances.length || data.grants.length || data.convertibles.length)" @close="imp = false; pre = []" @saved="afterImport" />
    <AppModal :open="pf.open" title="Pro forma cap table for investors" @close="pf.open = false">
      <div class="pfm"><p class="mut">A PDF in the data room with every position today, after conversion, and on a sale.</p>
        <label class="label">Price per share (USD)<input v-model="pf.price" type="number" min="0" step="0.0001" :placeholder="cp.price ? String(cp.price) : 'e.g. 1.25'"><span class="mut">{{ cp.price ? 'Suggested: ' + usd(cp.price) + ', from your ' + cp.source + '.' : 'No priced round recorded yet: enter a price (e.g. a 409A or your SAFE cap ÷ fully diluted shares).' }}</span></label>
        <label v-if="cp.price && Number(pf.price) !== cp.price" class="label">Where this price comes from<input v-model="pf.note" maxlength="120" placeholder="e.g. 409A valuation, March 2026"></label>
        <p v-if="pfVal" class="mut">Implied value today: <b>{{ usd(pfVal.fd) }}</b> fully diluted.</p>
        <p v-if="pf.done" class="ok">{{ pf.done }} <NuxtLink to="/fundraising?t=room">Open the data room</NuxtLink></p><p v-if="pf.msg" class="error">{{ pf.msg }}</p></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="pf.open = false">{{ pf.done ? 'Close' : 'Cancel' }}</button><button v-if="!pf.done" class="btn" :disabled="pf.busy || !Number(pf.price)" @click="savePf">{{ pf.busy ? 'Adding…' : 'Add to data room' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.ct { display: flex; flex-direction: column; gap: 16px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 640px; } .acts { display: flex; gap: 8px; flex-wrap: wrap; }
.start > :deep(.dz) { align-self: stretch; } .start { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; } .start h3 { margin: 0; } .start p { margin: 0; color: var(--c-ink-soft); }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; }
.two { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; } .pad0 { padding: 0; overflow-x: auto; }
.ch { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--c-rule); } .ch h3 { margin: 0; font-size: 15px; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 9px 12px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; } .t td { padding: 9px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.t .r { text-align: right; } .t .b { font-weight: 600; } .t tr.tot td { font-weight: 600; background: #fbfaf7; } .t tr.mut td { color: var(--c-muted); } .t tr.new td { background: #f4f6f9; } .t td.neg { color: var(--c-danger); }
.sub { display: block; font-size: 12px; color: var(--c-muted); font-weight: 400; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.note { margin: 0; background: #fff; border: 1px solid var(--c-rule); padding: 10px 14px; font-size: 13.5px; color: var(--c-ink-soft); }
.sp { flex: 1 } .pfm { display: flex; flex-direction: column; gap: 12px } .pfm label.label { display: flex; flex-direction: column; gap: 6px } .pfm input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff }
.ordh { display: flex; gap: 12px; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--c-muted); margin: 0 } .hrow { display: flex; align-items: center } .grip { cursor: grab; color: var(--c-muted); margin-right: 10px; letter-spacing: -2px; user-select: none } tr.drg { opacity: .45 } tr.ovr td { box-shadow: inset 0 2px 0 var(--c-navy) } tr[draggable=true] { cursor: grab }
.note.wrn { background: #fbf3e2; border-color: #efdcb4; color: #6b4a0e } .pf { display: inline-block; margin: 3px 6px 0 0; font: inherit; font-size: 11px; padding: 1px 6px; border: 0; } .pf.mr { background: #e9ecf5; color: #2c3e70 } .pf.pw { background: #fbf0dc; color: #7a5a14; cursor: pointer }
.vb { display: inline-block; width: 46px; height: 5px; background: #e6e9ee; margin-right: 8px; vertical-align: 2px; } .vb i { display: block; height: 100%; background: var(--c-navy); }
.frm4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .frm4 label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .frm4 input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.fine { margin: 0; font-size: 12px; color: var(--c-muted); line-height: 1.5; } .card .fine { margin-top: 10px; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ef input:not([type="checkbox"]), .ef select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .tg { display: flex; gap: 18px; }
@media (max-width: 1000px) { .two, .frm4, .g3 { grid-template-columns: 1fr; } }
.ctb { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 6px 0 2px; } .cts { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; overflow-x: auto; max-width: 100%; width: fit-content; margin: 12px 0 0; } .cts button { background: none; border: 0; padding: 7px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); white-space: nowrap; } .cts button.on { background: #fff; color: var(--c-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); } .cts .add { color: var(--c-blue-deep); } .mn { font-size: 10.5px; font-weight: 500; color: var(--c-muted); margin-left: 6px; text-transform: uppercase; letter-spacing: .04em; }
.cta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; } .cta .lk { font-size: 13px; } .ctn { margin: 4px 0 0; color: var(--c-muted); font-size: 13px; }
.ch .row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; } .ok { color: var(--c-ink-soft); background: var(--c-paper-3); padding: 10px 14px; margin: 0 0 12px; font-size: 13.5px; } .ok a { color: var(--c-blue-deep); }
.mvb { display: flex; gap: 8px; flex-wrap: wrap; }
.dch { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; } .dc { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; } .dc .x { background: none; border: 0; color: var(--c-muted); cursor: pointer; font-size: 14px; padding: 0 2px; }
.edocs { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--c-rule); padding-top: 14px; } .edocs .lf { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fbfaf7; font-size: 14px; } .edocs .ln { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .edocs em { font-style: normal; font-size: 12.5px; } .edocs label.lk { cursor: pointer; } .edocs .up { align-self: flex-start; cursor: pointer; } .edocs .sm { font-size: 12.5px; }
.kt4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; } .kti { border: 1px solid var(--c-rule); background: #fff; padding: 16px; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .kti > span { font-size: 12.5px; color: var(--c-muted); } .kti > b { font-size: 24px; font-weight: 600; color: var(--c-navy); font-variant-numeric: tabular-nums; } .kti > b.bl { color: var(--c-blue-deep); } .kti em { font-style: normal; font-size: 12px; color: var(--c-muted); } .kti.warn { background: #fdf6f1; border-color: #f0d9c8; } .kti.warn > b { color: #b54708; }
.two.eq { align-items: stretch; } .ck { display: flex; flex-direction: column; gap: 12px; } .ckh { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .ckh b, .ckt { font-size: 15px; color: var(--c-navy); } .ckh span { font-size: 12px; color: var(--c-muted); } .ex { margin: 0; font-size: 13px; color: var(--c-ink-soft); } .note0 { background: var(--c-paper-2); padding: 10px 12px; } .wbox { background: #fdf6f1; border: 1px solid #f0d9c8; padding: 10px 12px; } .al { align-self: flex-start; }
.shc { width: 22%; min-width: 120px; } .shb { display: block; height: 8px; background: #f1f0ec; } .shb > i { display: block; height: 100%; background: #1c547d; }
.hero2 { border: 1px solid #c9d6e5; background: #f5f8fb; padding: 20px; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; margin-bottom: 16px; } .hero2.col { flex-direction: column; align-items: stretch; gap: 12px; } .hx { flex: 999 1 380px; display: flex; flex-direction: column; gap: 6px; min-width: 0; } .hx > b, .h2t { font-size: 17px; color: var(--c-navy); } .hx > span { font-size: 13px; color: var(--c-ink-soft); } .hb { flex: 1 1 260px; display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; } .dzw { display: block; } .ey { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--c-blue-deep); }
.pg { display: block; height: 8px; background: #fff; border: 1px solid #c9d6e5; } .pg > i { display: block; height: 100%; background: var(--c-blue-deep); } .ck .pg { background: #f1f0ec; border: 0; }
.pw2 { display: flex; flex-wrap: wrap; gap: 5px; } .cp { white-space: nowrap; border: 0; font: inherit; font-size: 12px; padding: 2px 8px; background: #f1f0ec; color: var(--c-ink-soft); cursor: default; } button.cp { cursor: pointer; } .cp.ok { background: #e6eef6; color: var(--c-navy); } .cp.warn { background: #fbeee6; color: #b54708; } tr.dov td { background: #f5f8fb; }
.hint { margin: 0; padding: 10px 16px; font-size: 12.5px; color: var(--c-muted); } .hint0 { margin: 4px 0 0; font-size: 12.5px; color: var(--c-muted); } .ch0 { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; } .ch0 h3 { margin: 0; font-size: 15px; } .ch0 .row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: flex-end; }
.clc { border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; } .clh { display: flex; justify-content: space-between; }
.hr { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .hr:last-child { border-bottom: 0; } .av { width: 32px; height: 32px; flex: none; background: #e6eef6; color: var(--c-navy); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; } .hn { flex: 1; min-width: 0; display: flex; flex-direction: column; } .hn em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .ha { display: flex; gap: 12px; align-items: center; font-size: 13px; } .wtxt { font-size: 12px; color: #b54708; }
.pl3 { padding: 4px 0; } .chs { display: flex; flex-wrap: wrap; gap: 6px; } .chs span { background: #f1f0ec; padding: 4px 9px; font-size: 12.5px; } .chs span.b { background: #e6eef6; }
.gr { display: grid; grid-template-columns: 32px minmax(0, 1fr) minmax(200px, 280px) 40px; gap: 14px; align-items: center; padding: 14px 0; border-top: 1px solid var(--c-rule); } .gr.off { opacity: .6; } .gn { display: flex; flex-direction: column; min-width: 0; } .gn em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .gv { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .gvh { display: flex; justify-content: space-between; } .gv .pg { background: #f1f0ec; border: 0; }
.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; } .bigv { font-size: 28px; font-weight: 600; color: var(--c-navy); } .bigv.sm { font-size: 22px; } .cb { display: grid; grid-template-columns: 96px minmax(0, 1fr) 60px; gap: 7px 8px; align-items: center; font-size: 12.5px; } .cb b { text-align: right; font-weight: 600; } .cb .shb > i { background: #8fb3d6; } .wcard { background: #fdf6f1; border-color: #f0d9c8; } .wcard .pg > i { background: #b54708; }
.rin { border: 1px solid #c9d6e5; background: #f5f8fb; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; } .rin > b { font-size: 15px; color: var(--c-navy); } .rin .frm4 { padding: 0; border: 0; background: none; margin: 0; } .rin .frm4 input { background: #fff; border-color: #c9d6e5; }
.ba { display: grid; grid-template-columns: 60px minmax(0, 1fr); gap: 10px 14px; align-items: center; font-size: 12.5px; } .stk { display: flex; height: 24px; gap: 2px; } .stk i { display: block; min-width: 2px; } .lg2 { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12.5px; margin: 12px 0; } .lg2 span { display: inline-flex; align-items: center; gap: 6px; } .lg2 i { width: 10px; height: 10px; }
td.pos { color: var(--c-blue-deep); } td.nw { white-space: nowrap; }
.so { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; } .so button { text-align: left; background: #fff; border: 1px solid #c9d6e5; padding: 14px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; } .so button:hover { border-color: var(--c-blue-deep); } .so b { font-size: 14px; } .so em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
@media (max-width: 900px) { .kt4, .so { grid-template-columns: 1fr 1fr; } .three { grid-template-columns: 1fr; } .gr { grid-template-columns: 32px minmax(0, 1fr); } .gv, .gr > .lk { grid-column: 2; } }
</style>
