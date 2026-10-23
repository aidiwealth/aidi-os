<script setup lang="ts">
// Venture & Business Stage Monitor: where the company stands now (funding and operating stage, health, runway), when it
// becomes default alive, how ready it is for equity or debt, what would move it up, and who could fund it.
import type { Alive, Score, Mo } from '~/shared/stage'
useHead({ title: 'Stage monitor' })
interface Prov { id: string; name: string; kind: string; instrument: 'equity' | 'debt' | 'grant'; countries: string[]; stages: string[]; sectors: string[]; ticket_min: number | null; ticket_max: number | null; currency: string; criteria: string | null; link: string | null; affiliate: boolean; fit: number }
interface D { company: string; currency: string; region: string; region_label: string; tier: number; country: string | null; as_of: string | null
  funding: { key: string; label: string; basis: string }; operating: { key: string; label: string; arr_usd: number; basis: string }; health: { key: string; label: string; note: string }
  runway: { months: number | null; cash_out: string | null; burn: number | null; cash: number | null; cash_at: string | null; basis: string; cut_monthly?: number; if_cut?: number | null }
  alive: Alive | null; months: Mo[]; cap: { name: string; fully_diluted: number; pool_available: number; by_kind: { kind: string; pct: number }[]; safes: number; raised_usd: number } | null
  equity: Score | null; debt: Score | null; moves: { of: string; label: string; fix: string | null; to: string | null; gain: number }[]
  history: { period: string; funding_stage: string; operating_stage: string; health: string; runway: string | null; equity_score: number | null; debt_score: number | null }[]
  providers: Prov[] | null; can_pipeline: boolean }
const { sf, cust } = await useCoScope()
const { data, error, refresh } = await useFetch<D>('/api/stage', { query: computed(() => ({ cust: cust.value })) })
const d = computed(() => data.value)
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, d.value?.currency ?? 'USD'))
const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, 'USD'))
const mon = (ym: string | null | undefined) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const tone = computed(() => ({ profitable: 'good', default_alive: 'good', fixable: 'watch', default_dead: 'watch', struggling: 'risk', critical: 'risk', unknown: 'watch' } as Record<string, string>)[d.value?.health.key ?? 'unknown'])
// The last twelve months and the projection, in the forecast chart's shape.
const chart = computed(() => ({
  actual: (d.value?.months ?? []).slice(-12).map((x) => ({ month: x.month, revenue: Math.max(0, x.revenue ?? 0), costs: Math.max(0, x.expenses ?? 0), cash: x.cash })),
  forecast: (d.value?.alive?.series ?? []).slice(0, 24).map((x) => ({ month: x.month, revenue: Math.max(0, x.revenue), costs: Math.max(0, x.expenses), cash: x.cash })) }))
