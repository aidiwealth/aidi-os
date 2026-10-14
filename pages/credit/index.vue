<script setup lang="ts">
useHead({ title: 'Credit' })
interface Loan { id: string; reference: string | null; borrower: string; borrower_id: string; sector: string | null; country: string | null; lender: string | null; principal: string; currency: string; annual_rate: string; status: string; disbursed_on: string; outstanding: number; arrears: number; dpd: number; bucket: string; next: { due_date: string; amount: number } | null }
interface Tot { outstanding: number; arrears: number; par30: number; interest12m: number; loans: number }
interface Exp { name: string; totals: Record<string, number> }
const { data, error, refresh } = await useFetch<{ loans: Loan[]; totals: Record<string, Tot>; interestSeries: Record<string, { period: string; value: number }[]>; byBorrower: Exp[]; bySector: Exp[]; byCountry: Exp[] }>('/api/credit')
const { data: borrowers, refresh: refreshB } = await useFetch<{ id: string; name: string; country: string | null; kind: string; monitor: boolean; last_check: { score: number | null; band: string | null; status: string; at: string } | null }[]>('/api/credit/borrowers')
const report = ref('')
const bookMix = computed(() => { const c = cc.value; if (!c) return []; const m: Record<string, number> = { current: 0, '1-30': 0, '31-90': 0, '90+': 0 }; for (const l of data.value?.loans ?? []) if (l.status === 'active' && l.currency === c) m[l.bucket] = (m[l.bucket] ?? 0) + l.outstanding; return Object.entries(m).map(([k, v]) => ({ label: BUCKET[k] ?? k, value: v })) })
// Pie charts are per currency; pick which one when the book has more than one.
const pick = ref('')
const cc = computed(() => (currencies.value.includes(pick.value) ? pick.value : currencies.value[0] ?? ''))
const mix = (list?: Exp[]) => (list ?? []).map((e) => ({ label: e.name, value: e.totals[cc.value] ?? 0 })).filter((x) => x.value > 0)
const tally = (xs: string[]) => Object.entries(xs.reduce((t, x) => ({ ...t, [x]: (t[x] ?? 0) + 1 }), {} as Record<string, number>)).map(([label, value]) => ({ label, value }))
const checkMix = computed(() => tally((borrowers.value ?? []).map((b) => (b.last_check?.score ? (b.last_check.band ?? 'Scored') : b.last_check?.status === 'manual' ? 'Reviewed' : 'Not checked'))))
const lenderMix = computed(() => groups.value.map((g) => ({ label: g.name, value: g.tot[cc.value] ?? 0 })).filter((x) => x.value > 0))
const BAND: Record<string, string> = { Excellent: 'g', Good: 'b', Fair: 'a', Poor: 'r' }
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
// Any company of the group can lend (the one the money left from).
const vehicles = computed(() => (entities.value ?? []).filter((e) => e.kind !== 'trust'))
const money = (v: number | string, c: string) => briefMoney(v, c)
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const currencies = computed(() => Object.keys(data.value?.totals ?? {}).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))))
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const showClosed = ref(false)
const rows = computed(() => (data.value?.loans ?? []).filter((l) => showClosed.value || l.status === 'active'))
const adding = ref<'' | 'borrower' | 'loan'>('')
const bf = reactive({ name: '', country: '', sector: '', contact_name: '', contact_email: '' })
const lf = reactive({ deployment_id: '', borrower_id: '', lender_entity_id: '', reference: '', principal: '', currency: 'USD', annual_rate: '', tenor_months: '12', repayment_type: 'amortising', frequency: 'monthly', disbursed_on: '', first_payment_on: '', security: '', notes: '' })
const msg = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function addBorrower() { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/credit/borrowers', { method: 'POST', body: bf }); await refreshB(); lf.borrower_id = r.id; adding.value = 'loan' } catch (e) { msg.value = errText(e) } }
async function addLoan() { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/credit/loans', { method: 'POST', body: { ...lf, principal: lf.principal.replace(/[^0-9.]/g, '') } }); await navigateTo('/credit/' + r.id) } catch (e) { msg.value = errText(e) } }
// Lent out and recorded from the bank, not booked as loans yet.
interface Ub { id: string; paid_on: string; company: string; founder_name: string | null; amount: number; currency: string; reference: string | null; paying_entity_id: string | null; entity: string | null; account: string | null }
const { data: unbooked, refresh: refreshU } = await useFetch<Ub[]>('/api/credit/unbooked', { default: () => [] })
function bookFrom(u: Ub) {
  const b = (borrowers.value ?? []).find((x) => x.name.trim().toLowerCase() === u.company.trim().toLowerCase())
  const first = new Date(u.paid_on + 'T00:00:00Z'); first.setUTCMonth(first.getUTCMonth() + 1)
  Object.assign(lf, { deployment_id: u.id, borrower_id: b?.id ?? '', lender_entity_id: u.paying_entity_id ?? '', reference: u.reference ?? '', principal: String(u.amount), currency: u.currency, disbursed_on: u.paid_on, first_payment_on: first.toISOString().slice(0, 10) })
  if (!b) { Object.assign(bf, { name: u.company, contact_name: u.founder_name ?? '' }); adding.value = 'borrower' } else adding.value = 'loan'
}
void refreshU
watch(adding, (a) => { if (!a) lf.deployment_id = '' })
const BUCKET: Record<string, string> = { current: 'Current', '1-30': '1–30 days late', '31-90': '31–90 days late', '90+': '90+ days late' }
const CLOSED: Record<string, string> = { repaid: 'Repaid', written_off: 'Written off', restructured: 'Restructured' }
const RT: Record<string, string> = { amortising: 'Amortising', interest_only: 'Interest only', bullet: 'Bullet' }
void refresh
const { data: scores } = await useFetch<{ rows: { who: string; name: string; score: number | null; band: string | null; status: string | null }[] }>('/api/credit/scores', { key: 'credit-scores' })
const scoreMix = computed(() => ['Excellent', 'Good', 'Fair', 'Poor'].map((b) => ({ label: b, value: (scores.value?.rows ?? []).filter((r) => r.band === b).length })).concat([{ label: 'No bureau history', value: (scores.value?.rows ?? []).filter((r) => r.status === 'no_data').length }]))
const unchecked = computed(() => (scores.value?.rows ?? []).filter((r) => !r.status).length)
const { data: apps } = await useFetch<{ id: string; status: string; amount: number; currency: string; tenor_months: number | null; company: string; country: string | null; business_score: number | null; guarantor_score: number | null }[]>('/api/credit/applications', { key: 'credit-apps' })
const APP_ST: Record<string, string> = { new: 'New', checking: 'Checking', review: 'In review', approved: 'Approved', declined: 'Declined', disbursed: 'Disbursed', withdrawn: 'Withdrawn' }
const { data: meC } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
// Layout: tabs like the rentals pages.
const route = useRoute()
const tab = ref<'overview' | 'loans' | 'borrowers' | 'applications'>((['overview', 'loans', 'borrowers', 'applications'].includes(String(route.query.t)) ? String(route.query.t) : 'overview') as 'overview')
watch(tab, (t) => { navigateTo({ query: { ...route.query, t } }, { replace: true }) })
const active = computed(() => (data.value?.loans ?? []).filter((l) => l.status === 'active'))
const lenders = computed(() => [...new Set(active.value.map((l) => l.lender ?? 'Lender not set'))])
const lenderLine = computed(() => lenders.value.join(' and '))
// Loans grouped by the company that lent them.
const groups = computed(() => {
  const m = new Map<string, Loan[]>()
  for (const l of rows.value) { const k = l.lender ?? 'Lender not set'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(l) }
  return [...m.entries()].map(([name, list]) => { const tot: Record<string, number> = {}; for (const l of list) if (l.status === 'active') tot[l.currency] = (tot[l.currency] ?? 0) + l.outstanding; return { name, list, tot } })
})
const repaidPct = (l: Loan) => { const p = Number(l.principal); return p ? Math.max(0, Math.min(100, Math.round((p - l.outstanding) / p * 100))) : 0 }
const fmtTot = (t: Record<string, number>) => Object.entries(t).map(([c, v]) => money(v, c)).join(' · ') || '—'
const today = new Date().toISOString().slice(0, 10)
const inDays = (d: string) => Math.round((new Date(d + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000)
// Needs attention: late loans, payments due in two weeks, money lent from the bank not booked, borrowers never checked.
const attention = computed(() => {
  const out: { tone: 'r' | 'a' | 'b'; text: string; to?: string; tab?: string }[] = []
  for (const l of active.value.filter((x) => x.dpd > 0)) out.push({ tone: 'r', text: l.borrower + ' is ' + l.dpd + ' days late · ' + money(l.arrears, l.currency) + ' in arrears', to: '/credit/' + l.id })
  for (const l of active.value.filter((x) => x.next && inDays(x.next.due_date) >= 0 && inDays(x.next.due_date) <= 14)) out.push({ tone: 'a', text: l.borrower + ' pays ' + money(l.next!.amount, l.currency) + ' on ' + day(l.next!.due_date), to: '/credit/' + l.id })
  if (unbooked.value?.length) out.push({ tone: 'a', text: unbooked.value.length + ' payment' + (unbooked.value.length === 1 ? '' : 's') + ' lent from the bank not booked as loans yet', tab: 'loans' })
  const nc = (borrowers.value ?? []).filter((b) => !b.last_check).length
  if (nc) out.push({ tone: 'b', text: nc + ' borrower' + (nc === 1 ? ' has' : 's have') + ' no credit check or review yet', tab: 'borrowers' })
  return out
})
const comingUp = computed(() => active.value.filter((l) => l.next).sort((a, b) => a.next!.due_date.localeCompare(b.next!.due_date)).slice(0, 6))
const BK: Record<string, string> = { current: 'ok', '1-30': 'late', '31-90': 'bad', '90+': 'bad' }
const loansOf = (bid: string) => active.value.filter((l) => l.borrower_id === bid)
</script>

<template>
  <section class="cr">
    <div class="head">
      <div><p class="label">Venture Capital</p><h1>Credit</h1><p class="lead">Venture debt and loans{{ lenderLine ? ' lent by ' + lenderLine : '' }}: schedules, repayments, arrears and borrowers' credit, for the whole team.</p></div>
      <div class="tools"><NuxtLink v-if="meC?.roles.includes('admin')" to="/credit/settings" class="btn secondary">Settings</NuxtLink><button class="btn secondary" type="button" @click="adding = 'borrower'">New borrower</button><button class="btn" type="button" @click="adding = 'loan'">Book a loan</button></div>
    </div>
    <nav class="tabs" role="tablist"><button v-for="[k, l] in ([['overview', 'Overview'], ['loans', 'Loans (' + (data?.loans.length ?? 0) + ')'], ['borrowers', 'Borrowers (' + (borrowers?.length ?? 0) + ')'], ['applications', 'Applications (' + (apps?.length ?? 0) + ')']] as [string, string][])" :key="k" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="tab = k as 'overview'">{{ l }}</button></nav>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <p v-if="error" class="error" role="alert">Could not load the credit book.</p>

    <template v-else-if="data">
      <!-- Overview -->
      <template v-if="tab === 'overview'">
        <div v-for="c in currencies" :key="c" class="card strip">
          <div class="sc0"><em>{{ c }} book</em><b>{{ money(data.totals[c]!.outstanding, c) }}</b><small>outstanding · {{ data.totals[c]!.loans }} active loan{{ data.totals[c]!.loans === 1 ? '' : 's' }}</small></div>
          <div><em>In arrears</em><b :class="{ red: data.totals[c]!.arrears > 0 }">{{ money(data.totals[c]!.arrears, c) }}</b><small>instalments past due</small></div>
          <div><em>PAR 30</em><b :class="{ red: data.totals[c]!.par30 > 0 }">{{ data.totals[c]!.outstanding ? (data.totals[c]!.par30 / data.totals[c]!.outstanding * 100).toFixed(1) + '%' : '—' }}</b><small>of the book 30+ days late</small></div>
          <div><em>Interest received</em><b>{{ money(data.totals[c]!.interest12m, c) }}</b><small>last 12 months</small></div>
        </div>
        <EmptyState v-if="!currencies.length && !unbooked?.length" card icon="credit" title="No loans yet" text="Add a borrower, review their credit, then book the loan. Schedules, repayments, arrears and covenants are tracked for you."><button class="btn" @click="adding = 'loan'">Book a loan</button></EmptyState>
        <div class="two">
          <div class="card"><h3>Needs attention <span v-if="attention.length" class="n">{{ attention.length }}</span></h3>
            <template v-for="(a, i) in attention" :key="i"><NuxtLink v-if="a.to" :to="a.to" class="ai"><span class="dot" :class="a.tone" />{{ a.text }}</NuxtLink><button v-else type="button" class="ai" @click="tab = a.tab as 'loans'"><span class="dot" :class="a.tone" />{{ a.text }}</button></template>
            <p v-if="!attention.length" class="okm">✓ Nothing late, nothing due in the next two weeks.</p></div>
          <div class="card"><h3>Coming up</h3>
            <NuxtLink v-for="l in comingUp" :key="l.id" :to="'/credit/' + l.id" class="cu"><span class="cd"><b>{{ day(l.next!.due_date) }}</b><em>{{ inDays(l.next!.due_date) < 0 ? Math.abs(inDays(l.next!.due_date)) + ' days ago' : 'in ' + inDays(l.next!.due_date) + ' days' }}</em></span><span><b>{{ l.borrower }}</b><em>{{ l.lender ?? '' }}</em></span><b class="am">{{ money(l.next!.amount, l.currency) }}</b></NuxtLink>
            <p v-if="!comingUp.length" class="mut">No repayments scheduled.</p></div>
        </div>
        <div v-if="currencies.length" class="charts">
          <TrendChart v-for="c in currencies.slice(0, 2)" :key="c" :title="'Interest received · ' + c" sub="Per month" :points="pts(data.interestSeries[c])" foot="Applied interest-first to instalments" />
        </div>
        <template v-if="currencies.length">
          <div class="wh"><h2>Where the money is</h2><span class="mut">Outstanding, in {{ cc }}</span><div v-if="currencies.length > 1" class="seg2"><button v-for="c in currencies" :key="c" type="button" :class="{ on: c === cc }" @click="pick = c">{{ c }}</button></div></div>
          <div class="pies">
            <div class="card"><DonutChart title="By health" total-label="Outstanding" :currency="cc" :segments="bookMix" /></div>
            <div class="card"><DonutChart title="By lender" total-label="Outstanding" :currency="cc" :segments="lenderMix" /></div>
            <div class="card"><DonutChart title="By borrower" total-label="Outstanding" :currency="cc" :segments="mix(data.byBorrower)" /></div>
            <div class="card"><DonutChart title="By sector" total-label="Outstanding" :currency="cc" :segments="mix(data.bySector)" /></div>
            <div class="card"><DonutChart title="By country" total-label="Outstanding" :currency="cc" :segments="mix(data.byCountry)" /></div>
          </div>
        </template>
      </template>

      <!-- Loans -->
      <template v-else-if="tab === 'loans'">
        <div v-if="unbooked?.length" class="card ub"><h3>Lent from the bank, not booked as loans <span class="n">{{ unbooked.length }}</span></h3><p class="mut">Recorded under Deployments from a bank account. Book each as a loan to track its schedule, repayments and arrears.</p>
          <div v-for="u in unbooked" :key="u.id" class="ubr"><span class="d">{{ day(u.paid_on) }}</span><span><b>{{ u.company }}</b><em>{{ [u.entity, u.account, u.reference].filter(Boolean).join(' · ') }}</em></span><b class="a">{{ u.currency }} {{ u.amount.toLocaleString('en-US') }}</b><button type="button" class="btn sm" @click="bookFrom(u)">Book as loan</button></div></div>
        <div v-for="g in groups" :key="g.name" class="card grp">
          <div class="gh"><div><p class="kl">Lent by</p><h2>{{ g.name }}</h2></div><div class="gt"><em>Outstanding</em><b>{{ fmtTot(g.tot) }}</b></div></div>
          <NuxtLink v-for="l in g.list" :key="l.id" :to="'/credit/' + l.id" class="lr" :data-b="l.status === 'active' ? l.bucket : 'closed'">
            <span class="lb"><b>{{ l.borrower }}</b><em>{{ [l.reference, l.sector, l.country].filter(Boolean).join(' · ') }}</em></span>
            <span class="lt">{{ money(l.principal, l.currency) }} at {{ Number(l.annual_rate) }}%<em>since {{ day(l.disbursed_on) }}</em></span>
            <span class="lp"><i><s :style="{ width: repaidPct(l) + '%' }" /></i><em>{{ repaidPct(l) }}% repaid</em></span>
            <span class="lo"><b>{{ l.status === 'active' ? money(l.outstanding, l.currency) : '—' }}</b><em>{{ l.arrears > 0 ? money(l.arrears, l.currency) + ' late' : 'outstanding' }}</em></span>
            <span class="ln">{{ l.next ? day(l.next.due_date) : '—' }}<em>{{ l.next ? money(l.next.amount, l.currency) : 'nothing due' }}</em></span>
            <span class="pill" :class="l.status === 'active' ? BK[l.bucket] : 'closed'">{{ l.status === 'active' ? BUCKET[l.bucket] : CLOSED[l.status] }}</span>
          </NuxtLink>
        </div>
        <EmptyState v-if="!groups.length && !unbooked?.length" card icon="credit" title="No loans yet"><button class="btn" @click="adding = 'loan'">Book a loan</button></EmptyState>
        <label v-if="data.loans.some((l) => l.status !== 'active')" class="chk"><input v-model="showClosed" type="checkbox"> Show repaid, written-off and restructured loans</label>
      </template>

      <!-- Borrowers -->
      <div v-else-if="tab === 'borrowers' && borrowers?.length" class="pies sm">
        <div class="card"><DonutChart title="Credit checks" total-label="Borrowers" :segments="checkMix" /></div>
        <div class="card"><DonutChart title="By country" total-label="Borrowers" :segments="tally((borrowers ?? []).map((b) => b.country ?? 'Not set'))" /></div>
      </div>
      <div v-if="tab === 'borrowers'" class="card ls">
        <p class="mut pad">Nigerian borrowers are checked with the credit bureaus; borrowers elsewhere (e.g. the US) get a credit review and an uploaded bureau report.</p>
        <button v-for="b in borrowers ?? []" :key="b.id" type="button" class="br" @click="report = b.id">
          <span class="lb"><b>{{ b.name }}</b><em>{{ b.country ?? 'Country not set' }} · {{ b.kind === 'individual' ? 'Individual' : 'Business' }}{{ b.monitor ? ' · monitored' : '' }}</em></span>
          <span class="lt">{{ loansOf(b.id).length }} active loan{{ loansOf(b.id).length === 1 ? '' : 's' }}<em>{{ fmtTot(loansOf(b.id).reduce((t, l) => ({ ...t, [l.currency]: (t[l.currency] ?? 0) + l.outstanding }), {} as Record<string, number>)) }}</em></span>
          <span v-if="b.last_check?.score" class="sc" :class="BAND[b.last_check.band ?? '']"><b>{{ b.last_check.score }}</b><em>{{ b.last_check.band }}</em></span><span v-else-if="b.last_check?.status === 'manual'" class="pill">Reviewed</span><span v-else class="pill warn">Not checked</span>
        </button>
        <EmptyState v-if="!borrowers?.length" compact icon="credit" title="No borrowers yet"><button class="btn" @click="adding = 'borrower'">Add a borrower</button></EmptyState>
      </div>

      <!-- Applications -->
      <div v-if="tab === 'applications' && apps?.length" class="pies sm">
        <div class="card"><DonutChart title="By status" total-label="Applications" :segments="tally(apps.map((a) => APP_ST[a.status] ?? a.status))" /></div>
        <div class="card"><DonutChart title="By country" total-label="Applications" :segments="tally(apps.map((a) => a.country ?? 'Not set'))" /></div>
      </div>
      <div v-if="tab === 'applications'" class="card ls">
        <p class="mut pad">From the pitch form (“Venture debt / loan”), approved separately from equity pitches.</p>
        <NuxtLink v-for="a in apps ?? []" :key="a.id" :to="'/credit/applications/' + a.id" class="br">
          <span class="lb"><b>{{ a.company }}</b><em>{{ a.country ?? '' }}</em></span>
          <span class="lt">{{ money(a.amount, a.currency) }}<em>{{ a.tenor_months ? a.tenor_months + ' months' : '' }}</em></span>
          <span class="scs"><i v-if="a.business_score" title="Business score">B {{ a.business_score }}</i><i v-if="a.guarantor_score" title="Lowest guarantor score">G {{ a.guarantor_score }}</i></span>
          <span class="pill" :class="a.status">{{ APP_ST[a.status] }}</span>
        </NuxtLink>
        <EmptyState v-if="!apps?.length" compact icon="credit" title="No loan applications yet" />
      </div>
    </template>

    <AppModal :open="adding === 'borrower'" title="New borrower" @close="adding = ''"><form class="frm mfx" @submit.prevent="addBorrower">
      <label class="label">Borrower<input v-model="bf.name" required maxlength="200"></label>
      <label class="label">Country<CountrySelect v-model="bf.country" /></label>
      <label class="label">Sector<input v-model="bf.sector" maxlength="100" placeholder="e.g. Logistics, Fintech"></label>
      <label class="label">Contact<input v-model="bf.contact_name" maxlength="200"></label>
      <label class="label">Contact email<input v-model="bf.contact_email" type="email" maxlength="254"></label>
      <div class="actions"><button class="btn" type="submit">Save borrower</button></div>
    </form></AppModal>

    <AppModal :open="adding === 'loan'" title="Book a loan" wide @close="adding = ''"><form class="frm mfx" @submit.prevent="addLoan">
      <label class="label">Borrower<select v-model="lf.borrower_id" required><option value="" disabled>Choose</option><option v-for="b in borrowers ?? []" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
      <label class="label">Lent by (the company the money left from)<select v-model="lf.lender_entity_id" required><option value="" disabled>Choose</option><option v-for="v in vehicles" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
      <label class="label">Reference<input v-model="lf.reference" maxlength="60" placeholder="optional"></label>
      <label class="label">Principal<input v-model="lf.principal" required inputmode="decimal"></label>
      <label class="label">Currency<select v-model="lf.currency"><option v-for="c in ['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'GBP', 'EUR']" :key="c" :value="c">{{ c }}</option></select></label>
      <label class="label">Annual rate (%)<input v-model="lf.annual_rate" required inputmode="decimal"></label>
      <label class="label">Tenor (months)<input v-model="lf.tenor_months" type="number" min="1" max="360" required></label>
      <label class="label">Repayment<select v-model="lf.repayment_type"><option v-for="(l, k) in RT" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Frequency<select v-model="lf.frequency" :disabled="lf.repayment_type === 'bullet'"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
      <label class="label">Disbursed on<input v-model="lf.disbursed_on" type="date" required></label>
      <label class="label">First payment<input v-model="lf.first_payment_on" type="date" required></label>
      <label class="label">Security<input v-model="lf.security" maxlength="1000" placeholder="e.g. receivables, guarantee"></label>
      <p class="hint">The schedule is generated from these terms: amortising loans repay in equal instalments; interest-only loans repay principal at the end; bullet loans repay everything on the final date.</p>
      <div class="actions"><button class="btn" type="submit">Book loan</button></div>
    </form></AppModal>
    <AppModal :open="!!report" title="Credit report" wide @close="report = ''"><BorrowerCredit v-if="report" :key="report" :borrower-id="report" /></AppModal>
  </section>
</template>

<style scoped>
.cr { display: flex; flex-direction: column; gap: 14px; } .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 760px; } .tools { display: flex; gap: 10px; }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); }
.card { margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .pad { padding: 14px 18px 4px; } .okm { color: var(--c-ok); font-size: 13.5px; margin: 0; } .red { color: var(--c-danger) !important; } .error { color: var(--c-danger); }
h3 { font-size: 15px; margin: 0 0 10px; } h2 { font-size: 18px; margin: 0; } .kl { margin: 10px 0 4px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; } .gh .kl { margin: 0 0 2px; }
.n { font-size: 12px; font-weight: 600; background: #fbf2e1; color: #8a5a07; padding: 1px 7px; margin-left: 6px; }
.strip { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; padding: 0; } .strip > div { padding: 16px 18px; border-left: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .strip > div:first-child { border-left: 0; background: #f6f8fb; } .strip em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .strip b { font-size: 22px; font-weight: 600; color: var(--c-navy); } .strip .sc0 b { font-size: 28px; } .strip small { font-size: 12px; color: var(--c-muted); }
.two { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
.ai { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--c-rule); font: inherit; font-size: 14px; color: var(--c-ink); text-decoration: none; background: none; border-left: 0; border-right: 0; border-bottom: 0; width: 100%; text-align: left; cursor: pointer; } .ai:hover { color: var(--c-blue-deep); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; } .dot.r { background: var(--c-danger); } .dot.a { background: #d9a441; } .dot.b { background: var(--c-blue, #1c547d); }
.cu { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid var(--c-rule); text-decoration: none; color: inherit; font-size: 13.5px; } .cu em, .cd em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .am { white-space: nowrap; }
.charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.wh { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 10px; flex-wrap: wrap; } .wh h2 { margin: 0; font-size: 18px; } .seg2 { margin-left: auto; display: flex; border: 1px solid var(--c-rule-strong); } .seg2 button { font: inherit; font-size: 12.5px; padding: 5px 12px; background: #fff; border: 0; cursor: pointer; color: var(--c-muted); } .seg2 button + button { border-left: 1px solid var(--c-rule-strong); } .seg2 button.on { background: var(--c-navy); color: #fff; }
.pies.sm { margin-bottom: 14px; } .pies { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; } .charts > :only-child { grid-column: 1 / -1; }
.ex { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .ex b { font-weight: 500; text-align: right; }
.grp, .ls { padding: 0; } .gh { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--c-rule); background: #f6f8fb; } .gt { text-align: right; } .gt em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .gt b { font-size: 16px; color: var(--c-navy); }
.lr, .br { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.1fr) 150px minmax(0, 1fr) minmax(0, 1fr) 120px; gap: 14px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--c-rule); text-decoration: none; color: inherit; font-size: 13.5px; } .lr:first-of-type { border-top: 0; } .lr:hover, .br:hover { background: #fafbfc; }
.br { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) auto auto; width: 100%; background: #fff; border-left: 0; border-right: 0; border-bottom: 0; font: inherit; text-align: left; cursor: pointer; }
.lr em, .br em, .lb em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .lb b { font-size: 14.5px; color: var(--c-navy); } .lo b { color: var(--c-navy); }
.lp i { display: block; height: 6px; background: var(--c-paper-2); } .lp s { display: block; height: 100%; background: var(--c-ok); }
.lr[data-b="1-30"] { box-shadow: inset 3px 0 0 #d9a441; } .lr[data-b="31-90"], .lr[data-b="90+"] { box-shadow: inset 3px 0 0 var(--c-danger); } .lr[data-b="closed"] { opacity: .55; }
.pill { justify-self: end; font-size: 12px; padding: 3px 8px; background: #eef7f1; color: #1f6b43; white-space: nowrap; } .pill.late, .pill.warn, .pill.checking, .pill.review { background: #fbf2e1; color: #8a5a07; } .pill.bad, .pill.declined { background: #fdecef; color: var(--c-danger); } .pill.closed, .pill.withdrawn { background: var(--c-paper-2); color: var(--c-muted); } .pill.new { background: #e8eef5; color: var(--c-navy); }
.sc { display: flex; flex-direction: column; align-items: center; min-width: 64px; } .sc b { font-size: 20px; font-weight: 700; } .sc em { font-style: normal; font-size: 12px; color: var(--c-muted); } .sc.g b { color: var(--c-ok); } .sc.b b { color: var(--c-blue-deep); } .sc.a b { color: var(--c-warn); } .sc.r b { color: var(--c-danger); }
.scs { display: flex; gap: 6px; } .scs i { font-style: normal; font-size: 12px; padding: 2px 6px; background: var(--c-paper-2); }
.ub h3 { margin: 0 0 4px; } .ubr { display: grid; grid-template-columns: 110px 1fr auto auto; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 14px; } .ubr .d { color: var(--c-muted); font-size: 13px; } .ubr em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .ubr .a { white-space: nowrap; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); }
.frm { display: grid; gap: 12px 16px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .hint { grid-column: 1 / -1; font-size: 12px; color: var(--c-muted); margin: 0; } .actions { grid-column: 1 / -1; }
input, select { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.frm.mfx { grid-template-columns: 1fr 1fr; align-items: start; }
@media (max-width: 1100px) { .strip { grid-template-columns: 1fr 1fr; } .strip > div:nth-child(3) { border-left: 0; } .two, .charts, .pies { grid-template-columns: 1fr; } .lr { grid-template-columns: minmax(0, 1fr) auto; } .lr .lt, .lr .lp, .lr .ln { display: none; } .br { grid-template-columns: minmax(0, 1fr) auto; } .br .lt, .br .scs { display: none; } .frm.mfx { grid-template-columns: 1fr; } }
</style>
