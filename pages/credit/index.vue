<script setup lang="ts">
useHead({ title: 'Credit' })
interface Loan { id: string; reference: string | null; borrower: string; sector: string | null; country: string | null; lender: string | null; principal: string; currency: string; annual_rate: string; status: string; disbursed_on: string; outstanding: number; arrears: number; dpd: number; bucket: string; next: { due_date: string; amount: number } | null }
interface Tot { outstanding: number; arrears: number; par30: number; interest12m: number; loans: number }
interface Exp { name: string; totals: Record<string, number> }
const { data, error, refresh } = await useFetch<{ loans: Loan[]; totals: Record<string, Tot>; interestSeries: Record<string, { period: string; value: number }[]>; byBorrower: Exp[]; bySector: Exp[]; byCountry: Exp[] }>('/api/credit')
const { data: borrowers, refresh: refreshB } = await useFetch<{ id: string; name: string }[]>('/api/credit/borrowers')
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const vehicles = computed(() => (entities.value ?? []).filter((e) => ['fund', 'spv', 'holding'].includes(e.kind)))
const money = (v: number | string, c: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, notation: Math.abs(Number(v)) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(Number(v)) >= 1e6 ? 1 : 0 }).format(Number(v))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const currencies = computed(() => Object.keys(data.value?.totals ?? {}).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))))
const pts = (s?: { period: string; value: number }[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const showClosed = ref(false)
const rows = computed(() => (data.value?.loans ?? []).filter((l) => showClosed.value || l.status === 'active'))
const adding = ref<'' | 'borrower' | 'loan'>('')
const bf = reactive({ name: '', country: '', sector: '', contact_name: '', contact_email: '' })
const lf = reactive({ borrower_id: '', lender_entity_id: '', reference: '', principal: '', currency: 'USD', annual_rate: '', tenor_months: '12', repayment_type: 'amortising', frequency: 'monthly', disbursed_on: '', first_payment_on: '', security: '', notes: '' })
const msg = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function addBorrower() { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/credit/borrowers', { method: 'POST', body: bf }); await refreshB(); lf.borrower_id = r.id; adding.value = 'loan' } catch (e) { msg.value = errText(e) } }
async function addLoan() { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/credit/loans', { method: 'POST', body: { ...lf, principal: lf.principal.replace(/[^0-9.]/g, '') } }); await navigateTo('/credit/' + r.id) } catch (e) { msg.value = errText(e) } }
const BUCKET: Record<string, string> = { current: 'Current', '1-30': '1–30 days late', '31-90': '31–90 days late', '90+': '90+ days late' }
const CLOSED: Record<string, string> = { repaid: 'Repaid', written_off: 'Written off', restructured: 'Restructured' }
const RT: Record<string, string> = { amortising: 'Amortising', interest_only: 'Interest only', bullet: 'Bullet' }
void refresh
</script>

<template>
  <section>
    <p class="label">Venture Capital</p>
    <div class="head">
      <h1>Credit</h1>
      <div class="tools"><button class="btn secondary" type="button" @click="adding = adding === 'borrower' ? '' : 'borrower'">New borrower</button><button class="btn" type="button" @click="adding = adding === 'loan' ? '' : 'loan'">Book a loan</button></div>
    </div>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>

    <form v-if="adding === 'borrower'" class="card frm" @submit.prevent="addBorrower">
      <label class="label">Borrower<input v-model="bf.name" required maxlength="200"></label>
      <label class="label">Country<input v-model="bf.country" maxlength="100"></label>
      <label class="label">Sector<input v-model="bf.sector" maxlength="100" placeholder="e.g. Logistics, Fintech"></label>
      <label class="label">Contact<input v-model="bf.contact_name" maxlength="200"></label>
      <label class="label">Contact email<input v-model="bf.contact_email" type="email" maxlength="254"></label>
      <div class="actions"><button class="btn" type="submit">Save borrower</button></div>
    </form>

    <form v-if="adding === 'loan'" class="card frm" @submit.prevent="addLoan">
      <label class="label">Borrower<select v-model="lf.borrower_id" required><option value="" disabled>Choose</option><option v-for="b in borrowers ?? []" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
      <label class="label">Lender<select v-model="lf.lender_entity_id"><option value="">Default vehicle</option><option v-for="v in vehicles.filter((x) => x.name !== 'Aidi Ventures Fund I')" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
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
    </form>

    <p v-if="error" class="error" role="alert">Could not load the credit book.</p>
    <template v-else-if="data">
      <div v-for="c in currencies" :key="c" class="kpis">
        <div class="kpi"><span class="label">Outstanding · {{ c }}</span><b>{{ money(data.totals[c]!.outstanding, c) }}</b><span class="sub">{{ data.totals[c]!.loans }} active loan{{ data.totals[c]!.loans === 1 ? '' : 's' }}</span></div>
        <div class="kpi"><span class="label">In arrears · {{ c }}</span><b :class="{ red: data.totals[c]!.arrears > 0 }">{{ money(data.totals[c]!.arrears, c) }}</b><span class="sub">instalments past due</span></div>
        <div class="kpi"><span class="label">PAR 30 · {{ c }}</span><b :class="{ red: data.totals[c]!.par30 > 0 }">{{ data.totals[c]!.outstanding ? (data.totals[c]!.par30 / data.totals[c]!.outstanding * 100).toFixed(1) + '%' : '—' }}</b><span class="sub">outstanding on loans 30+ days late</span></div>
        <div class="kpi"><span class="label">Interest received · {{ c }}</span><b>{{ money(data.totals[c]!.interest12m, c) }}</b><span class="sub">last 12 months</span></div>
      </div>
      <div v-if="currencies.length" class="charts">
        <TrendChart v-for="c in currencies.slice(0, 2)" :key="c" :title="'Interest received · ' + c" sub="Per month" :points="pts(data.interestSeries[c])" foot="Applied interest-first to instalments" />
        <div class="card"><h3>Exposure by sector</h3><div v-for="e in data.bySector" :key="e.name" class="ex"><span>{{ e.name }}</span><b>{{ Object.entries(e.totals).map(([c, v]) => money(v, c)).join(' · ') }}</b></div><p v-if="!data.bySector.length" class="muted">No exposure.</p>
          <h3 class="mt">By country</h3><div v-for="e in data.byCountry" :key="e.name" class="ex"><span>{{ e.name }}</span><b>{{ Object.entries(e.totals).map(([c, v]) => money(v, c)).join(' · ') }}</b></div></div>
      </div>
      <p v-if="!data.loans.length" class="muted">No loans yet. Add a borrower, then book the loan.</p>
      <table v-else class="table">
        <thead><tr><th>Borrower</th><th>Terms</th><th class="num">Outstanding</th><th>Next payment</th><th>Status</th></tr></thead>
        <tbody><tr v-for="l in rows" :key="l.id" :data-b="l.status === 'active' ? l.bucket : 'closed'">
          <td><NuxtLink :to="'/credit/' + l.id" class="co">{{ l.borrower }}</NuxtLink><span class="sub">{{ [l.reference, l.lender, l.sector].filter(Boolean).join(' · ') }}</span></td>
          <td>{{ money(l.principal, l.currency) }} at {{ Number(l.annual_rate) }}%<span class="sub">disbursed {{ day(l.disbursed_on) }}</span></td>
          <td class="num"><b>{{ l.status === 'active' ? money(l.outstanding, l.currency) : '—' }}</b><span v-if="l.arrears > 0" class="sub red">{{ money(l.arrears, l.currency) }} in arrears</span></td>
          <td>{{ l.next ? day(l.next.due_date) : '—' }}<span v-if="l.next" class="sub">{{ money(l.next.amount, l.currency) }}</span></td>
          <td><span class="st">{{ l.status === 'active' ? BUCKET[l.bucket] : CLOSED[l.status] }}</span><span v-if="l.dpd" class="sub">{{ l.dpd }} days past due</span></td>
        </tr></tbody>
      </table>
      <label v-if="data.loans.some((l) => l.status !== 'active')" class="chk"><input v-model="showClosed" type="checkbox"> Show repaid, written-off and restructured loans</label>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; gap: 12px; flex-wrap: wrap; } .tools { display: flex; gap: 10px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 20px; align-items: end; } .frm label { display: flex; flex-direction: column; gap: 6px; }
.hint { grid-column: 1 / -1; font-size: 12px; color: var(--c-muted); margin: 0; } .actions { grid-column: 1 / -1; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 28px; color: var(--c-navy); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 4px 0 16px; }
h3 { font-family: var(--font-heading); font-weight: 400; font-size: 20px; color: var(--c-navy); margin: 0 0 10px; } .mt { margin-top: 16px; }
.ex { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .ex b { font-weight: 500; }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .num { text-align: right; } .num b { font-weight: 500; color: var(--c-navy); }
tr[data-b="1-30"] td:first-child { box-shadow: inset 3px 0 0 var(--c-warn); } tr[data-b="31-90"] td:first-child, tr[data-b="90+"] td:first-child { box-shadow: inset 3px 0 0 var(--c-danger); }
tr[data-b="closed"] td { opacity: .55; }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
tr[data-b="1-30"] .st { color: var(--c-warn); } tr[data-b="31-90"] .st, tr[data-b="90+"] .st { color: var(--c-danger); font-weight: 500; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); margin-top: 10px; }
.red { color: var(--c-danger) !important; } .muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .charts, .frm { grid-template-columns: 1fr; } }
</style>