const tab = ref<'equity' | 'debt' | 'grant'>((['equity', 'debt', 'grant'] as const).find((t) => (data.value?.providers ?? []).some((p) => p.instrument === t)) ?? 'equity')
const provs = computed(() => (d.value?.providers ?? []).filter((p) => p.instrument === tab.value))
const KIND: Record<string, string> = { vc: 'Venture fund', angel_network: 'Angel network', accelerator: 'Accelerator', grant: 'Grant', bank: 'Bank', venture_debt: 'Venture debt', revenue_based: 'Revenue-based finance', dfi: 'Development finance', government: 'Government programme', other: 'Investor' }
const STG: Record<string, string> = { pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', growth: 'Growth', bootstrapped: 'Bootstrapped' }
const ticket = (p: Prov) => (p.ticket_min === null && p.ticket_max === null ? '' : (p.ticket_min !== null ? briefMoney(p.ticket_min, p.currency) : '') + (p.ticket_max !== null ? '–' + briefMoney(p.ticket_max, p.currency) : '+'))
const busy = ref(''), msg = ref(''), ok = ref('')
async function toPipeline(p: Prov) {
  busy.value = p.id; msg.value = ''; ok.value = ''
  try { const r = await sf<{ message: string }>('/api/stage/pipeline', { method: 'POST', body: { provider_id: p.id } }); ok.value = r.message }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add it.' } finally { busy.value = '' }
}
const HL: Record<string, string> = { profitable: 'Profitable', default_alive: 'Default alive', fixable: 'Fixable', default_dead: 'Default dead', struggling: 'Struggling', critical: 'Critical', unknown: '—' }
const KINDS: Record<string, string> = { founder: 'Founders', investor: 'Investors', employee: 'Team', advisor: 'Advisers', other: 'Others' }
const last6 = computed(() => (d.value?.months ?? []).slice(-6))
</script>
<template>
  <section class="sm">
    <div class="hd"><div><h1>Stage monitor</h1><ScopeSwitch /><p class="lead">Where {{ d?.company ?? 'your company' }} stands today, worked out from your Financials, bank and cap table{{ d?.as_of ? ' (latest month ' + mon(d.as_of) + ')' : '' }}. It updates when your figures do.</p></div>
      <button class="btn secondary" @click="refresh()">Refresh</button></div>
    <p v-if="error" class="error">Could not load the stage monitor.</p>
    <template v-if="d">
      <div class="fx-stats">
        <StatTile label="Funding stage" :value="d.funding.label" :note="d.cap ? 'About ' + usd(d.cap.raised_usd) + ' raised' : 'From your cap table'" full />
        <StatTile label="Operating stage" :value="d.operating.label" :note="usd(d.operating.arr_usd) + ' annual run rate'" full />
        <StatTile label="Health" :value="d.health.label" :red="tone === 'risk'" full />
        <StatTile label="Runway" :value="d.runway.months === null ? '—' : d.runway.months >= 120 ? '10 years +' : d.runway.months + ' months'" :note="d.runway.cash_out ? 'Cash runs out ' + mon(d.runway.cash_out) : d.runway.burn === 0 ? 'Not burning cash' : 'Add statements to see it'" :red="(d.runway.months ?? 99) < 6" full />
      </div>
      <div class="hb" :class="tone"><b>{{ d.health.label }}.</b> {{ d.health.note }}
        <template v-if="d.alive"> {{ d.alive.cross ? 'Carrying revenue forward at ' + (d.alive.rev_growth ?? 0) + '% a month and costs at ' + (d.alive.exp_growth ?? 0) + '% a month (the last three months\' trend, within sensible limits), revenue overtakes costs in ' + mon(d.alive.cross) + (d.alive.zero && d.alive.zero > d.alive.cross ? '' : d.alive.zero ? ', after the cash runs out in ' + mon(d.alive.zero) : '') + '.' : 'At today\'s trends revenue does not overtake costs in the next three years: the gap is ' + m(d.alive.shortfall) + ' a month by then.' }}</template></div>

      <div class="card"><div class="ch"><h2>Default alive?</h2><span class="mut">Last 12 months, then revenue and costs carried forward at their last three months' trend{{ d.alive?.zero ? '; cash runs out ' + mon(d.alive.zero) : '' }}.</span></div>
        <ForecastChart v-if="d.alive" :actual="chart.actual" :forecast="chart.forecast" :currency="d.currency" />
        <p v-else class="mut">Add at least three months of statements and a cash balance under <NuxtLink to="/financials">Financials</NuxtLink> to see this.</p></div>

      <div class="two">
        <div class="card"><div class="ch"><h2>Financials</h2><NuxtLink to="/financials" class="lk">Open</NuxtLink></div>
          <table v-if="last6.length" class="t" data-nosearch><thead><tr><th>{{ d.currency }}</th><th v-for="x in last6" :key="x.month" class="r">{{ mon(x.month) }}</th></tr></thead>
            <tbody><tr><td>Revenue</td><td v-for="x in last6" :key="x.month" class="r">{{ m(x.revenue) }}</td></tr><tr><td>Costs</td><td v-for="x in last6" :key="x.month" class="r">{{ m(x.expenses) }}</td></tr>
              <tr><td>Gross margin</td><td v-for="x in last6" :key="x.month" class="r">{{ x.gross_margin === null ? '—' : x.gross_margin + '%' }}</td></tr><tr><td>Net income</td><td v-for="x in last6" :key="x.month" class="r" :class="{ neg: (x.net ?? 0) < 0 }">{{ m(x.net) }}</td></tr>
              <tr><td>Cash</td><td v-for="x in last6" :key="x.month" class="r">{{ m(x.cash) }}</td></tr></tbody></table>
          <p v-else class="mut">No monthly statements yet.</p>
          <p v-if="d.runway.cut_monthly" class="mut sm2">Cancelling the payments marked in <NuxtLink to="/treasury?t=cut">Banking</NuxtLink> saves {{ m(d.runway.cut_monthly) }} a month{{ d.runway.if_cut ? ' and stretches runway to ' + d.runway.if_cut + ' months' : ' and ends the burn' }}.</p>
          <p v-if="d.runway.burn !== null" class="mut sm2">Burn {{ m(d.runway.burn) }} a month ({{ d.runway.basis }}) · cash {{ m(d.runway.cash) }}{{ d.runway.cash_at ? ' at ' + d.runway.cash_at : '' }}</p></div>
        <div class="card"><div class="ch"><h2>Cap table</h2><NuxtLink to="/cap-table" class="lk">Open</NuxtLink></div>
          <template v-if="d.cap"><p class="mut sm2">{{ d.cap.name }} · {{ d.cap.fully_diluted.toLocaleString('en-US') }} shares fully diluted · {{ d.cap.safes }} SAFE{{ d.cap.safes === 1 ? '' : 's' }} or notes outstanding</p>
            <div v-for="k in d.cap.by_kind" :key="k.kind" class="bar"><span>{{ KINDS[k.kind] ?? k.kind }}</span><i><em :style="{ width: Math.min(100, k.pct) + '%' }" /></i><b>{{ k.pct }}%</b></div>
            <p class="mut sm2">{{ d.funding.basis }}.</p></template>
          <p v-else class="mut">No cap table yet. <NuxtLink to="/cap-table">Set it up</NuxtLink> to see your funding stage.</p></div>
      </div>

      <div class="card"><div class="ch"><h2>Readiness</h2><span class="mut">How ready you look to raise equity or borrow, out of 100.</span></div>
        <div v-if="d.equity && d.debt" class="sc">
          <div v-for="[nm, s] in ([['Equity (raising from investors)', d.equity], ['Debt (borrowing)', d.debt]] as const)" :key="nm" class="sco"><div class="sh"><span>{{ nm }}</span><b>{{ s.total }}</b><em>{{ s.likelihood }}</em></div>
            <div v-for="p in s.parts" :key="p.key" class="pt"><div><span>{{ p.label }}</span><small>{{ p.detail }}</small></div><i><em :style="{ width: p.score * 100 + '%' }" /></i></div></div>
        </div>
        <p v-else class="up">Readiness scores are on the Medium and Scale plans. <NuxtLink to="/settings?s=plan">See plans</NuxtLink></p>
        <div v-if="d.moves.length" class="mv"><h3>What moves you up</h3><ol><li v-for="x in d.moves" :key="x.of + x.label"><NuxtLink v-if="x.to" :to="x.to">{{ x.fix }}</NuxtLink><span v-else>{{ x.fix }}</span><em>+{{ x.gain }} {{ x.of.toLowerCase() }}</em></li></ol></div></div>

      <div class="card"><div class="ch"><h2>Who could fund you</h2><span class="mut">Matched to {{ d.country || 'your country' }}, the round you would raise next and your sector.</span></div>
        <template v-if="d.providers">
          <div class="seg"><button v-for="t in (['equity', 'debt', 'grant'] as const)" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t === 'equity' ? 'Equity' : t === 'debt' ? 'Debt' : 'Grants' }} · {{ d.providers.filter((p) => p.instrument === t).length }}</button></div>
          <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
          <table v-if="provs.length" class="t pv" data-nosearch><thead><tr><th>Provider</th><th>Invests in</th><th>Cheque</th><th>What they look for</th><th /></tr></thead>
            <tbody><tr v-for="p in provs" :key="p.id"><td><b>{{ p.name }}</b><span v-if="p.affiliate" class="chip">Aidi affiliate</span><small>{{ KIND[p.kind] }}</small></td><td>{{ (p.countries.length ? p.countries.join(', ') : 'Global') }}<small>{{ p.stages.map((x) => STG[x] ?? x).join(', ') || 'Any stage' }}{{ p.sectors.length ? ' · ' + p.sectors.join(', ') : '' }}</small></td>
              <td>{{ ticket(p) || '—' }}</td><td class="cr">{{ p.criteria || '—' }}<a v-if="p.link" :href="p.link" target="_blank" rel="noopener" class="lk">Website</a></td>
              <td><button v-if="d.can_pipeline" class="btn secondary sm" :disabled="busy === p.id" @click="toPipeline(p)">{{ busy === p.id ? 'Adding…' : 'Add to pipeline' }}</button></td></tr></tbody></table>
          <p v-else class="mut">No {{ tab === 'grant' ? 'grant providers' : tab + ' providers' }} matched yet. The Finvry team adds more every week.</p>
        </template>
        <p v-else class="up">Matched investors, lenders and grants are on the Scale plan. <NuxtLink to="/settings?s=plan">See plans</NuxtLink></p></div>

      <div v-if="d.history.length > 1" class="card"><div class="ch"><h2>History</h2><span class="mut">One snapshot a month.</span></div>
        <table class="t" data-nosearch><thead><tr><th>Month</th><th>Funding</th><th>Operating</th><th>Health</th><th class="r">Runway</th><th v-if="d.tier >= 2" class="r">Equity</th><th v-if="d.tier >= 2" class="r">Debt</th></tr></thead>
          <tbody><tr v-for="h in [...d.history].reverse()" :key="h.period"><td>{{ mon(h.period) }}</td><td>{{ STG[h.funding_stage] ?? h.funding_stage }}</td><td>{{ h.operating_stage.replace('_', ' ') }}</td><td>{{ HL[h.health] ?? h.health }}</td><td class="r">{{ h.runway === null ? '—' : h.runway + ' mo' }}</td><td v-if="d.tier >= 2" class="r">{{ h.equity_score ?? '—' }}</td><td v-if="d.tier >= 2" class="r">{{ h.debt_score ?? '—' }}</td></tr></tbody></table></div>
      <p class="fine">Indicative only — not a valuation, credit decision or investment advice. Stages and scores follow general benchmarks for {{ d.region_label }} and your own figures; investors and lenders decide on their own terms. Providers are listed for information; Finvry does not arrange or recommend funding.</p>
    </template>
  </section>
