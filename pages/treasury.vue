<script setup lang="ts">
import type { UpAcc, LiveData } from '~/components/BankAccounts.vue'
// Banking: every bank transaction in one ledger (bank feed and uploaded statements; Fincra later), where the
// money goes by category and vendor, and the cut list — recurring payments ranked by the runway they would give back.
// Read-only: Finvry never holds or moves money.
useHead({ title: 'Banking' })
interface Cat { key: string; label: string }
interface V { key: string; name: string; category: string | null; monthly: number; recurring: boolean; last: string; status: string; remind_on: string | null; note: string | null; runway_gain: number | string | null; saving: number; saving_pct: number | null; suggest: { flag: string; why: string } | null }
interface D { currency: string; months: { month: string; in: number; out: number }[]; last_month: string | null; prev_month: string | null; cash: number | null; burn: number | null; runway: number | null; cash_from?: string | null; cash_month?: string | null; burn_from?: string | null; marked_monthly: number; runway_if_cut: number | string | null
  by_category: { key: string; label: string; last: number; prev: number; avg3: number; budget: number | null }[]; top_vendors: { key: string; name: string; category: string; last: number; prev: number; total: number; recurring: boolean }[]
  movers: { name: string; last: number; prev: number; change: number }[]; recurring_total: number; cut_list: V[]; checks: { id: string; date: string; vendor: string; amount: number; spender: string | null; why: string; count: number }[]; by_spender: { name: string; total: number; monthly: number }[]; duplicates: { job: string; vendors: { name: string; monthly: number }[] }[]; categories: Cat[]
  ledger: { count: number; since: string | null; sources: string[]; ai?: number }; rails: { key: string; label: string; note: string; on: boolean; soon?: boolean }[]; added: number; ng?: boolean }
