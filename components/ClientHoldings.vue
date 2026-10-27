<script setup lang="ts">
// A wealth client's holdings, charts first: the totals, the mix by type, net worth over time, then each holding with
// its gain or loss as a bar and whether its price is live or needs updating. Staff can add and edit; the client
// portal shows the same view read-only.
const props = defineProps<{ s: Record<string, any>; staff?: boolean }>()
const emit = defineEmits<{ add: []; edit: [h: Record<string, any>] }>()
const money = (v: number | string | null | undefined, c = 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)))
const TYPE: Record<string, string> = { public_securities: 'Stocks & ETFs', private_equity: 'Private companies', real_estate: 'Property', precious_metals: 'Gold & silver', crypto: 'Crypto', cash: 'Cash', bonds: 'Bonds', fund: 'Funds', retirement: 'Retirement', liability: 'Liability', other: 'Other' }
const typeOf = (c: string) => TYPE[c] ?? c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())
const today = new Date().toISOString().slice(0, 10)
const ageDays = (d: string | null) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400e3) : 9999)
const rows = computed(() => (props.s.holdings as Record<string, any>[]).map((h) => {
  const value = Number(h.current_value ?? h.cost ?? 0), cost = h.cost == null ? null : Number(h.cost)
  return { ...h, value, costN: cost, gain: cost != null && cost > 0 ? value - cost : null, stale: !h.live && ageDays(h.as_of) > 45 } as Record<string, any>
}).sort((a, b) => b.value - a.value))
const maxGain = computed(() => Math.max(1, ...rows.value.map((r) => Math.abs(r.gain ?? 0))))
const live = computed(() => rows.value.filter((r) => r.live).length)
const stale = computed(() => rows.value.filter((r) => r.stale).length)
const places = computed(() => new Set(rows.value.map((r) => r.platform || 'Held directly')).size)
const t = computed(() => props.s.totals as { invested: number; cash: number })
// Gain only over holdings with a recorded cost (in US dollars), so uncosted lines don't count as profit.
const known = computed(() => { const k = rows.value.filter((r) => r.gain != null && r.currency === 'USD'); const cost = k.reduce((a, r) => a + r.costN, 0); return { cost, gain: k.reduce((a, r) => a + r.gain, 0) } })
const gainPct = computed(() => (known.value.cost > 0 ? (known.value.gain / known.value.cost) * 100 : null))
// One line holding most of the value, with no breakdown: the mix and the risk can't be read until it is itemised.
const lump = computed(() => { const tot = rows.value.reduce((a, r) => a + (r.currency === 'USD' ? r.value : 0), 0); const top = rows.value.find((r) => r.category === 'other' && r.currency === 'USD'); return top && tot > 0 && top.value / tot >= 0.5 ? { name: top.name, pct: Math.round((top.value / tot) * 100) } : null })
const hist = computed(() => (props.s.history as { m: string; v: number }[] | undefined ?? []).map((x) => ({ label: new Date(x.m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.v })))
const asOf = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'no date')
</script>
<template>
  <div class="chs">
    <div class="kp">
      <div class="k"><span>Total held</span><b>{{ brief(money(t.invested + t.cash)) }}</b><em>{{ rows.length }} holding{{ rows.length === 1 ? '' : 's' }} across {{ places }} place{{ places === 1 ? '' : 's' }}</em></div>
      <div class="k"><span>Gain where cost is known</span><b :class="{ up: known.gain >= 0, dn: known.gain < 0 }">{{ known.cost ? (known.gain >= 0 ? '+' : '−') + brief(money(Math.abs(known.gain))) : '—' }}</b><em>{{ gainPct != null ? (gainPct >= 0 ? '+' : '') + gainPct.toFixed(1) + '% on ' + brief(money(known.cost)) + ' invested' : 'Add costs to see the gain' }}</em></div>
      <div class="k"><span>Priced live</span><b>{{ live }}</b><em>{{ live ? 'at market or spot prices' : 'none yet' }}</em></div>
      <div class="k"><span>Need an update</span><b :class="{ warn: stale }">{{ stale }}</b><em>{{ stale ? 'not valued in the last 45 days' : 'all values are recent' }}</em></div>
    </div>
    <div class="g2">
      <div class="card"><DonutChart title="By type" total-label="Total" currency="USD" :segments="s.by_class" /></div>
      <TrendChart v-if="hist.length >= 2" title="Value over time" sub="Net worth at each month end" :points="hist" unit="usd" />
      <div v-else class="card"><h3>Value over time</h3><p class="mut">The chart builds up month by month from today's values.</p></div>
    </div>
    <p v-if="lump" class="lump">{{ lump.pct }}% sits in one unitemised line ({{ lump.name }}). Break it down to see the real mix and risk.</p>
    <div class="card tc">
      <div class="ch"><h3>Holdings</h3><button v-if="staff" class="btn secondary sm" @click="emit('add')">Add holding</button></div>
      <table v-if="rows.length" class="table" data-nosearch>
        <thead><tr><th>Holding</th><th class="gc">Gain or loss</th><th class="n">Cost</th><th class="n">Value</th><th>Priced</th><th v-if="staff" /></tr></thead>
        <tbody><tr v-for="h in rows" :key="h.id">
          <td><b>{{ h.name }}</b><span class="s">{{ typeOf(h.category) }} · {{ h.platform ?? 'Held directly' }}{{ h.meta?.ounces ? ' · ' + h.meta.ounces + ' oz' : h.meta?.symbol ? ' · ' + h.meta.symbol : '' }}</span></td>
          <td class="gc"><div v-if="h.gain != null" class="gb"><span class="tr"><span class="ax" /><i :class="h.gain >= 0 ? 'pos' : 'neg'" :style="{ width: (Math.abs(h.gain) / maxGain) * 50 + '%' }" /></span><em :class="h.gain >= 0 ? 'up' : 'dn'">{{ h.gain >= 0 ? '+' : '−' }}{{ brief(money(Math.abs(h.gain), h.currency)) }}</em></div><span v-else class="mut">No cost recorded</span></td>
          <td class="n">{{ h.costN != null ? money(h.costN, h.currency) : '—' }}</td><td class="n"><b>{{ money(h.value, h.currency) }}</b></td>
          <td><span v-if="h.live" class="tag live">Live</span><span v-else-if="h.stale" class="tag old">As of {{ asOf(h.as_of) }}</span><span v-else class="tag">As of {{ asOf(h.as_of) }}</span></td>
          <td v-if="staff"><button class="lk" @click="emit('edit', h)">{{ h.stale ? 'Update' : 'Edit' }}</button></td></tr></tbody>
      </table>
      <p v-else class="mut pad">No holdings yet.</p>
    </div>
  </div>
