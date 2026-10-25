<script setup lang="ts">
// Journals: the double-entry journal behind payments, deployments and wealth fees, with what does not match the bank
// (or the receipts and financial statements) as a short list to act on.
useHead({ title: 'Journals' })
interface Flag { kind: string; ref: string; text: string; to: string; group?: 'not_in_bank' | 'not_logged' | 'other'; date?: string; amount?: number; currency?: string; what?: string }
const { data: chk } = await useFetch<{ ok: boolean; checked: { payments: number; deployments: number }; flags: Flag[] }>('/api/books/check', { key: 'books-check' })
const f = reactive({ entity: '', from: '', to: '' }), view = ref<'journal' | 'balances'>('journal')
const { data } = await useFetch<{ rows: { id: string; entry_date: string; account: string; debit: number; credit: number; currency: string; memo: string | null; entity: string | null; source: string }[]; balances: { entity: string | null; account: string; currency: string; debit: number; credit: number; balance: number }[]; entities: { id: string; name: string }[] }>('/api/books', { query: f, watch: [f] })
const { data: me } = useNuxtData<{ org: { name?: string } | null }>('me')
const money = (v: number, c: string) => (v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v) : '—')
const day = (d: string | undefined) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—')
// The company picker, as in Finvry: the whole group or one company.
const picks = computed(() => [{ value: '', label: (me.value?.org?.name ?? 'All companies'), sub: 'All companies' }, ...(data.value?.entities ?? []).map((e) => ({ value: e.id, label: e.name, sub: 'Company' }))])
const entity = computed({ get: () => f.entity, set: (v: string) => (f.entity = v) })
// To fix: grouped, then a short list (five, or all).
const flags = computed(() => (chk.value?.flags ?? []).map((x) => ({ ...x, group: x.group ?? 'other' as const })))
const counts = computed(() => ({ not_in_bank: flags.value.filter((x) => x.group === 'not_in_bank').length, not_logged: flags.value.filter((x) => x.group === 'not_logged').length, other: flags.value.filter((x) => x.group === 'other').length }))
const fixGroup = ref<'' | 'not_in_bank' | 'not_logged' | 'other'>(''), fixAll = ref(false)
const fixShown = computed(() => flags.value.filter((x) => !fixGroup.value || x.group === fixGroup.value))
const GROUP: Record<string, string> = { not_in_bank: 'payments not found in the bank', not_logged: 'bank payments not logged', other: 'other checks' }
const ACTION: Record<string, string> = { not_in_bank: 'Match', not_logged: 'Log it', other: 'Open' }
// The journal: every source, or one.
const src = ref('')
const sources = computed(() => [...new Set((data.value?.rows ?? []).map((r) => r.source))].sort())
const rows = computed(() => (data.value?.rows ?? []).filter((r) => !src.value || r.source === src.value))
const page = ref(0); watch([src, () => f.entity, () => f.from, () => f.to], () => (page.value = 0))
const totals = computed(() => { const t: Record<string, { d: number; c: number }> = {}; for (const r of rows.value) { const x = (t[r.currency] ??= { d: 0, c: 0 }); x.d += r.debit; x.c += r.credit } return t })
</script>
<template>
  <section v-if="data" class="bk">
    <div class="top">
      <div><div class="eyb">Journals</div><CompanyMenu v-model="entity" :options="picks" :meta="(data.entities.length) + ' companies · double-entry'" menu-label="Journals for" /></div>
      <div class="seg"><button type="button" :class="{ on: view === 'journal' }" @click="view = 'journal'">Journal</button><button type="button" :class="{ on: view === 'balances' }" @click="view = 'balances'">Balances by account</button></div>
    </div>

    <div v-if="chk && !chk.ok" class="panel">
      <div class="issue"><span class="c">{{ flags.length }}</span><span class="t">item{{ flags.length === 1 ? '' : 's' }} to fix before the numbers are relied on</span></div>
      <div class="ib"><button v-for="g in (['not_in_bank', 'not_logged', 'other'] as const)" v-show="counts[g]" :key="g" type="button" :class="{ on: fixGroup === g }" @click="fixGroup = fixGroup === g ? '' : g"><b>{{ counts[g] }}</b><span>{{ GROUP[g] }}</span></button></div>
      <table data-nosearch><thead><tr><th>Date</th><th>What</th><th class="r">Amount</th><th /></tr></thead>
        <tbody><tr v-for="(x, i) in fixShown.slice(0, fixAll ? 500 : 5)" :key="i">
          <td class="mut nw">{{ day(x.date) }}</td>
          <td class="wh"><b>{{ x.what ?? x.ref }}</b><span>{{ x.group === 'not_logged' ? 'Not logged as a payment or deployment' : x.group === 'not_in_bank' ? 'Not in the bank statement for that date' : x.kind + ' · ' + x.text }}</span></td>
          <td class="r num nw">{{ x.amount !== undefined && x.currency ? money(x.amount, x.currency) : '' }}</td>
          <td class="r"><NuxtLink :to="x.to" class="lk">{{ ACTION[x.group] }}</NuxtLink></td></tr></tbody></table>
      <p v-if="fixShown.length > 5" class="more"><button type="button" class="lk" @click="fixAll = !fixAll">{{ fixAll ? 'Show fewer' : 'Show all ' + fixShown.length }}</button></p>
    </div>
    <p v-else-if="chk" class="okl"><i class="dot b" />Journals balance · {{ chk.checked.payments }} payments and {{ chk.checked.deployments }} deployments checked</p>

    <div v-if="view === 'journal'" class="panel">
      <div class="ph"><div class="seg"><button type="button" :class="{ on: !src }" @click="src = ''">All</button><button v-for="s in sources" :key="s" type="button" :class="{ on: src === s }" @click="src = s">{{ s }}</button></div>
        <div class="flt"><label>From<input v-model="f.from" type="date"></label><label>To<input v-model="f.to" type="date"></label></div></div>
      <table data-nosearch v-if="rows.length"><thead><tr><th>Date</th><th>Account</th><th>Memo</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead>
        <tbody><tr v-for="j in rows.slice(page * 50, page * 50 + 50)" :key="j.id"><td class="mut nw">{{ day(j.entry_date) }}</td><td class="wh"><b>{{ j.account }}</b><span>{{ j.entity ?? '—' }}</span></td><td class="mut">{{ j.memo }}</td><td class="r num nw">{{ money(j.debit, j.currency) }}</td><td class="r num nw">{{ money(j.credit, j.currency) }}</td></tr></tbody>
        <tfoot><tr v-for="(t, c) in totals" :key="c"><td colspan="3"><b>Total {{ c }}</b> <span class="mut">{{ Math.abs(t.d - t.c) < 0.01 ? '· balanced' : '· out by ' + money(t.d - t.c, String(c)) }}</span></td><td class="r num nw"><b>{{ money(t.d, String(c)) }}</b></td><td class="r num nw"><b>{{ money(t.c, String(c)) }}</b></td></tr></tfoot></table>
      <p v-else class="none">No entries yet. Log a payment or a deployment and its entries appear here.</p>
      <TablePager v-if="rows.length > 50" v-model="page" :total="rows.length" :size="50" />
    </div>
    <div v-else class="panel"><table data-nosearch><thead><tr><th>Account</th><th class="r">Debits</th><th class="r">Credits</th><th class="r">Balance</th></tr></thead>
      <tbody><tr v-for="(b, i) in data.balances" :key="i"><td class="wh"><b>{{ b.account }}</b><span>{{ b.entity ?? '—' }}</span></td><td class="r num">{{ money(b.debit, b.currency) }}</td><td class="r num">{{ money(b.credit, b.currency) }}</td><td class="r num"><b>{{ money(b.balance, b.currency) }}</b></td></tr></tbody></table>
      <p v-if="!data.balances.length" class="none">No balances yet.</p></div>
  </section>