</template>
<style scoped>
.sm { display: flex; flex-direction: column; gap: 16px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 680px; }
.fx-stats { margin: 0; }
.hb { border: 1px solid var(--c-rule); background: #fff; padding: 12px 16px; font-size: 14px; color: var(--c-ink-soft); line-height: 1.55; } .hb.risk { border-color: #f1c6c2; background: #fdf3f2; } .hb.good { background: #f4f7fb; }
.card h2 { margin: 0; font-size: 17px; } .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm2 { font-size: 12.5px; margin-top: 10px; }
.lk { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; } .lk:hover { text-decoration: underline; }
.two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; } @media (max-width: 960px) { .two { grid-template-columns: 1fr; } }
.t { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 7px 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 7px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t .r { text-align: right; } .t td.neg { color: var(--c-danger); }
.t small { display: block; color: var(--c-muted); font-size: 12px; margin-top: 2px; } .t .cr { max-width: 360px; color: var(--c-ink-soft); } .t .cr .lk { display: block; margin-top: 4px; } .pv b { font-weight: 600; }
.chip { display: inline-block; margin-left: 6px; font-size: 11px; padding: 1px 6px; background: var(--c-signal-soft); color: var(--c-blue-deep); }
.bar { display: grid; grid-template-columns: 90px 1fr 54px; gap: 10px; align-items: center; font-size: 13px; margin-top: 8px; } .bar i, .pt i { height: 8px; background: #eef1f5; display: block; } .bar i em, .pt i em { display: block; height: 100%; background: var(--c-navy); } .bar b { text-align: right; font-weight: 500; }
.sc { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } @media (max-width: 860px) { .sc { grid-template-columns: 1fr; } }
.sco .sh { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--c-rule); padding-bottom: 10px; margin-bottom: 6px; } .sco .sh span { flex: 1; font-weight: 500; } .sco .sh b { font-family: var(--font-heading); font-size: 30px; font-weight: 500; color: var(--c-navy); } .sco .sh em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.pt { display: grid; grid-template-columns: 1fr 120px; gap: 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .pt small { display: block; color: var(--c-muted); font-size: 12px; }
.mv { margin-top: 16px; } .mv h3 { margin: 0 0 6px; font-size: 14px; } .mv ol { margin: 0; padding-left: 18px; font-size: 13.5px; } .mv li { padding: 4px 0; } .mv a { color: var(--c-blue-deep); } .mv em { font-style: normal; color: var(--c-muted); margin-left: 8px; font-size: 12.5px; }
.up { margin: 0; padding: 12px 14px; background: #f4f6f9; font-size: 13.5px; } .up a { color: var(--c-blue-deep); }
.seg { display: flex; border: 1px solid var(--c-rule-strong); width: fit-content; margin-bottom: 12px; } .seg button { font: inherit; font-size: 13px; padding: 7px 14px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.fine { margin: 0; font-size: 12px; color: var(--c-muted); }
</style>