const route = useRoute(), router = useRouter()
const tab = computed(() => (['spend', 'txns', 'cut', 'reconcile'].includes(String(route.query.t)) ? String(route.query.t) : 'overview'))
const go = (t: string) => router.replace({ query: { ...route.query, t: t === 'overview' ? undefined : t } })
const { sf, cust, isGroup, companies, entityId } = await useCoScope()
const { data, refresh, pending } = await useFetch<D>('/api/treasury', { query: computed(() => ({ cust: cust.value })) })
const d = computed(() => data.value)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, d.value?.currency ?? 'USD'))
const mon = (ym: string | null | undefined) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const msg = ref(''), ok = ref(''), busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function sync() { busy.value = true; msg.value = ''; try { const r = await sf<D>('/api/treasury', { query: { sync: '1' } }); data.value = r; ok.value = r.added ? r.added + ' new transactions from the bank feed.' : 'Up to date.' } catch (e) { msg.value = err(e) } finally { busy.value = false } }
// Upload a statement.
const lk = ref(false)
const up = reactive({ open: false, account: '', currency: 'NGN', entity: '', file: null as File | null, existing: '' })
// Accounts that come in by statement: shown as cards; a newer statement goes to the same account.
const { data: ua, refresh: refreshUa } = await useFetch<{ currency: string; total: number; live_total: number; all_total: number; as_of: string | null; accounts: UpAcc[]; parts?: { label: string; value: number }[] }>('/api/treasury/accounts', { query: computed(() => ({ cust: cust.value })) })
// Live accounts (US banks): loaded in the browser so the page never waits for a bank.
const liveQ = computed(() => (isGroup.value || !entityId.value ? {} : { entity: entityId.value }))
const { data: live, refresh: refreshLiveData } = await useFetch<LiveData & { total: number; currency: string }>('/api/plaid/accounts', { query: liveQ, server: false, key: 'treasury-live' })
async function refreshLive() { try { live.value = await $fetch('/api/plaid/accounts', { query: { ...liveQ.value, refresh: '1' } }); await refreshUa() } catch { /* shown as is */ } }
const upAcc = computed(() => ua.value?.accounts.find((a) => a.key === up.existing) ?? null)
function openUpload(a: UpAcc | null) { up.existing = a?.key ?? ''; up.file = null; up.open = true }
watch(upAcc, (a) => { if (a) { up.account = a.label; up.currency = a.currency; up.entity = a.entity_id && !companies.value.find((c) => c.id === a.entity_id)?.main ? a.entity_id : '' } else if (up.open) up.account = '' })
async function changed() { await Promise.all([refreshUa(), refresh(), refreshLiveData()]) }
// Messages fade after a few seconds and never follow you to another company.
let okT: ReturnType<typeof setTimeout> | undefined
watch(ok, (v) => { clearTimeout(okT); if (v) okT = setTimeout(() => (ok.value = ''), 6000) })
watch(cust, () => { ok.value = ''; msg.value = '' })
// The hero: every account's cash in the view's currency, and the last full month.
const nLive = computed(() => (live.value?.accounts ?? []).filter((a) => !a.debt).length), nUp = computed(() => ua.value?.accounts.length ?? 0)
// Where the cash sits (by company on the group view): a bar in navy and blues.
const PAL = ['#0c1a2e', '#5fa8d3', '#2f6494', '#9fb3c8', '#1c3d63']
const parts = computed(() => ua.value?.parts ?? []), partsTotal = computed(() => parts.value.reduce((t, p) => t + p.value, 0) || 1)
const lastM = computed(() => d.value?.months[d.value.months.length - 1] ?? null)
const big = (v: number | null | undefined) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: d.value?.currency ?? 'USD', maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol' }).format(v))
const day = (x: string | null | undefined) => (x ? new Date(x.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
// Chart: a tidy scale (1, 2, 2.5 or 5 × a power of ten) and the month under the pointer.
const scaleMax = computed(() => { const v = Math.max(1, ...(d.value?.months ?? []).map((x) => Math.max(x.in, x.out))), p = 10 ** Math.floor(Math.log10(v)); return ([1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v)) ?? v })
const hover = ref<string | null>(null)
// Twelve months in a row ending with the last full month, empty months included, so gaps show as gaps.
const series = computed(() => {
  const ms = d.value?.months ?? []; if (!ms.length) return []
  const end = ms.reduce((a, x) => (x.month > a ? x.month : a), ms[0]!.month), by = new Map(ms.map((x) => [x.month, x]))
  return Array.from({ length: 12 }, (_, i) => { const t = new Date(end + '-15T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() - 11 + i); const k = t.toISOString().slice(0, 7); return by.get(k) ?? { month: k, in: 0, out: 0 } })
})
// The statement's currency starts as the company's own (Naira for a Nigerian subsidiary, dollars for a US company).
watch(() => up.open, (o) => { if (o && d.value?.currency && !upAcc.value) up.currency = d.value.currency })
async function upload() {
  if (!up.file) return; busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('file', up.file, up.file.name); fd.append('account', up.account); fd.append('currency', up.currency); if (isGroup.value && up.entity) fd.append('entity_id', up.entity)
  try { const r = await sf<{ read: number; added: number; tie: { ok: boolean; difference: number } | null }>('/api/treasury/upload', { method: 'POST', body: fd }); up.open = false; up.file = null; void refreshUa(); ok.value = r.added + ' of ' + r.read + ' transactions added' + (r.tie ? (r.tie.ok ? '; the statement balances.' : '; the statement is off by ' + r.tie.difference.toLocaleString('en-US') + ' — check it is complete.') : '.'); await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// Transactions.
const f = reactive({ month: '', dir: '' as '' | 'in' | 'out', category: '', q: '', page: 0 })
interface T { id: string; date: string; description: string; vendor: string; vendor_key: string; direction: 'in' | 'out'; amount: number; currency: string; amount_base: number; base_currency: string; category: string | null; category_by: string; account_label: string | null; source: string }
const tx = ref<{ rows: T[]; total: number } | null>(null)
async function loadTx() { tx.value = await sf('/api/treasury/transactions', { query: { month: f.month || undefined, dir: f.dir || undefined, category: f.category || undefined, q: f.q || undefined, page: f.page } }) }
watch(() => [tab.value, f.month, f.dir, f.category, f.page], () => { if (tab.value === 'txns') void loadTx() }, { immediate: true })
let qt: ReturnType<typeof setTimeout> | undefined
watch(() => f.q, () => { clearTimeout(qt); qt = setTimeout(() => { f.page = 0; void loadTx() }, 300) })
const catLabel = (k: string | null) => d.value?.categories.find((c) => c.key === k)?.label ?? k ?? '—'
async function setCat(t: T, category: string, always: boolean) {
  try { const r = await sf<{ updated: number }>('/api/treasury/categorize', { method: 'POST', body: { id: t.id, category, always } }); ok.value = always ? 'Every payment to ' + t.vendor + ' now goes under ' + catLabel(category) + ' (' + r.updated + ' updated).' : 'Saved.'; await loadTx(); void refresh() }
  catch (e) { msg.value = err(e) }
}
const always = ref(true)
// Spend and cut list: filters and pages, in the browser.
const sv = reactive({ q: '', cat: '', page: 0 }), mvPage = ref(0)
const vendorsShown = computed(() => (d.value?.top_vendors ?? []).filter((v) => (!sv.q || v.name.toLowerCase().includes(sv.q.toLowerCase())) && (!sv.cat || v.category === sv.cat)))
const vendorCats = computed(() => [...new Set((d.value?.top_vendors ?? []).map((v) => v.category))].sort())
const cf = reactive({ q: '', cat: '', flag: '', page: 0 })
const cutShown = computed(() => (d.value?.cut_list ?? []).filter((v) => (!cf.q || v.name.toLowerCase().includes(cf.q.toLowerCase())) && (!cf.cat || v.category === cf.cat) && (!cf.flag || v.status === cf.flag)))
const cutCats = computed(() => [...new Set((d.value?.cut_list ?? []).map((v) => v.category).filter((x): x is string => !!x))])
watch(() => [sv.q, sv.cat], () => (sv.page = 0)); watch(() => [cf.q, cf.cat, cf.flag], () => (cf.page = 0))
// AI categories: run for whatever is still on the automatic guess, then refresh as they land.
const aiBusy = ref(false)
async function aiSort() { aiBusy.value = true; try { await sf('/api/treasury/ai-categorize', { method: 'POST' }); ok.value = 'Sorting with AI. Categories update over the next minute.'; setTimeout(() => { void refresh(); if (tab.value === 'txns') void loadTx(); aiBusy.value = false }, 40000) } catch (e) { msg.value = err(e); aiBusy.value = false } }
// Cut list.
// Flags as founders use them in their own cut-list sheets: keep, cut, downgrade (with the share it saves), review,
// personal (off the company card), and cancelled once it is done.
const FLAGS: [string, string][] = [['keep', 'Keep'], ['to_cancel', 'Cut'], ['downgrade', 'Downgrade'], ['review', 'Review'], ['personal', 'Personal'], ['cancelled', 'Cancelled']]
const flagLabel = (k: string) => FLAGS.find((f) => f[0] === k)?.[1] ?? k
async function mark(v: V, status: string, extra: { saving_pct?: number | null; note?: string } = {}) {
  const remind = ['to_cancel', 'downgrade'].includes(status) ? (v.remind_on ?? (() => { const x = new Date(); x.setDate(x.getDate() + 7); return x.toISOString().slice(0, 10) })()) : null
  try { await sf('/api/treasury/vendor', { method: 'POST', body: { vendor_key: v.key, status, remind_on: remind, ...extra } }); ok.value = status === 'to_cancel' ? v.name + ' marked to cut; we will remind you on ' + remind + '.' : status === 'cancelled' ? v.name + ' recorded as cancelled.' : v.name + ': ' + flagLabel(status) + '.'; await refresh() } catch (e) { msg.value = err(e) }
}
// Reconcile: the bank against Financials, month by month.
interface RL { key: string; label: string; bank: number; fin: number | null }
interface RR { month: string; status: string; cash: { bank: number | null; fin: number | null; gap: number | null; accounts: number; of: number }; receipts: { bank: number; fin: number | null; ok: boolean | null }; spend: RL[]; spend_total: { bank: number; fin: number | null; ok: boolean | null }; other: { financing: number; other_in: number; transfers: number }; reconciled: { note: string | null; at: string; by: string | null; gap: number | null } | null }
const rc = ref<{ currency: string; accounts: { name: string; currency: string; balances: number; live: boolean }[]; rows: RR[] } | null>(null), rcOpen = ref(''), rcNote = ref('')
async function loadRc() { try { rc.value = await sf('/api/treasury/reconcile') } catch (e) { msg.value = err(e) } }
watch(() => [tab.value, cust.value], () => { if (tab.value === 'reconcile') void loadRc() }, { immediate: true })
const ST: Record<string, string> = { matches: 'Cash matches', gap: 'Cash differs', partial: 'Some accounts missing', no_balance: 'No bank balance', no_bank: 'No bank data', no_financials: 'No Financials yet' }
const rm = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, rc.value?.currency ?? 'USD'))
async function markRc(r: RR, on: boolean) {
  try { await sf('/api/treasury/reconcile', { method: 'POST', body: { month: r.month, reconciled: on, note: on ? rcNote.value : undefined, gap: r.cash.gap } }); rcNote.value = ''; ok.value = on ? mon(r.month) + ' marked reconciled.' : 'Reconciled mark removed for ' + mon(r.month) + '.'; await loadRc() } catch (e) { msg.value = err(e) }
}
const setPct = (v: V, ev: Event) => { const x = (ev.target as HTMLInputElement).value; void mark(v, v.status === 'keep' ? 'downgrade' : v.status, { saving_pct: x === '' ? null : Math.min(100, Math.max(0, Number(x))) }) }
const setNote = (v: V, ev: Event) => void mark(v, v.status, { note: (ev.target as HTMLInputElement).value.trim() })
const xlsx = computed(() => '/api/treasury/cut-list' + (cust.value ? '?cust=' + encodeURIComponent(cust.value) : ''))
async function budget(c: { key: string; budget: number | null }, ev: Event) { const v = (ev.target as HTMLInputElement).value; try { await sf('/api/treasury/budget', { method: 'POST', body: { category: c.key, monthly: v } }); await refresh() } catch (e) { msg.value = err(e) } }
const pct = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : null)
const maxOut = computed(() => Math.max(1, ...(d.value?.months ?? []).map((x) => Math.max(x.in, x.out))))
const today = new Date().toISOString().slice(0, 10)
</script>
<template>
  <section class="tr">
    <div class="hd"><div><ScopeSwitch page="Banking" /><p class="lead">Every account and payment in one place. Read-only: Finvry never holds or moves your money.</p></div>
      <div class="tb"><button v-if="!d?.ng" class="ic" type="button" :disabled="busy" title="Refresh bank feed" aria-label="Refresh bank feed" @click="sync"><svg :class="{ spin: busy }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button><button class="btn secondary" :disabled="busy" @click="lk = true">Link a sheet</button><button class="btn" :disabled="busy" @click="openUpload(null)">Upload statement</button></div></div>
    <nav class="tabs"><button v-for="[k, l] in ([['overview', 'Overview'], ['spend', 'Spend'], ['txns', 'Transactions'], ['cut', 'Cut list'], ['reconcile', 'Reconcile']] as const)" :key="k" :class="{ on: tab === k }" @click="go(k)">{{ l }}<span v-if="k === 'cut' && d?.cut_list.length" class="n">{{ d.cut_list.length }}</span></button></nav>
    <transition name="toast"><p v-if="ok" class="toast" role="status">{{ ok }}<button type="button" aria-label="Close" @click="ok = ''">×</button></p></transition><p v-if="msg" class="error">{{ msg }}</p>
    <ClientOnly><PendingUpdates kind="bank_txns" what="transactions" @done="refresh()" /></ClientOnly>
    <template v-if="d">

      <template v-if="tab === 'overview'">
        <div v-if="d.ledger.count && d.cash_from !== 'financials' && !isGroup" class="hb">No monthly figures in Financials yet. <NuxtLink :to="'/financials?bank=1' + (entityId ? '&s=entity:' + entityId : '')" class="lk">Start them from your bank →</NuxtLink></div>
        <div class="ov">
          <div class="hero">
            <span class="ht">Cash in the bank</span>
            <b class="hv">{{ ua && (nLive || nUp) ? big(ua.all_total) : '—' }}</b>
            <span class="hs">{{ nLive + nUp ? (nLive + nUp) + ' account' + (nLive + nUp === 1 ? '' : 's') : 'Add an account to see your cash' }}{{ ua?.as_of ? ' · as of ' + day(ua.as_of) : '' }}{{ d.cash !== null ? ' · ' + (d.cash_from === 'financials' ? 'Financials shows ' : 'month-end ') + m(d.cash) : '' }}</span>
            <template v-if="parts.length">
              <div class="bar" role="img" :aria-label="parts.map((p) => p.label + ' ' + m(p.value)).join(', ')"><i v-for="(p, i) in parts" :key="p.label" :style="{ width: Math.max(1.5, p.value / partsTotal * 100) + '%', background: PAL[i % PAL.length] }" :title="p.label + ': ' + m(p.value)" /></div>
              <div class="lgd"><span v-for="(p, i) in parts" :key="p.label"><i :style="{ background: PAL[i % PAL.length] }" />{{ p.label }} <b>{{ m(p.value) }}</b></span></div>
            </template>
          </div>
          <div class="kp">
            <StatTile label="Monthly burn" :value="d.burn === null ? '—' : !d.burn ? 'None' : m(d.burn)" :note="d.burn === null ? 'Add Financials or statements' : !d.burn ? 'Money in covers money out' : d.burn_from === 'bank' ? 'From your bank' : 'As in Financials'" />
            <StatTile label="Runway" :value="d.runway === null ? (d.burn === 0 ? 'Not burning' : '—') : d.runway + ' months'" :note="d.runway === null ? (d.burn === 0 ? 'Cash is not running down' : 'Needs burn and cash') : d.runway_if_cut ? (typeof d.runway_if_cut === 'number' ? d.runway_if_cut + ' months with your cuts' : 'Your cuts end the burn') : 'Before any cuts'" :red="(d.runway ?? 99) < 6" full />
            <StatTile :label="lastM ? 'Net, ' + mon(lastM.month) : 'Net last month'" :value="lastM ? m(lastM.in - lastM.out) : '—'" :note="lastM ? 'In ' + m(lastM.in) + ' · out ' + m(lastM.out) : 'No full month yet'" :red="!!lastM && lastM.in < lastM.out" />
            <StatTile label="Recurring payments" :value="m(d.recurring_total)" note="A month · see the cut list" clickable @click="go('cut')" />
          </div>
        </div>
        <ClientOnly><BankAccounts :live="data?.ng ? null : live ?? null" :uploaded="ua ?? null" :group="isGroup" :ng="!!data?.ng" @upload="openUpload" @sheet="lk = true" @changed="changed" @refresh-live="refreshLive" /></ClientOnly>
        <div class="card chart">
          <div class="ch"><h2>Money in and out</h2><div class="lg"><span><i class="in" />In</span><span><i class="out" />Out</span><span class="mut">Transfers left out · {{ d.currency }}</span></div></div>
          <div v-if="d.months.length" class="plot" @mouseleave="hover = null">
            <div class="ya"><span>{{ m(scaleMax) }}</span><span>{{ m(scaleMax / 2) }}</span><span>0</span></div>
            <div class="area"><div class="grid" aria-hidden="true"><i /><i /><i /></div>
              <div v-for="x in series" :key="x.month" class="col" :class="{ hv: hover === x.month }" @mouseenter="hover = x.month">
                <div class="pair"><i class="in" :style="{ height: Math.max(x.in ? 1 : 0, x.in / scaleMax * 100) + '%' }" /><i class="out" :style="{ height: Math.max(x.out ? 1 : 0, x.out / scaleMax * 100) + '%' }" /></div>
                <span class="xl">{{ mon(x.month).slice(0, 3) }}</span>
                <div v-if="hover === x.month" class="tip"><b>{{ mon(x.month) }}</b><span><i class="in" />In {{ m(x.in) }}</span><span><i class="out" />Out {{ m(x.out) }}</span><span class="tn" :class="{ neg: x.in < x.out }">Net {{ m(x.in - x.out) }}</span></div>
              </div></div>
          </div>
          <p v-else class="mut">No full months yet.</p>
        </div>
        <p v-if="d.ledger.count" class="src">{{ d.ledger.count.toLocaleString('en-US') }} payments{{ d.ledger.since ? ' since ' + day(d.ledger.since) : '' }} · from {{ d.rails.filter((r) => r.on).map((r) => r.label.toLowerCase()).join(', ') || 'no source yet' }} · <NuxtLink to="/data-sources" class="lk">Data sources</NuxtLink></p>
      </template>

      <template v-if="tab === 'spend'">
        <div class="card"><div class="ch"><h2>Spend by category</h2><div class="cha"><span class="mut">{{ mon(d.last_month) }} against {{ mon(d.prev_month) }}</span><ExportMenu kind="bank_spend" label="Export spend" /></div></div>
          <table class="t" data-nosearch><thead><tr><th>Category</th><th class="r">{{ mon(d.prev_month) }}</th><th class="r">{{ mon(d.last_month) }}</th><th class="r">Change</th><th class="r">3-month average</th><th class="r">Budget a month</th></tr></thead>
            <tbody><tr v-for="c in d.by_category" :key="c.key"><td>{{ c.label }}</td><td class="r">{{ m(c.prev) }}</td><td class="r" :class="{ neg: c.budget !== null && c.last > c.budget }">{{ m(c.last) }}</td><td class="r" :class="{ neg: (pct(c.last, c.prev) ?? 0) > 20 }">{{ pct(c.last, c.prev) === null ? '—' : (pct(c.last, c.prev)! > 0 ? '+' : '') + pct(c.last, c.prev) + '%' }}</td><td class="r">{{ m(c.avg3) }}</td>
              <td class="r"><input class="bi" :value="c.budget ?? ''" inputmode="decimal" placeholder="Set" :aria-label="'Budget for ' + c.label" @change="budget(c, $event)"></td></tr></tbody></table></div>
        <div class="two">
          <div class="card pad0"><div class="ch padh"><h2>Top vendors</h2><span class="mut">Last 12 months</span></div>
            <div class="flt"><input v-model="sv.q" placeholder="Search vendors" aria-label="Search vendors"><select v-model="sv.cat" aria-label="Category"><option value="">All categories</option><option v-for="c in vendorCats" :key="c" :value="c">{{ c }}</option></select></div>
            <table class="t" data-nosearch><thead><tr><th>Vendor</th><th>Category</th><th class="r">{{ mon(d.last_month) }}</th><th class="r">12 months</th></tr></thead>
              <tbody><tr v-for="v in vendorsShown.slice(sv.page * 10, sv.page * 10 + 10)" :key="v.key"><td>{{ v.name }}<span v-if="v.recurring" class="chip">Monthly</span></td><td class="mut2">{{ v.category }}</td><td class="r">{{ m(v.last) }}</td><td class="r">{{ m(v.total) }}</td></tr></tbody></table>
            <p v-if="!vendorsShown.length" class="mut padx">No vendors match.</p><TablePager v-model="sv.page" :total="vendorsShown.length" :size="10" /></div>
          <div class="card"><div class="ch"><h2>Biggest changes</h2><span class="mut">{{ mon(d.prev_month) }} to {{ mon(d.last_month) }}</span></div>
            <table v-if="d.movers.length" class="t" data-nosearch><tbody><tr v-for="v in d.movers.slice(mvPage * 8, mvPage * 8 + 8)" :key="v.name"><td>{{ v.name }}</td><td class="r mut2">{{ m(v.prev) }} → {{ m(v.last) }}</td><td class="r" :class="{ neg: v.change > 0 }">{{ v.change > 0 ? '+' : '' }}{{ m(v.change) }}</td></tr></tbody></table><p v-else class="mut">No changes yet.</p><TablePager v-model="mvPage" :total="d.movers.length" :size="8" />
            <template v-if="d.by_spender.length"><h3>Who spends</h3><p class="mut">Card and expense payments, last 90 days</p><table class="t" data-nosearch><tbody><tr v-for="p in d.by_spender" :key="p.name"><td>{{ p.name }}</td><td class="r">{{ m(p.monthly) }} a month</td><td class="r mut2">{{ m(p.total) }}</td></tr></tbody></table></template>
            <template v-if="d.duplicates.length"><h3>Tools doing the same job</h3><p v-for="g in d.duplicates" :key="g.job" class="dup"><b>{{ g.job }}:</b> {{ g.vendors.map((v) => v.name + ' (' + m(v.monthly) + ')').join(', ') }}</p></template></div>
        </div>
      </template>

      <template v-if="tab === 'txns'">
        <div class="fl"><input v-model="f.q" placeholder="Search description or vendor" aria-label="Search"><input v-model="f.month" type="month" aria-label="Month"><select v-model="f.dir" aria-label="Direction"><option value="">In and out</option><option value="in">Money in</option><option value="out">Money out</option></select>
          <select v-model="f.category" aria-label="Category"><option value="">Every category</option><option v-for="c in d.categories" :key="c.key" :value="c.key">{{ c.label }}</option></select><ExportMenu kind="bank_transactions" label="Export transactions" />
          <label class="al"><input v-model="always" type="checkbox"> Apply my change to every payment to that vendor</label></div>
        <div class="aib"><span><b>AI</b> sorts each vendor into a category, past and future. Your changes always win.</span><span class="mut">{{ (d.ledger.ai ?? 0).toLocaleString('en-US') }} payments sorted by AI</span><button class="lk" type="button" :disabled="aiBusy" @click="aiSort">{{ aiBusy ? 'Sorting…' : 'Sort the rest with AI' }}</button></div>
        <div class="card pad0"><table class="t" data-nosearch><thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th class="r">Amount</th><th>Category</th><th>Account</th></tr></thead>
          <tbody><tr v-for="t in tx?.rows ?? []" :key="t.id"><td class="nw">{{ t.date }}</td><td>{{ t.vendor }}</td><td class="ds">{{ t.description }}</td><td class="r nw" :class="{ pos: t.direction === 'in' }">{{ t.direction === 'in' ? '+' : '−' }}{{ briefMoney(t.amount, t.currency) }}<small v-if="t.currency !== t.base_currency">{{ m(t.amount_base) }}</small></td>
            <td><select :value="t.category ?? ''" :aria-label="'Category for ' + t.vendor" @change="setCat(t, ($event.target as HTMLSelectElement).value, always)"><option v-for="c in d.categories" :key="c.key" :value="c.key">{{ c.label }}</option></select><small :class="{ ai: t.category_by === 'ai' }">{{ t.category_by === 'auto' ? (t.category === 'transfer' ? 'Own accounts' : 'Suggested') : t.category_by === 'ai' ? 'AI' : t.category_by === 'rule' ? 'Your rule' : 'Set by you' }}</small></td><td class="mut2">{{ t.account_label }}</td></tr></tbody></table>
          <p v-if="tx && !tx.rows.length" class="mut padx">No transactions match.</p>
          <div v-if="tx && tx.total > 100" class="pg"><button class="lk" :disabled="!f.page" @click="f.page--">← Newer</button><span class="mut">{{ f.page * 100 + 1 }}–{{ Math.min(tx.total, f.page * 100 + 100) }} of {{ tx.total }}</span><button class="lk" :disabled="(f.page + 1) * 100 >= tx.total" @click="f.page++">Older →</button></div></div>
      </template>

      <template v-if="tab === 'cut'">
        <div class="hb">Recurring payments, ranked by the runway each would give back{{ d.runway !== null ? ' (today: ' + d.runway + ' months)' : '' }}. Flag each one; a downgrade counts the saving % you set. Estimated saving: <b>{{ m(d.marked_monthly) }}</b> a month{{ d.runway_if_cut ? (typeof d.runway_if_cut === 'number' ? ', runway ' + d.runway_if_cut + ' months' : ', which ends the burn') : '' }}. Finvry reminds you to cancel and stops counting it once it stops.</div>
        <div class="flt bar"><input v-model="cf.q" placeholder="Search payees" aria-label="Search payees"><select v-model="cf.cat" aria-label="Category"><option value="">All categories</option><option v-for="c in cutCats" :key="c" :value="c">{{ catLabel(c) }}</option></select>
          <select v-model="cf.flag" aria-label="Flag"><option value="">Every flag</option><option v-for="[k, l] in FLAGS" :key="k" :value="k">{{ l }}</option></select><span class="sp" />
          <ExportMenu kind="bank_cut_list" :ranged="false" label="Export cut list"><a :href="xlsx" class="lk xl2">Excel with saving formulas</a></ExportMenu></div>
        <div class="card pad0"><table class="t cl" data-nosearch><thead><tr><th>Payee</th><th>Category</th><th class="r">A month</th><th>Flag</th><th class="r">Saving %</th><th class="r">Saves a month</th><th class="r">Runway gained</th><th>Action</th></tr></thead>
          <tbody><tr v-for="v in cutShown.slice(cf.page * 20, cf.page * 20 + 20)" :key="v.key" :class="{ mk: v.status !== 'keep' }"><td><b>{{ v.name }}</b><small>Last paid {{ v.last }}{{ v.remind_on && ['to_cancel', 'downgrade'].includes(v.status) ? (v.remind_on <= today ? ' · reminder due' : ' · reminder ' + v.remind_on) : '' }}</small></td><td class="mut2">{{ catLabel(v.category) }}</td><td class="r">{{ m(v.monthly) }}</td>
            <td><select class="fs" :value="v.status" :aria-label="'Flag for ' + v.name" @change="mark(v, ($event.target as HTMLSelectElement).value)"><option v-for="[k, l] in FLAGS" :key="k" :value="k">{{ l }}</option></select><small v-if="v.suggest && v.status === 'keep'" class="sg">Suggested: {{ flagLabel(v.suggest.flag) }}</small></td>
            <td class="r"><input class="bi pc" :value="v.saving_pct ?? (v.status === 'downgrade' ? 50 : ['to_cancel', 'personal'].includes(v.status) ? 100 : '')" inputmode="decimal" :disabled="['keep', 'review', 'cancelled'].includes(v.status)" :aria-label="'Saving % for ' + v.name" @change="setPct(v, $event)"></td>
            <td class="r">{{ v.saving ? m(v.saving) : '—' }}</td><td class="r">{{ v.runway_gain === null || v.runway_gain === 0 ? '—' : typeof v.runway_gain === 'number' ? '+' + v.runway_gain + ' mo' : v.runway_gain }}</td>
            <td><input class="nt" :value="v.note ?? ''" :placeholder="v.suggest?.why ?? 'What to do'" maxlength="500" :aria-label="'Action for ' + v.name" @change="setNote(v, $event)"></td></tr></tbody></table>
          <p v-if="!cutShown.length" class="mut padx">{{ d.cut_list.length ? 'No payees match.' : 'No recurring payments yet.' }}</p><TablePager v-model="cf.page" :total="cutShown.length" :size="20" /></div>
        <div v-if="d.checks.length" class="card"><div class="ch"><h2>Worth a look</h2><span class="mut">Payments in the last 90 days that stand out</span></div>
          <table class="t" data-nosearch><thead><tr><th>Date</th><th>Payee</th><th>Who</th><th class="r">Amount</th><th>Why</th></tr></thead>
            <tbody><tr v-for="c in d.checks" :key="c.id"><td class="nw">{{ c.date }}</td><td>{{ c.vendor }}</td><td class="mut2">{{ c.spender ?? '—' }}</td><td class="r">{{ m(c.amount) }}</td><td>{{ c.why }}{{ c.count > 1 ? ' · ' + c.count + ' payments' : '' }}</td></tr></tbody></table></div>
      </template>
      <template v-if="tab === 'reconcile'">
        <div class="hb">Your bank against Financials, month by month. <b>Cash</b> must match; receipts and spend differ by timing.</div>
        <p v-if="!rc" class="mut">Loading…</p>
        <template v-else>
          <div class="card pad0"><table class="t rc" data-nosearch><thead><tr><th>Month</th><th class="r">Bank cash</th><th class="r">Financials cash</th><th class="r">Gap</th><th class="r">Receipts / revenue</th><th class="r">Spend / costs</th><th>Status</th><th /></tr></thead>
            <tbody><template v-for="r in rc.rows" :key="r.month"><tr class="cl" :class="{ on: rcOpen === r.month }" @click="rcOpen = rcOpen === r.month ? '' : r.month">
              <td><b>{{ mon(r.month) }}</b><small v-if="r.cash.of">{{ r.cash.accounts }} of {{ r.cash.of }} account{{ r.cash.of === 1 ? '' : 's' }} with a balance</small></td>
              <td class="r">{{ rm(r.cash.bank) }}</td><td class="r">{{ rm(r.cash.fin) }}</td><td class="r" :class="{ neg: r.cash.gap !== null && r.status === 'gap' }">{{ r.cash.gap === null ? '—' : (r.cash.gap > 0 ? '+' : '') + rm(r.cash.gap) }}</td>
              <td class="r" :class="{ mut2: r.receipts.ok }">{{ rm(r.receipts.bank) }} / {{ rm(r.receipts.fin) }}</td><td class="r" :class="{ mut2: r.spend_total.ok }">{{ rm(r.spend_total.bank) }} / {{ rm(r.spend_total.fin) }}</td>
              <td><span class="rs" :class="r.reconciled ? 'done' : r.status">{{ r.reconciled ? 'Reconciled' : ST[r.status] }}</span></td><td class="r"><span class="chev">{{ rcOpen === r.month ? '−' : '+' }}</span></td></tr>
              <tr v-if="rcOpen === r.month" class="dt"><td colspan="8"><div class="rd">
                <table class="t" data-nosearch><thead><tr><th>Line</th><th class="r">Bank</th><th class="r">Financials</th><th class="r">Difference</th></tr></thead>
                  <tbody><tr><td>Cash at month end</td><td class="r">{{ rm(r.cash.bank) }}</td><td class="r">{{ rm(r.cash.fin) }}</td><td class="r">{{ r.cash.gap === null ? '—' : rm(r.cash.gap) }}</td></tr>
                    <tr><td>Customer receipts / revenue</td><td class="r">{{ rm(r.receipts.bank) }}</td><td class="r">{{ rm(r.receipts.fin) }}</td><td class="r">{{ r.receipts.fin === null ? '—' : rm(r.receipts.bank - r.receipts.fin) }}</td></tr>
                    <tr v-for="x in r.spend" :key="x.key"><td>{{ x.label }}</td><td class="r">{{ rm(x.bank) }}</td><td class="r">{{ rm(x.fin) }}</td><td class="r">{{ x.fin === null ? '—' : rm(x.bank - x.fin) }}</td></tr>
                    <tr class="mut2"><td>Also in the bank: funding and loans {{ rm(r.other.financing) }} · other money in {{ rm(r.other.other_in) }} · transfers between own accounts {{ rm(r.other.transfers) }}</td><td colspan="3" /></tr></tbody></table>
                <p v-if="r.status === 'partial'" class="mut">Some accounts have no balance this month.</p>
                <p v-else-if="r.status === 'gap'" class="mut">Cash differs by {{ rm(Math.abs(r.cash.gap ?? 0)) }}. Common reasons: an account missing from Banking (or from Financials), a statement month not uploaded, money in transit between accounts at month end, or a figure keyed into Financials by mistake.</p>
                <div v-if="r.reconciled" class="rcd">Reconciled{{ r.reconciled.by ? ' by ' + r.reconciled.by : '' }} on {{ r.reconciled.at.slice(0, 10) }}{{ r.reconciled.note ? ': ' + r.reconciled.note : '' }} <button class="lk" @click.stop="markRc(r, false)">Undo</button></div>
                <div v-else-if="r.status !== 'no_financials' && r.status !== 'no_bank'" class="rcd"><input v-model="rcNote" maxlength="1000" placeholder="Note (e.g. difference is card payments in transit)" @click.stop><button class="btn sm" @click.stop="markRc(r, true)">Mark reconciled</button></div>
              </div></td></tr></template></tbody></table></div>
          <div v-if="rc.accounts.length" class="card"><div class="ch"><h2>Accounts</h2><span class="mut">Where month-end balances come from</span></div>
            <table class="t" data-nosearch><tbody><tr v-for="a in rc.accounts" :key="a.name"><td>{{ a.name }}</td><td class="mut2">{{ a.currency }}</td><td class="r">{{ a.live ? a.balances + ' balance' + (a.balances === 1 ? '' : 's') + ' known' : 'No balance yet' }}</td></tr></tbody></table></div>
        </template>
      </template>
      <p class="fine">Read-only. Other currencies at the daily rate. Not financial advice.</p>
    </template>
    <p v-else-if="pending" class="mut">Loading…</p>

    <SheetImport :open="lk" kind="bank_txns" :currency="d?.currency" @close="lk = false" @done="refresh()" />
    <AppModal :open="up.open" title="Upload a bank statement" @close="up.open = false">
      <div class="frm"><TemplateCard class="w" title="Any bank export works" text="CSV, Excel, PDF or a photo. Making one yourself? Use the template." @download="downloadTemplate('bank_txns')" />
        <label v-if="ua?.accounts.length">Account<select v-model="up.existing"><option value="">A new account</option><option v-for="a in ua.accounts" :key="a.key" :value="a.key">{{ a.label }}{{ isGroup && a.entity ? ' · ' + a.entity : '' }} ({{ a.currency }})</option></select></label>
        <template v-if="!upAcc"><label v-if="isGroup">Company<select v-model="up.entity"><option value="">{{ companies.find((c) => c.main)?.name ?? 'Main company' }}</option><option v-for="c in companies.filter((x) => !x.main)" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><label>Account name<input v-model="up.account" maxlength="120" placeholder="e.g. GTBank current ··1234"></label>
        <label>Currency<select v-model="up.currency"><option>NGN</option><option>USD</option><option>GBP</option><option>EUR</option><option>KES</option><option>GHS</option><option>ZAR</option></select></label></template>
        <p v-else class="hint">Has payments up to {{ upAcc.to ? new Date(upAcc.to + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'now' }}. Overlaps are skipped.</p>
        <DropZone no-tip accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg" :label="up.file ? up.file.name : 'Drop the statement here'" hint="Up to 20 MB" @change="(e: Event) => (up.file = (e.target as HTMLInputElement).files?.[0] ?? null)" /></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="up.open = false">Cancel</button><button class="btn" :disabled="busy || !up.file" @click="upload">{{ busy ? 'Reading…' : 'Add to the ledger' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.tr { display: flex; flex-direction: column; gap: 16px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 640px; }
.tb { display: flex; gap: 8px; flex-wrap: wrap; } .fx-stats { margin: 0; }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs .n { margin-left: 6px; font-size: 11.5px; color: var(--c-muted); }
.card h2 { margin: 0; font-size: 17px; } .card h3 { margin: 16px 0 6px; font-size: 14px; } .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .mut2 { color: var(--c-muted); } .pad0 { padding: 0; overflow-x: auto; } .padx { padding: 14px; }
.empty { background: #fff; border: 1px solid var(--c-rule); padding: 18px; } .empty p { margin: 6px 0 12px; color: var(--c-ink-soft); font-size: 14px; }
.ov { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; }
.hero { background: #fff; border: 1px solid var(--c-rule); padding: 24px 26px; display: flex; flex-direction: column; min-height: 228px; }
.ht { font-size: 14px; color: var(--c-muted); } .hv { margin-top: 8px; font-size: 44px; font-weight: 600; letter-spacing: -.02em; color: var(--c-navy); font-variant-numeric: tabular-nums; line-height: 1.1; overflow-wrap: anywhere; }
.hs { margin-top: 6px; font-size: 13px; color: var(--c-ink-soft); }
.bar { display: flex; gap: 2px; height: 8px; margin-top: auto; padding-top: 0; background: var(--c-paper-2); } .bar i { display: block; height: 100%; }
.hero .bar { margin-top: auto; } .lgd { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; color: var(--c-ink-soft); } .lgd i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; } .lgd b { font-weight: 600; color: var(--c-ink); margin-left: 3px; }
.kp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .kp > * { margin: 0; }
.ic { width: 38px; height: 38px; display: grid; place-items: center; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink-soft); cursor: pointer; } .ic:hover { color: var(--c-navy); } .ic svg { width: 16px; height: 16px; } .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
.toast { position: fixed; right: 24px; bottom: 96px; z-index: 60; display: flex; align-items: center; gap: 14px; margin: 0; padding: 12px 14px 12px 16px; background: var(--c-navy); color: #fff; font-size: 13.5px; max-width: 420px; box-shadow: 0 14px 34px rgba(12, 26, 46, .22); }
.toast button { background: none; border: 0; color: rgba(255,255,255,.7); font-size: 18px; line-height: 1; cursor: pointer; padding: 0; } .toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; } .toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.chart .lg { display: flex; gap: 14px; align-items: center; font-size: 12.5px; color: var(--c-ink-soft); } .lg i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; vertical-align: -1px; }
i.in { background: var(--c-navy); } i.out { background: #a9b6c8; }
.plot { display: grid; grid-template-columns: auto 1fr; gap: 10px; height: 230px; padding-top: 6px; }
.ya { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: var(--c-muted); text-align: right; padding-bottom: 22px; font-variant-numeric: tabular-nums; }
.area { position: relative; display: flex; gap: 4px; }
.grid { position: absolute; inset: 0 0 22px 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; } .grid i { border-top: 1px dashed var(--c-rule); } .grid i:last-child { border-top: 1px solid var(--c-rule-strong); }
.col { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; padding-bottom: 22px; } .col.hv { background: rgba(95, 168, 211, .08); }
.pair { flex: 1; width: 100%; display: flex; gap: 3px; align-items: flex-end; justify-content: center; } .pair i { width: min(14px, 34%); transition: height .3s; }
.xl { position: absolute; bottom: 3px; font-size: 11.5px; color: var(--c-muted); }
.tip { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); z-index: 5; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 10px 26px rgba(12, 26, 46, .14); padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; white-space: nowrap; pointer-events: none; }
.tip b { font-size: 12.5px; font-weight: 600; } .tip i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; } .tip .tn { margin-top: 3px; padding-top: 4px; border-top: 1px solid var(--c-rule); font-weight: 500; } .tip .neg { color: var(--c-danger); }
.aib { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 14px; background: #fff; border: 1px solid var(--c-rule); font-size: 13px; color: var(--c-ink-soft); } .aib b { font-weight: 600; color: var(--c-navy); } .aib .lk { margin-left: auto; }
small.ai { color: var(--c-blue-deep); font-weight: 600; }
.cha { display: flex; align-items: center; gap: 12px; } .padh { padding: 18px 20px 0; }
.flt { display: flex; gap: 8px; padding: 12px 20px; flex-wrap: wrap; align-items: center; } .flt input, .flt select { font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .flt input { flex: 1; min-width: 160px; }
.flt.bar { padding: 0; } .flt .sp { flex: 1; } .xl2 { font-size: 12.5px; color: var(--c-blue-deep); margin-top: 4px; }
.src { margin: 0; font-size: 12.5px; color: var(--c-muted); }
@media (max-width: 960px) { .ov { grid-template-columns: 1fr; } }
.t { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .t td { padding: 7px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.t .r { text-align: right; } .t .neg { color: var(--c-danger); } .t .pos { color: var(--c-blue-deep); } .t small { display: block; color: var(--c-muted); font-size: 11.5px; margin-top: 2px; } .t .nw { white-space: nowrap; } .t .ds { max-width: 320px; color: var(--c-ink-soft); } .t select { font: inherit; font-size: 12.5px; padding: 3px 5px; border: 1px solid var(--c-rule-strong); background: #fff; max-width: 200px; }
.t tr.mk td { background: #f7f8fb; } .ac { white-space: nowrap; } .ac .lk + .lk { margin-left: 12px; }
.bi { width: 100px; font: inherit; font-size: 12.5px; padding: 3px 6px; border: 1px solid var(--c-rule-strong); text-align: right; }
.chip { margin-left: 6px; font-size: 11px; padding: 1px 6px; background: var(--c-signal-soft); color: var(--c-blue-deep); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } @media (max-width: 960px) { .two, .rails { grid-template-columns: 1fr; } }
.dup { margin: 4px 0; font-size: 13px; color: var(--c-ink-soft); }
.fl { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .fl input:not([type="checkbox"]), .fl select { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .fl input[placeholder] { min-width: 240px; } .al { font-size: 12.5px; color: var(--c-muted); display: flex; gap: 6px; align-items: center; }
.pg { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk:disabled { color: var(--c-muted); cursor: default; }
.hb { border: 1px solid var(--c-rule); background: #fff; padding: 12px 16px; font-size: 14px; color: var(--c-ink-soft); line-height: 1.55; }
.hint { margin: 0; font-size: 13px; color: var(--c-muted); } .frm { display: flex; flex-direction: column; gap: 12px; } .frm label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .frm input, .frm select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .sp { flex: 1; }
.fine { margin: 0; font-size: 12px; color: var(--c-muted); }
.fs { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; } .sg { display: block; color: var(--c-blue-deep); font-size: 11.5px; margin-top: 3px; }
.bi.pc { width: 64px; } .nt { font: inherit; font-size: 12.5px; padding: 4px 6px; border: 1px solid var(--c-rule); width: 100%; min-width: 180px; } .nw { white-space: nowrap; }
.rc .cl { cursor: pointer; } .rc tr.on td { background: var(--c-paper-3); } .chev { color: var(--c-muted); } .rd { padding: 10px 6px 14px; display: flex; flex-direction: column; gap: 10px; } .dt > td { background: #fbfcfd; }
.rs { font-size: 12px; white-space: nowrap; color: var(--c-ink-soft); } .rs.matches, .rs.done { color: var(--c-blue-deep); font-weight: 500; } .rs.gap { color: var(--c-danger); }
.rcd { display: flex; gap: 8px; align-items: center; font-size: 13px; } .rcd input { flex: 1; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .btn.sm { height: 30px; padding: 0 12px; font-size: 13px; }
</style>