</template>
<style scoped>
.bk { display: flex; flex-direction: column; gap: 18px; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .eyb { font-size: 13px; color: var(--c-muted); margin-bottom: 6px; }
.panel { background: #fff; border: 1px solid var(--c-rule); }
.ph { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px; flex-wrap: wrap; }
.seg { display: inline-flex; gap: 4px; flex-wrap: wrap; } .seg button { background: none; border: 0; padding: 5px 11px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; }
.top > .seg { background: #fff; border: 1px solid var(--c-rule); padding: 3px; }
.flt { display: flex; gap: 10px; } .flt label { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-muted); } .flt input { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); }
.issue { display: flex; gap: 14px; align-items: baseline; padding: 16px 20px 12px; } .issue .c { font-size: 30px; font-weight: 500; font-variant-numeric: tabular-nums; } .issue .t { font-size: 14px; color: var(--c-ink-soft); }
.ib { display: flex; border-top: 1px solid var(--c-rule); } .ib button { flex: 1; text-align: left; background: #fff; border: 0; border-left: 1px solid var(--c-rule); padding: 12px 20px; font: inherit; cursor: pointer; } .ib button:first-child { border-left: 0; } .ib button.on { background: var(--c-paper-2); } .ib b { display: block; font-size: 20px; font-weight: 500; } .ib span { font-size: 13px; color: var(--c-ink-soft); }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--c-muted); padding: 10px 20px; border-top: 1px solid var(--c-rule); } td { padding: 11px 20px; border-top: 1px solid var(--c-rule); vertical-align: middle; } tfoot td { background: var(--c-paper-2); }
.wh b { font-weight: 500; display: block; } .wh span { font-size: 12.5px; color: var(--c-muted); }
.r { text-align: right; } .num { font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); } .nw { white-space: nowrap; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.more { margin: 0; padding: 10px 20px 14px; border-top: 1px solid var(--c-rule); } .none { padding: 18px 20px; border-top: 1px solid var(--c-rule); color: var(--c-muted); font-size: 13px; margin: 0; text-align: center; }
.okl { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); } .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #5fa8d3; margin-right: 8px; vertical-align: 1px; }
@media (max-width: 760px) { .ib { flex-direction: column; } .ib button { border-left: 0; border-top: 1px solid var(--c-rule); } td:nth-child(3), th:nth-child(3) { display: none; } }
</style>
