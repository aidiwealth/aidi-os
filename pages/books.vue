<script setup lang="ts">
// Books: the double-entry journal behind payments & expenses, deployments and wealth fees.
useHead({ title: 'Journals' })
const { data: chk } = await useFetch<{ ok: boolean; checked: { payments: number; deployments: number }; flags: { kind: string; ref: string; text: string; to: string }[] }>('/api/books/check', { key: 'books-check' })
const f = reactive({ entity: '', from: '', to: '' }), view = ref<'journal' | 'balances'>('journal')
const { data } = await useFetch<{ rows: { id: string; entry_date: string; account: string; debit: number; credit: number; currency: string; memo: string | null; entity: string | null; source: string }[]; balances: { entity: string | null; account: string; currency: string; debit: number; credit: number; balance: number }[]; entities: { id: string; name: string }[] }>('/api/books', { query: f, watch: [f] })
const money = (v: number, c: string) => (v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v) : '—')
const totals = computed(() => { const t: Record<string, { d: number; c: number }> = {}; for (const r of data.value?.rows ?? []) { const x = (t[r.currency] ??= { d: 0, c: 0 }); x.d += r.debit; x.c += r.credit } return t })
</script>
<template>
  <section v-if="data">
    <p class="label">Financials</p><h1>Journals</h1><p class="lead">The journal entries behind your payments, deployments and wealth fees. Every entry balances: each debit has a matching credit.</p>
    <div v-if="chk" class="chk" :class="{ bad: !chk.ok }"><b>{{ chk.ok ? '✓ Journals balance' : '⚠ ' + chk.flags.length + ' item' + (chk.flags.length === 1 ? '' : 's') + ' to fix' }}</b><span>{{ chk.ok ? 'Checked ' + chk.checked.payments + ' payments and ' + chk.checked.deployments + ' deployments: every entry balances and matches the amount logged.' : 'These logged items do not match their journal entries:' }}</span>
      <ul v-if="!chk.ok"><li v-for="(x, i) in chk.flags" :key="i"><em>{{ x.kind }}</em> <NuxtLink :to="x.to">{{ x.ref }}</NuxtLink> — {{ x.text }}</li></ul></div>
    <div class="flt"><select v-model="f.entity"><option value="">All entities</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select><label>From <input v-model="f.from" type="date"></label><label>To <input v-model="f.to" type="date"></label>
      <nav class="tabs"><button :class="{ on: view === 'journal' }" @click="view = 'journal'">Journal</button><button :class="{ on: view === 'balances' }" @click="view = 'balances'">Balances by account</button></nav></div>
    <div v-if="view === 'journal'" class="card tc"><table v-if="data.rows.length" class="table"><thead><tr><th>Date</th><th>Entity</th><th>Account</th><th>Source</th><th>Memo</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>
      <tr v-for="j in data.rows" :key="j.id"><td>{{ j.entry_date }}</td><td>{{ j.entity ?? '—' }}</td><td>{{ j.account }}</td><td><span class="src">{{ j.source }}</span></td><td class="mut">{{ j.memo }}</td><td class="n">{{ money(j.debit, j.currency) }}</td><td class="n">{{ money(j.credit, j.currency) }}</td></tr></tbody>
      <tfoot><tr v-for="(t, c) in totals" :key="c"><td colspan="5"><b>Total {{ c }}</b> <span class="mut">{{ Math.abs(t.d - t.c) < 0.01 ? '· balanced' : '· out by ' + money(t.d - t.c, String(c)) }}</span></td><td class="n"><b>{{ money(t.d, String(c)) }}</b></td><td class="n"><b>{{ money(t.c, String(c)) }}</b></td></tr></tfoot></table>
      <EmptyState v-else compact icon="financials" title="No entries yet" text="Log a payment in Payments or a deployment, and its entries appear here." /></div>
    <div v-else class="card tc"><table class="table"><thead><tr><th>Entity</th><th>Account</th><th class="n">Debits</th><th class="n">Credits</th><th class="n">Balance</th></tr></thead><tbody><tr v-for="(b, i) in data.balances" :key="i"><td>{{ b.entity ?? '—' }}</td><td>{{ b.account }}</td><td class="n">{{ money(b.debit, b.currency) }}</td><td class="n">{{ money(b.credit, b.currency) }}</td><td class="n"><b>{{ money(b.balance, b.currency) }}</b></td></tr></tbody></table></div>
  </section>
</template>
<style scoped>
h1 { margin: 0; } .lead { color: var(--c-muted); max-width: 760px; margin: 4px 0 14px; } .flt { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; } .flt select, .flt input { font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); } .flt label { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--c-muted); }
.tabs { display: flex; margin-left: auto; border: 1px solid var(--c-rule); } .tabs button { background: #fff; border: 0; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-muted); } .tabs button.on { background: var(--c-navy); color: #fff; }
.tc { padding: 0; overflow-x: auto; } .table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .table th { text-align: left; padding: 10px 14px; white-space: nowrap; } .table td { padding: 10px 14px; border-top: 1px solid var(--c-rule); } .n { text-align: right; white-space: nowrap; } .mut { color: var(--c-muted); }
.chk { border: 1px solid var(--c-rule); border-left: 3px solid var(--c-ok); background: #fff; padding: 12px 14px; margin-bottom: 14px; font-size: 13.5px; display: flex; flex-direction: column; gap: 4px; } .chk.bad { border-left-color: var(--c-danger); } .chk span { color: var(--c-muted); } .chk ul { margin: 6px 0 0; padding-left: 18px; } .chk em { font-style: normal; font-size: 11.5px; padding: 1px 6px; background: var(--c-paper-2); }
.src { font-size: 11.5px; padding: 1px 7px; background: var(--c-paper-2); } tfoot td { background: var(--c-paper-2); }
</style>
