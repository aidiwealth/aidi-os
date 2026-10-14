<script setup lang="ts">
// A read-only cap table: totals, holders by class with fully diluted ownership, ownership chart, SAFEs and notes.
import { table, type Data } from '~/shared/captable'
const props = defineProps<{ data: Data }>()
const today = new Date().toISOString().slice(0, 10)
const t = computed(() => table(props.data, today))
const n = (v: number) => Math.round(v).toLocaleString('en-US'), pct = (v: number) => (Math.round(v * 100) / 100).toFixed(2) + '%'
const KIND: Record<string, string> = { founder: 'Founder', employee: 'Employee', advisor: 'Advisor', investor: 'Investor', other: 'Other' }
const mix = computed(() => { const m: Record<string, number> = {}; for (const r of t.value.rows) m[KIND[r.holder.kind] ?? 'Other'] = (m[KIND[r.holder.kind] ?? 'Other'] ?? 0) + r.fd; if (t.value.pool) m['Option pool (available)'] = t.value.pool; return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) })
const conv = computed(() => props.data.convertibles.filter((c) => c.status === 'outstanding'))
const hn = (id: string) => props.data.holders.find((h) => h.id === id)?.name ?? '—'
const money = (v: number | null, c = 'USD') => (v === null ? '—' : briefMoney(v, c))
</script>
<template>
  <div class="cs">
    <div class="fx-stats"><StatTile label="Fully diluted shares" :value="n(t.fd)" full /><StatTile label="Shares issued" :value="n(t.issued)" full /><StatTile label="Option pool available" :value="n(t.pool)" :note="n(t.granted) + ' granted'" full /><StatTile label="SAFEs and notes" :value="money(conv.reduce((s, c) => s + c.amount, 0), conv[0]?.currency ?? 'USD')" :note="conv.length + ' outstanding'" /></div>
    <div class="two"><div class="card pad0"><table class="t" data-nosearch><thead><tr><th>Holder</th><th v-for="c in data.classes" :key="c.id" class="r">{{ c.name }}</th><th class="r">Options</th><th class="r">Fully diluted</th><th class="r">% FD</th></tr></thead>
      <tbody><tr v-for="r in t.rows" :key="r.holder.id"><td><b>{{ r.holder.name }}</b><span class="sub">{{ KIND[r.holder.kind] }}</span></td><td v-for="c in data.classes" :key="c.id" class="r">{{ r.byClass[c.id] ? n(r.byClass[c.id]!) : '—' }}</td><td class="r">{{ r.options ? n(r.options) : '—' }}</td><td class="r">{{ n(r.fd) }}</td><td class="r b">{{ pct(r.pctFd) }}</td></tr>
        <tr v-if="t.pool" class="mut"><td>Option pool (available)</td><td v-for="c in data.classes" :key="c.id" /><td class="r">{{ n(t.pool) }}</td><td class="r">{{ n(t.pool) }}</td><td class="r">{{ pct(t.pool / t.fd * 100) }}</td></tr>
        <tr class="tot"><td>Total</td><td v-for="c in data.classes" :key="c.id" class="r">{{ n(data.issuances.filter((i) => i.class_id === c.id).reduce((s, i) => s + i.shares, 0)) }}</td><td class="r">{{ n(t.granted + t.pool) }}</td><td class="r">{{ n(t.fd) }}</td><td class="r">100%</td></tr></tbody></table></div>
      <div class="card"><DonutChart title="Ownership, fully diluted" total-label="Shares" :segments="mix" /></div></div>
    <div v-if="conv.length" class="card pad0"><div class="ch"><h3>SAFEs and convertible notes</h3><span class="mut">Not in the percentages until they convert</span></div>
      <table class="t" data-nosearch><thead><tr><th>Investor</th><th>Type</th><th class="r">Amount</th><th class="r">Valuation cap</th><th class="r">Discount</th><th>Dated</th></tr></thead>
        <tbody><tr v-for="c in conv" :key="c.id"><td>{{ hn(c.holder_id) }}</td><td>{{ c.kind === 'safe' ? (c.post_money ? 'Post-money SAFE' : 'Pre-money SAFE') : 'Convertible note' + (c.interest_pct ? ' · ' + c.interest_pct + '%' : '') }}</td><td class="r">{{ money(c.amount, c.currency) }}</td><td class="r">{{ money(c.valuation_cap, c.currency) }}</td><td class="r">{{ c.discount_pct ? c.discount_pct + '%' : '—' }}</td><td>{{ c.issued_on }}</td></tr></tbody></table></div>
  </div>
</template>
<style scoped>
.cs { display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%; } .cs > * { min-width: 0; } .two { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; } @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
.pad0 { padding: 0; overflow-x: auto; } .ch { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--c-rule); gap: 10px; flex-wrap: wrap; } .ch h3 { margin: 0; font-size: 15px; } .mut { color: var(--c-muted); font-size: 12.5px; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 9px 12px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .t td { padding: 9px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; font-variant-numeric: tabular-nums; } .t .r { text-align: right; } .t .b { font-weight: 600; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } tr.mut td { color: var(--c-muted); } tr.tot td { font-weight: 600; background: #fbfaf7; }
</style>