</template>
<style scoped>
.chs { display: flex; flex-direction: column; gap: 12px; }
.kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .k span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { display: block; font-size: 24px; font-weight: 600; margin: 2px 0; } .k em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .card { margin: 0; } .card h3 { margin: 0 0 8px; font-size: 15px; }
.lump { margin: 0; padding: 10px 14px; background: #fff6e6; color: #7a4a06; font-size: 13.5px; }
.tc { padding: 0; overflow-x: auto; } .ch { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; } .ch h3 { margin: 0; }
.table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .table th { text-align: left; padding: 10px 14px; white-space: nowrap; } .table td { padding: 10px 14px; border-top: 1px solid var(--c-rule); vertical-align: middle; }
.n { text-align: right; white-space: nowrap; } .s { display: block; font-size: 12.5px; color: var(--c-muted); } .pad { padding: 14px; margin: 0; } .mut { color: var(--c-muted); font-size: 12.5px; }
.gc { width: 240px; } .gb { display: flex; align-items: center; gap: 8px; } .tr { position: relative; flex: 1; height: 22px; } .gb .ax { position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px solid var(--c-rule-strong); } .gb i { position: absolute; top: 5px; height: 12px; } .gb i.pos { left: 50%; background: var(--c-blue-deep); } .gb i.neg { right: 50%; background: var(--c-danger); }
.gb em { width: 64px; text-align: right; font-style: normal; font-size: 12px; white-space: nowrap; }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .warn { color: var(--c-warn); }
.tag { display: inline-block; font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .tag.live { background: var(--c-blue-deep); color: #fff; } .tag.old { background: #fff6e6; color: #7a4a06; }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; }
@media (max-width: 900px) { .kp { grid-template-columns: 1fr 1fr; } .g2 { grid-template-columns: 1fr; } .gc { display: none; } }
</style>
