<script setup lang="ts">
// Finvry Platform → Payments: what customers paid for the platform (plan invoices, renewals) and wallet top-ups.
useHead({ title: 'Finvry · Payments' })
interface P { src: 'plan' | 'topup'; id: string; ref: string; organization_id: string; customer: string; currency: string; amount: number; date: string; method: string | null; what: string | null }
const { data } = await useFetch<{ rows: P[] }>('/api/platform/payments-received')
const f = reactive({ src: 'all', cur: 'all', year: 'all', org: '' })
const SRC: Record<string, string> = { plan: 'Plan invoice', topup: 'Wallet top-up' }
const METHOD: Record<string, string> = { manual: 'Recorded', stripe: 'Card', paystack: 'Paystack', wallet: 'From wallet', bank: 'Bank transfer' }
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v)
const rows = computed(() => (data.value?.rows ?? []).filter((r) => (f.src === 'all' || r.src === f.src) && (f.cur === 'all' || r.currency === f.cur) && (f.year === 'all' || r.date.startsWith(f.year)) && (!f.org || r.organization_id === f.org)))
const years = computed(() => [...new Set((data.value?.rows ?? []).map((r) => r.date.slice(0, 4)))].sort().reverse())
const orgs = computed(() => [...new Map((data.value?.rows ?? []).map((r) => [r.organization_id, r.customer])).entries()].sort((a, b) => a[1].localeCompare(b[1])))
const curs = computed(() => [...new Set(rows.value.map((r) => r.currency))].sort().reverse())
const thisYear = String(new Date().getFullYear()), thisMonth = new Date().toISOString().slice(0, 7)
// A plan invoice paid from the wallet is listed, but the top-up that funded it is the money received.
const counted = (r: P) => !(r.src === 'plan' && r.method === 'wallet')
const sum = (list: P[], c: string) => list.filter((r) => counted(r) && r.currency === c).reduce((s, r) => s + r.amount, 0)
const kpis = computed(() => curs.value.map((c) => ({ c, all: sum(rows.value, c), year: sum(rows.value.filter((r) => r.date.startsWith(thisYear)), c), month: sum(rows.value.filter((r) => r.date.startsWith(thisMonth)), c) })))
</script>
<template>
  <section v-if="data">
    <div class="head"><div><p class="eyebrow">Finvry Platform</p><h1>Payments</h1><p class="lead">What customers paid for the platform: plan invoices and renewals, and wallet top-ups. Service payments are under Finvry Services → Payments.</p></div></div>
    <div v-for="k in kpis" :key="k.c" class="kp"><div><span>All time · {{ k.c }}</span><b>{{ money(k.all, k.c) }}</b></div><div><span>This year</span><b>{{ money(k.year, k.c) }}</b></div><div><span>This month</span><b>{{ money(k.month, k.c) }}</b></div></div>
    <div class="flt">
      <select v-model="f.src" aria-label="Type"><option value="all">All types</option><option v-for="(l, k) in SRC" :key="k" :value="k">{{ l }}</option></select>
      <select v-model="f.cur" aria-label="Currency"><option value="all">All currencies</option><option v-for="c in ['USD', 'NGN']" :key="c" :value="c">{{ c }}</option></select>
      <select v-model="f.year" aria-label="Year"><option value="all">All years</option><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select>
      <select v-model="f.org" aria-label="Customer"><option value="">All customers</option><option v-for="[id, n] in orgs" :key="id" :value="id">{{ n }}</option></select>
    </div>
    <div v-if="rows.length" class="card flat"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Reference</th><th>Method</th><th class="num">Amount</th></tr></thead>
      <tbody><tr v-for="r in rows" :key="r.src + r.id"><td>{{ r.date }}</td><td><NuxtLink :to="'/platform/customers/' + r.organization_id">{{ r.customer }}</NuxtLink></td><td>{{ SRC[r.src] }}<span v-if="r.what && r.src === 'plan'" class="sub">{{ r.what }}</span></td>
        <td><NuxtLink v-if="r.src === 'plan'" :to="{ path: '/platform/billing', query: { tab: 'inv', org: r.organization_id } }">{{ r.ref }}</NuxtLink><template v-else>{{ r.ref }}</template></td><td>{{ METHOD[r.method ?? ''] ?? r.method ?? '—' }}</td>
        <td class="num" :class="{ mut: !counted(r) }">{{ money(r.amount, r.currency) }}</td></tr></tbody></table></div>
    <EmptyState v-else card icon="billing" title="No payments yet" text="Paid plan invoices and wallet top-ups show here." />
  </section>
</template>
<style scoped>
.head { margin-bottom: 14px; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .head h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); font-size: 14px; max-width: 760px; }
.kp { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--c-rule); background: #fff; margin-bottom: 12px; } .kp > div { padding: 12px 16px; border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; } .kp > div:last-child { border-right: 0; }
.kp span { font-size: 13px; font-weight: 500; color: var(--c-muted); } .kp b { font-family: var(--font-heading); font-size: 24px; font-weight: 500; color: var(--c-navy); }
.flt { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; } .flt select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .num { text-align: right; } .mut { color: var(--c-muted); }
</style>
