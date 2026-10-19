<script setup lang="ts">
// Finvry Services → Payments: paid service invoices, old and new, with totals per client. Services only.
useHead({ title: 'Payments received' })
interface P { src: 'invoice' | 'subscription' | 'topup'; id: string; ref: string; client_key: string; client_id: string | null; client: string; currency: string; amount: number; date: string; method: string | null; what: string | null; link: string | null; counted: boolean }
const { data } = await useFetch<{ rows: P[]; platform: boolean }>('/api/services/invoices/payments')
const route = useRoute()
const f = reactive({ view: 'list' as 'list' | 'clients', src: 'all', cur: 'all', year: 'all', client: String(route.query.client ?? '') })
const SRC: Record<string, string> = { invoice: 'Service invoice', subscription: 'Finvry plan', topup: 'Wallet top-up' }
const METHOD: Record<string, string> = { manual: 'Recorded', stripe: 'Card', paystack: 'Paystack', wallet: 'From wallet' }
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v)
const years = computed(() => [...new Set((data.value?.rows ?? []).map((r) => r.date.slice(0, 4)))].sort().reverse())
const clients = computed(() => [...new Map((data.value?.rows ?? []).map((r) => [r.client_key, r.client])).entries()].sort((a, b) => a[1].localeCompare(b[1])))
const rows = computed(() => (data.value?.rows ?? []).filter((r) => (f.src === 'all' || r.src === f.src) && (f.cur === 'all' || r.currency === f.cur) && (f.year === 'all' || r.date.startsWith(f.year)) && (!f.client || r.client_key === f.client)))
const curs = computed(() => [...new Set(rows.value.map((r) => r.currency))].sort().reverse())
const thisYear = String(new Date().getFullYear()), thisMonth = new Date().toISOString().slice(0, 7)
const sum = (list: P[], c: string) => list.filter((r) => r.counted && r.currency === c).reduce((s, r) => s + r.amount, 0)
const kpis = computed(() => curs.value.map((c) => ({ c, all: sum(rows.value, c), year: sum(rows.value.filter((r) => r.date.startsWith(thisYear)), c), month: sum(rows.value.filter((r) => r.date.startsWith(thisMonth)), c), n: rows.value.filter((r) => r.currency === c).length })))
const byClient = computed(() => {
  const m = new Map<string, { key: string; id: string | null; client: string; n: number; last: string; tot: Record<string, number>; wallet: Record<string, number> }>()
  for (const r of rows.value) {
    const x = m.get(r.client_key) ?? { key: r.client_key, id: r.client_id, client: r.client, n: 0, last: '', tot: {}, wallet: {} }
    x.n++; if (r.date > x.last) x.last = r.date
    if (r.counted) x.tot[r.currency] = (x.tot[r.currency] ?? 0) + r.amount; else x.wallet[r.currency] = (x.wallet[r.currency] ?? 0) + r.amount
    m.set(r.client_key, x)
  }
  return [...m.values()].sort((a, b) => (b.tot.USD ?? 0) - (a.tot.USD ?? 0) || (b.tot.NGN ?? 0) - (a.tot.NGN ?? 0))
})
const fmtTot = (t: Record<string, number>) => Object.entries(t).map(([c, v]) => money(v, c)).join(' · ') || '—'
function pick(key: string) { f.client = key; f.view = 'list' }
function csv() {
  const esc = (s: string) => '"' + String(s ?? '').replaceAll('"', '""') + '"'
  const out = ['Date,Client,Type,Reference,For,Method,Amount,Currency,Counted', ...rows.value.map((r) => [r.date, esc(r.client), SRC[r.src], esc(r.ref), esc(r.what ?? ''), METHOD[r.method ?? ''] ?? r.method ?? '', r.amount.toFixed(2), r.currency, r.counted ? 'yes' : 'no (paid from wallet)'].join(','))]
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' })); a.download = 'payments-received.csv'; a.click()
}
</script>
<template>
  <section v-if="data">
    <CsNav />
    <CsBillingTabs />
    <div class="head"><div><h1>Payments received</h1><p class="lead">Every paid service invoice, old and new, including those paid from a client's wallet. Finvry plan payments are under Finvry Platform → Payments.</p></div><button class="btn secondary" @click="csv">Export CSV</button></div>
    <div v-for="k in kpis" :key="k.c" class="fx-stats">
      <StatTile :label="'Received (' + k.c + ')'" :value="money(k.all, k.c)" :note="k.n + ' payments'" icon="money" tone="g" />
      <StatTile :label="'This year (' + k.c + ')'" :value="money(k.year, k.c)" icon="chart" tone="b" />
      <StatTile :label="'This month (' + k.c + ')'" :value="money(k.month, k.c)" icon="check" tone="n" />
    </div>
    <div class="bar">
      <div class="seg"><button :class="{ on: f.view === 'list' }" @click="f.view = 'list'">All payments</button><button :class="{ on: f.view === 'clients' }" @click="f.view = 'clients'">By client</button></div>
      <select v-model="f.client"><option value="">All clients</option><option v-for="[k, n] in clients" :key="k" :value="k">{{ n }}</option></select>
      <select v-model="f.src"><option value="all">All types</option><option v-for="(l, k) in SRC" v-show="data.platform || k === 'invoice'" :key="k" :value="k">{{ l }}</option></select>
      <select v-model="f.year"><option value="all">All years</option><option v-for="y in years" :key="y">{{ y }}</option></select>
      <select v-model="f.cur"><option value="all">All currencies</option><option>USD</option><option>NGN</option></select>
    </div>
    <table v-if="f.view === 'list' && rows.length" class="table"><thead><tr><th>Date</th><th>Client</th><th>For</th><th>Type</th><th>Method</th><th class="n">Amount</th></tr></thead><tbody>
      <tr v-for="r in rows" :key="r.src + r.id" :class="{ dim: !r.counted }"><td class="nw">{{ r.date }}</td>
        <td><NuxtLink v-if="r.client_id" :to="'/services/clients/' + r.client_id">{{ r.client }}</NuxtLink><template v-else>{{ r.client }}</template></td>
        <td><NuxtLink v-if="r.link" :to="r.link" :target="r.src === 'subscription' ? '_blank' : undefined">{{ r.ref }}</NuxtLink><template v-else>{{ r.ref }}</template><span v-if="r.what" class="sub">{{ r.what }}</span></td>
        <td>{{ SRC[r.src] }}</td><td>{{ METHOD[r.method ?? ''] ?? r.method ?? '—' }}<span v-if="!r.counted" class="sub">not counted again</span></td>
        <td class="n"><b>{{ money(r.amount, r.currency) }}</b></td></tr></tbody></table>
    <table v-else-if="f.view === 'clients' && byClient.length" class="table"><thead><tr><th>Client</th><th class="n">Payments</th><th>Last payment</th><th class="n">Total received</th><th class="n">Paid from wallet</th></tr></thead><tbody>
      <tr v-for="c in byClient" :key="c.key" class="click" @click="pick(c.key)"><td><b class="co">{{ c.client }}</b></td><td class="n">{{ c.n }}</td><td>{{ c.last }}</td><td class="n"><b>{{ fmtTot(c.tot) }}</b></td><td class="n dimt">{{ fmtTot(c.wallet) }}</td></tr></tbody></table>
    <EmptyState v-else card icon="billing" title="No payments here" :text="data.rows.length ? 'Try another filter.' : 'Payments appear here as invoices are paid.'" />
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; }
.fx-stats { margin-bottom: 10px; }
.bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: stretch; margin: 6px 0 12px; } .bar select { font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 7px 12px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); } th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-weight: 500; font-size: 12.5px; color: var(--c-muted); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: top; }
td a { color: var(--c-blue-deep); } .co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .n { text-align: right; white-space: nowrap; } .nw { white-space: nowrap; }
tr.dim td { color: var(--c-muted); } .dimt { color: var(--c-muted); } tr.click { cursor: pointer; } tr.click:hover td { background: var(--c-paper-2); }
</style>
