<script setup lang="ts">
// Finance room: wallet float and movements across every workspace; credit or debit a wallet.
useHead({ title: 'Finance · Finvry' })
const f = reactive({ kind: 'all', category: 'all', currency: 'all', org: '' })
interface T { currency: string; float_minor: number; topups_minor: number; debits_minor: number; credits_minor: number }
interface E { id: string; created_at: string; workspace: string; organization_id: string; kind: string; category: string; reason: string; currency: string; amount_minor: number; balance_after_minor: number; by: string | null }
const { data, refresh } = await useFetch<{ totals: T[]; ledger: E[]; workspaces: { id: string; name: string; currency: string; balance_minor: number }[] }>('/api/platform/finance', { query: f, watch: [f] })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const m = (v: number, c: string) => (SYM[c] ?? '') + (v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CAT: Record<string, string> = { topup: 'Top-up', admin_credit: 'Credit', admin_debit: 'Debit', service: 'Service', subscription: 'Subscription', refund: 'Refund' }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const adj = reactive({ open: false, organization_id: '', direction: 'credit', amount: '' as string | number, reason: '', refund: false })
const ws = computed(() => data.value?.workspaces.find((x) => x.id === adj.organization_id))
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function openAdj(orgId = '') { Object.assign(adj, { open: true, organization_id: orgId, direction: 'credit', amount: '', reason: '', refund: false }); msg.value = '' }
async function save() { busy.value = true; msg.value = ''; try { await $fetch('/api/platform/wallets/adjust', { method: 'POST', body: adj }); adj.open = false; ok.value = 'Wallet updated.'; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not update the wallet.' } finally { busy.value = false } }
function csv() { const rows = data.value?.ledger ?? []; const esc = (s: string) => '"' + s.replaceAll('"', '""') + '"'; const out = ['When,Workspace,Type,Category,Description,Amount,Currency,Balance after', ...rows.map((e) => [e.created_at, esc(e.workspace), e.kind, e.category, esc(e.reason), (e.kind === 'debit' ? '-' : '') + (e.amount_minor / 100).toFixed(2), e.currency, (e.balance_after_minor / 100).toFixed(2)].join(','))].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/csv' })); a.download = 'finvry-ledger.csv'; a.click() }
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><p class="label">Finvry console</p><h1>Finance</h1><p class="lead">Every top-up, credit and debit across customer wallets.</p></div><button class="btn" @click="openAdj()">Credit or debit a wallet</button></div>
    <p v-if="ok" class="ok">{{ ok }}</p>
    <div v-for="t in data.totals" :key="t.currency" class="sum"><span class="cur">{{ t.currency }}</span>
      <div class="sc"><span>Wallet float</span><b>{{ m(t.float_minor, t.currency) }}</b><em>held for customers</em></div>
      <div class="sc"><span>Top-ups this month</span><b class="pos">+{{ m(t.topups_minor, t.currency) }}</b></div>
      <div class="sc"><span>Debits this month</span><b class="neg">−{{ m(t.debits_minor, t.currency) }}</b><em>services and subscriptions</em></div>
      <div class="sc"><span>Credits given this month</span><b>{{ m(t.credits_minor, t.currency) }}</b></div></div>
    <div class="bar"><div class="seg"><button v-for="[k, l] in [['all', 'All'], ['credit', 'Money in'], ['debit', 'Debits']]" :key="k" :class="{ on: f.kind === k }" @click="f.kind = k">{{ l }}</button></div>
      <select v-model="f.category"><option value="all">All categories</option><option v-for="(l, k) in CAT" :key="k" :value="k">{{ l }}</option></select>
      <select v-model="f.currency"><option value="all">All currencies</option><option>USD</option><option>NGN</option></select>
      <select v-model="f.org"><option value="">All workspaces</option><option v-for="w in data.workspaces" :key="w.id" :value="w.id">{{ w.name }}</option></select>
      <button class="btn secondary" @click="csv">Export CSV</button></div>
    <div class="box"><table v-if="data.ledger.length"><thead><tr><th>When</th><th>Workspace</th><th>Category</th><th>Description</th><th class="n">Amount</th><th class="n">Balance after</th></tr></thead>
      <tbody><tr v-for="e in data.ledger" :key="e.id"><td class="dim">{{ when(e.created_at) }}</td><td><button class="lk" @click="openAdj(e.organization_id)">{{ e.workspace }}</button></td><td><span class="cat" :class="e.category">{{ CAT[e.category] ?? e.category }}</span></td><td>{{ e.reason }}<span v-if="e.by" class="dim"> · {{ e.by }}</span></td>
        <td class="n" :class="e.kind === 'credit' ? 'pos' : 'neg'">{{ e.kind === 'credit' ? '+' : '−' }}{{ m(e.amount_minor, e.currency) }}</td><td class="n dim">{{ m(e.balance_after_minor, e.currency) }}</td></tr></tbody></table>
      <p v-else class="none">No wallet activity yet.</p></div>
    <h2>Wallets</h2>
    <div class="box"><table><tbody><tr v-for="w in data.workspaces" :key="w.id"><td>{{ w.name }}</td><td class="n"><b>{{ m(w.balance_minor, w.currency) }}</b></td><td class="n"><button class="lk" @click="openAdj(w.id)">Credit / debit</button></td></tr></tbody></table></div>
    <AppModal :open="adj.open" title="Credit or debit a wallet" @close="adj.open = false">
      <form id="adjf" class="frm" @submit.prevent="save">
        <label class="label">Workspace<select v-model="adj.organization_id" required><option value="" disabled>Choose</option><option v-for="w in data.workspaces" :key="w.id" :value="w.id">{{ w.name }} · {{ m(w.balance_minor, w.currency) }}</option></select></label>
        <div class="seg big"><button type="button" :class="{ on: adj.direction === 'credit' }" @click="adj.direction = 'credit'">Credit (add)</button><button type="button" :class="{ on: adj.direction === 'debit' }" @click="adj.direction = 'debit'">Debit (remove)</button></div>
        <label class="label">Amount ({{ ws?.currency ?? 'currency' }})<input v-model="adj.amount" inputmode="decimal" required></label>
        <label v-if="adj.direction === 'credit'" class="chk"><input v-model="adj.refund" type="checkbox"> This is a refund</label>
        <label class="label">Reason (shown to the customer)<input v-model="adj.reason" required maxlength="300" placeholder="e.g. Goodwill credit for delayed filing"></label>
        <p v-if="msg" class="error">{{ msg }}</p></form>
      <template #foot><button class="btn secondary" @click="adj.open = false">Cancel</button><button class="btn" type="submit" form="adjf" :disabled="busy">{{ adj.direction === 'credit' ? 'Credit wallet' : 'Debit wallet' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; } .hd h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; }
.sum { display: grid; grid-template-columns: 60px repeat(4, 1fr); gap: 10px; margin-bottom: 10px; align-items: stretch; } .cur { display: grid; place-items: center; background: var(--c-navy); color: #fff; font-weight: 600; letter-spacing: .06em; }
.sc { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; } .sc span { font-size: 12.5px; color: var(--c-muted); } .sc b { font-size: 22px; font-weight: 600; } .sc em { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
.pos { color: var(--c-ok); } .neg { color: var(--c-danger); } .bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 10px; align-items: center; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 8px 14px; font: inherit; font-size: 13px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; } .seg.big button { flex: 1; padding: 10px; }
select, input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; margin-bottom: 18px; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .dim { color: var(--c-muted); }
.cat { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); } .cat.topup, .cat.admin_credit, .cat.refund { background: rgba(31,122,77,.1); color: var(--c-ok); } .cat.service, .cat.subscription { background: var(--c-signal-soft); color: var(--c-blue-deep); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } h2 { font-size: 20px; margin: 10px 0 10px; } .none { padding: 18px; color: var(--c-muted); margin: 0; }
.frm { display: flex; flex-direction: column; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 1000px) { .sum { grid-template-columns: 1fr 1fr; } .cur { grid-column: 1 / -1; padding: 6px; } }
</style>
