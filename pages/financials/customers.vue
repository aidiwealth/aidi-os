<script setup lang="ts">
// Customer analysis: top and least performing customers, sectors (or any grouping), concentration, lifetime value,
// acquisition cost and payback. Same customer revenue as Retention, plus sector and acquisition cost when given.
import { addM, bridge, byGroup, customerStats, win, type CustStat, type GroupBy } from '~/shared/customer-metrics'
useHead({ title: 'Customers' })
const { q: custQ, scope: custScope } = useCustScope()
// The company (or the group) chosen at the top of Financials: its customers; the group combines every company's.
const fs = await useFinScope()
custScope.value = fs.isGroup.value ? '' : fs.entityId.value ?? ''
watch(fs.s, () => { custScope.value = fs.isGroup.value ? '' : fs.entityId.value ?? '' })
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
// In a group, customer revenue is added and changed per company: the group view (every company combined) is read only.
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)) && (!!custScope.value || (data.value?.scope?.entities.length ?? 0) <= 1))
const { data, pending, refresh, cs, sp, asOf, months, t, cur, stamp, grace } = await useCustomers()
const by = ref<GroupBy>('sector')
const up = ref(false); const ok = ref(''); const msg = ref('')
const rpt = ref(false)
// ---- Direction: concentration, customer economics and growth against what is usual. ----
const P1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10)
const prevS = computed(() => (asOf.value ? customerStats(cs.value, addM(asOf.value, -3), t.value, by.value, data.value?.fin.gm ?? null, cur.value, { grace: grace.value, basis: data.value?.config.retention_basis ?? 'month' }).summary : null))
const growthTtm = computed(() => { const a = st.value.rows.reduce((x, r) => x + r.ttm, 0), b = st.value.rows.reduce((x, r) => x + r.prior_ttm, 0); return b > 0 ? (a / b - 1) * 100 : null })
const verdict = computed(() => {
  const top = ranked.value[0], g = growthTtm.value, won = brC.value.reduce((x, r) => x + r.new_logos, 0), lost = brC.value.reduce((x, r) => x + r.lost_logos, 0)
  if (!top) return ''
  return (g == null ? '' : 'Customer revenue ' + (g >= 0 ? 'grew ' : 'fell ') + Math.abs(Math.round(g)) + '% on the year before. ') +
    (S.value.top1 != null && S.value.top1 > 0.15 ? top.name + ' alone is ' + cPct(S.value.top1) + ' of revenue: losing them would cut revenue by ' + (S.value.top1 > 0.33 ? 'over a third' : 'a large share') + '. ' : 'No single customer dominates. ') +
    (won || lost ? won + ' customers won and ' + lost + ' lost in 12 months.' : '')
})
const quad = computed(() => groups.value.filter((g) => g.group !== 'Not set').map((g) => ({ label: g.group, share: g.share, growth: g.growth, customers: g.active })))
const { data: modsR } = useNuxtData<{ code: string; usable?: boolean }[]>('modules')
const rptOk = computed(() => !!modsR.value?.find((m) => m.code === 'fin_report' && m.usable))
// The last 12 months to the chosen month: revenue and paying customers, customers won and lost, concentration.
const m12 = computed(() => Array.from({ length: 12 }, (_, i) => addM(asOf.value, i - 11)).filter((m) => months.value.includes(m)))
const trendM = computed(() => m12.value.map((m) => { let rev = 0, active = 0; for (const c of cs.value) { const v = c.rev[m] ?? 0; rev += v; if ((grace.value > 1 ? win(c, m, grace.value) : v) > 0) active++ } return { m, rev, active } }))
const brC = computed(() => bridge(cs.value, m12.value, grace.value))
const conc = computed(() => { const s = ranked.value.map((r) => r.share); const at = (n: number) => Math.round(s.slice(0, n).reduce((a, b) => a + b, 0) * 1000) / 10; return [1, 5, 10, 20, 50].filter((n) => n <= s.length).map((n) => ({ label: 'Top ' + n, value: at(n) })) })
async function uploaded(m: string) { up.value = false; ok.value = m; await refresh() }
const st = computed(() => customerStats(cs.value, asOf.value, t.value, by.value, data.value?.fin.gm ?? null, cur.value, { grace: grace.value, basis: data.value?.config.retention_basis ?? 'month' }))
const S = computed(() => st.value.summary)
const groups = computed(() => byGroup(cs.value, st.value.rows, asOf.value, by.value, t.value))
const ranked = computed(() => [...st.value.rows].filter((r) => r.ttm > 0).sort((a, b) => b.ttm - a.ttm))
const movers = computed(() => st.value.rows.filter((r) => r.prior_ttm > 0 || r.ttm > 0))
const growing = computed(() => [...movers.value].filter((r) => r.ttm - r.prior_ttm > 0).sort((a, b) => (b.ttm - b.prior_ttm) - (a.ttm - a.prior_ttm)).slice(0, 6))
const falling = computed(() => [...movers.value].filter((r) => r.ttm - r.prior_ttm < 0 && r.active).sort((a, b) => (a.ttm - a.prior_ttm) - (b.ttm - b.prior_ttm)).slice(0, 6))
const lost = computed(() => st.value.rows.filter((r) => !r.active && r.last && r.last > addMonths(asOf.value, -12) && r.last <= asOf.value).sort((a, b) => b.lifetime - a.lifetime).slice(0, 6))
function addMonths(m: string, k: number) { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + k, 1)); return d.toISOString().slice(0, 7) }
const hasSector = computed(() => cs.value.some((c) => c.sector)); const hasCac = computed(() => cs.value.some((c) => c.acquisition_cost))
const GB: [GroupBy, string][] = [['sector', 'Sector'], ['segment', 'Segment'], ['size', 'Size'], ['plan', 'Plan'], ['country', 'Country']]
// The full list: search, sort, select to merge.
const q = ref(''); const sortK = ref<keyof CustStat>('ttm'); const desc = ref(true); const showAll = ref(false); const sel = ref<string[]>([])
const list = computed(() => { const s = q.value.trim().toLowerCase(); const r = st.value.rows.filter((x) => !s || [x.name, x.sector, x.segment, x.country, x.plan].some((v) => v.toLowerCase().includes(s))); return r.sort((a, b) => { const x = a[sortK.value] ?? -Infinity, y = b[sortK.value] ?? -Infinity; return (typeof x === 'string' ? String(x).localeCompare(String(y)) : (x as number) - (y as number)) * (desc.value ? -1 : 1) }) })
function sortBy(k: keyof CustStat) { if (sortK.value === k) desc.value = !desc.value; else { sortK.value = k; desc.value = k !== 'name' } }
const arrow = (k: string) => (sortK.value === k ? (desc.value ? ' ↓' : ' ↑') : '')
// Edit one customer.
const ed = reactive({ open: false, id: '', name: '', segment: '', sector: '', country: '', plan: '', started_on: '', acquisition_cost: '' as string | number, gross_margin_pct: '' as string | number, busy: false, msg: '' })
function edit(id: string) { const c = cs.value.find((x) => x.id === id); if (!c) return; Object.assign(ed, { open: true, id, name: c.name, segment: c.segment ?? '', sector: c.sector ?? '', country: c.country ?? '', plan: c.plan ?? '', started_on: c.started_on ?? '', acquisition_cost: c.acquisition_cost ?? '', gross_margin_pct: c.gross_margin_pct ?? '', busy: false, msg: '' }) }
const numOrNull = (v: string | number) => (v === '' || v === null ? null : Number(v))
async function saveEd() { ed.busy = true; ed.msg = ''; try { await $fetch('/api/financials/customers/' + ed.id, { query: custQ(), method: 'POST', body: { name: ed.name, segment: ed.segment || null, sector: ed.sector || null, country: ed.country || null, plan: ed.plan || null, started_on: ed.started_on || null, acquisition_cost: numOrNull(ed.acquisition_cost), gross_margin_pct: numOrNull(ed.gross_margin_pct) } }); ed.open = false; await refresh() } catch (e) { ed.msg = errOf(e) } finally { ed.busy = false } }
async function delCust() { if (!confirm('Remove ' + ed.name + ' and its monthly revenue?')) return; await $fetch('/api/financials/customers/' + ed.id, { query: custQ(), method: 'DELETE' }); ed.open = false; await refresh() }
const mg = reactive({ open: false, keep: '' })
async function merge() { try { await $fetch('/api/financials/customers/merge', { query: custQ(), method: 'POST', body: { ids: sel.value, keep: mg.keep } }); mg.open = false; sel.value = []; ok.value = 'Customers merged.'; await refresh() } catch (e) { msg.value = errOf(e) } }
const errOf = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const sectors = computed(() => [...new Set(cs.value.map((c) => c.sector).filter(Boolean))] as string[])
const segments = computed(() => [...new Set(cs.value.map((c) => c.segment).filter(Boolean))] as string[])
const chg = (r: CustStat) => r.ttm - r.prior_ttm
const yrs = (m: number) => (m >= 24 ? (m / 12).toFixed(1) + ' yrs' : m + ' mo')
</script>

<template>
  <section>
    <FinHeader />
    <ClientOnly><CustScopeBar :info="data?.scope" :currency="cur" :can-edit="(me?.roles ?? []).some((r) => ['gp', 'admin'].includes(r))" @moved="(m) => { ok = m }" /></ClientOnly>
    <div class="head"><div />
      <div v-if="cs.length" class="tools"><label class="sel">To<select v-model="asOf"><option v-for="m in [...months].reverse()" :key="m" :value="m">{{ cMon(m, true) }}</option></select></label>
        <button v-if="rptOk" class="btn secondary" type="button" title="Customers and revenue retention as a PDF or Excel report, for all customers or one group" @click="rpt = true">Customer report</button>
        <button v-if="canEdit" class="btn" type="button" @click="up = true">Add customer revenue</button></div></div>
    <ClientOnly><CustomerLink :can-edit="canEdit" class="clink" @changed="uploaded('')" /></ClientOnly>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <p v-if="!data && pending" class="mut ld">Loading your customers…</p>
    <div v-else-if="!cs.length" class="start card">
      <div><h2>Understand your customers</h2><p>Upload what each customer paid each month. You get your top and least performing customers, sectors, revenue concentration, lifetime value (LTV), and, if you add what it cost to win each customer, LTV to CAC and payback.</p>
        <ul><li><b>The Finvry customer revenue template</b>: one row per customer with its Currency, months across</li><li><b>Sector</b> for the sector view (Banking, Retail, Telecoms…)</li><li>Optional: Segment, Country, Plan, Start date, Acquisition cost</li></ul>
        <p class="mut">Read exactly by its headings, with no AI, so every figure lands where it should. We check for the same customer written two ways before saving.</p>
        <div class="row"><button v-if="canEdit" class="btn" type="button" @click="up = true">Add customer revenue</button><a class="btn secondary" href="/api/financials/customers/template">Download the template</a></div></div>
    </div>

    <template v-else>
      <div class="dir card">
        <div class="dh"><span class="eyebrow">Where you stand</span></div>
        <div class="sc">
          <BenchBar label="Largest customer" :value="P1(S.top1)" :prev="P1(prevS?.top1)" :bands="[10, 20]" :max="60" lower-is-better :hint="ranked[0]?.name ?? ''" />
          <BenchBar label="Top 10 customers" :value="P1(S.top10)" :prev="P1(prevS?.top10)" :bands="[30, 50]" :max="100" lower-is-better hint="Share of revenue" />
          <BenchBar label="Customer revenue growth" :value="growthTtm" :bands="[0, 20]" :max="100" hint="Last 12 months vs the 12 before" />
          <BenchBar v-if="S.ltv_cac" label="Lifetime value to acquisition cost" unit="×" :value="S.ltv_cac" :prev="prevS?.ltv_cac ?? null" :bands="[1.5, 3]" :max="10" :hint="S.payback ? 'Payback ' + Math.round(S.payback) + ' months' : ''" />
          <BenchBar v-else label="Paying customers" unit="×" :value="null" :bands="[1, 2]" :max="3" :hint="S.active + ' paying · add acquisition cost for LTV to CAC'" />
        </div>
        <div class="kvr"><span><b>{{ S.active.toLocaleString('en-US') }}</b> paying customers</span><span><b>{{ cMoney(S.arpa, cur) }}</b> average a month</span><span><b>{{ cMoney(S.ltv, cur, true) }}</b> lifetime value{{ S.lifetime_months ? ' over ' + yrs(Math.round(S.lifetime_months)) : '' }}</span><span v-if="S.pareto != null"><b>{{ cPct(S.pareto, 1) }}</b> of customers make 80% of revenue</span></div>
      </div>
      <div class="gbar"><span class="mut">Group by</span><div class="seg sm" role="group" aria-label="Group by"><button v-for="[k, l] in GB" :key="k" :class="{ on: by === k }" @click="by = k">{{ l }}</button></div><span v-if="by === 'sector' && !hasSector" class="mut">Add a Sector column to your file to see revenue by sector.</span></div>
      <div class="charts two">
        <ParetoChart title="How concentrated revenue is" sub="Last 12 months" :shares="st.rows.map((r) => r.ttm)" />
        <FocusBars :title="'Where to focus, by ' + (GB.find(([k]) => k === by)?.[1].toLowerCase() ?? 'group')" sub="Growth against share of revenue" :items="quad" />
      </div>
      <ClientOnly><ShareTo v-if="canEdit" :sections="['intro', 'customers']" what="customer analysis" /></ClientOnly>

      <div class="charts">
        <TrendChart title="Recurring revenue" unit="usd" :symbol="C_SYMS[cur] ?? cur + ' '" :points="trendM.map((x) => ({ label: cMon(x.m), value: Math.round(x.rev) }))" foot="Customer revenue each month" :foot-value="trendM[trendM.length - 1]?.rev ?? null" />
        <TrendChart title="Paying customers" :points="trendM.map((x) => ({ label: cMon(x.m), value: x.active }))" foot="Paying in the month" :foot-value="trendM[trendM.length - 1]?.active ?? null" />
        <TrendChart title="Average customer" unit="usd" :symbol="C_SYMS[cur] ?? cur + ' '" :points="trendM.map((x) => ({ label: cMon(x.m), value: Math.round(x.active ? x.rev / x.active : 0) }))" foot="Revenue per paying customer a month" :foot-value="trendM.length && trendM[trendM.length - 1]!.active ? Math.round(trendM[trendM.length - 1]!.rev / trendM[trendM.length - 1]!.active) : null" />
      </div>
      <div class="charts two">
        <HBars title="Top 10 customers" sub="Share of revenue, last 12 months" :rows="ranked.slice(0, 10).map((r) => ({ label: r.name, value: Math.round(r.share * 1000) / 10 }))" />
        <div class="card"><DonutChart :title="'Revenue by ' + (GB.find(([k]) => k === by)?.[1].toLowerCase() ?? 'group')" sub="Share of revenue, last 12 months" percent :segments="groups.map((g) => ({ label: g.group, value: Math.round(g.share * 1000) / 10 }))" /></div>
      </div>
      <div class="charts">
        <StackBars class="wide" title="Customers won and lost" sub="Last 12 months" unit="count" :labels="brC.map((x) => cMon(x.month))" :series="[{ name: 'Won', values: brC.map((x) => x.new_logos) }, { name: 'Lost', values: brC.map((x) => x.lost_logos), down: true }]" />
      </div>

      <div class="three n2">
        <div class="card flat"><div class="ch"><h3>Growing fastest</h3><span class="mut">Last 12 months vs the 12 before</span></div>
          <ol class="lst"><li v-for="r in growing" :key="r.id"><span class="nm">{{ r.name }}<em>{{ r.prior_ttm ? '' : 'New this year' }}</em></span><span class="v up">+{{ cMoney(chg(r), cur, true) }}<em>{{ r.growth === null ? '' : '+' + cPct(r.growth) }}</em></span></li><li v-if="!growing.length" class="none">No customer grew over the period.</li></ol></div>
        <div class="card flat"><div class="ch"><h3>Slipping and lost</h3><span class="mut">Paying less, or stopped in the last year</span></div>
          <ol class="lst"><li v-for="r in falling" :key="r.id"><span class="nm">{{ r.name }}<em>Paying less</em></span><span class="v dn">{{ cMoney(chg(r), cur, true) }}<em>{{ r.growth === null ? '' : cPct(r.growth) }}</em></span></li>
            <li v-for="r in lost" :key="'l' + r.id"><span class="nm">{{ r.name }}<em>Last paid {{ cMon(r.last!) }}</em></span><span class="v dn">Lost<em>{{ cMoney(r.lifetime, cur, true) }} lifetime</em></span></li><li v-if="!falling.length && !lost.length" class="none">No customer is paying less.</li></ol></div>
      </div>

      <details class="card flat tbl"><summary>Table: by {{ GB.find(([k]) => k === by)?.[1].toLowerCase() }}</summary>
        <div class="scroll"><table class="table"><thead><tr><th>{{ GB.find(([k]) => k === by)?.[1] }}</th><th class="n">Customers</th><th class="n">Revenue (12 months)</th><th class="n">Share</th><th class="n">Growth</th><th class="n">Avg / month</th><th class="n">NRR</th><th class="n">Customer churn</th><th class="n">LTV</th></tr></thead>
          <tbody><tr v-for="g in groups" :key="g.group"><td><b>{{ g.group }}</b></td><td class="n">{{ g.active }}<span class="sub">of {{ g.customers }}</span></td><td class="n">{{ cMoney(g.ttm, cur, true) }}</td><td class="n"><span class="bar"><i :style="{ width: Math.round(g.share * 100) + '%' }" /></span>{{ cPct(g.share) }}</td>
            <td class="n" :class="(g.growth ?? 0) < 0 ? 'r' : ''">{{ g.growth === null ? '—' : (g.growth >= 0 ? '+' : '') + cPct(g.growth) }}</td><td class="n">{{ cMoney(g.arpa, cur) }}</td><td class="n">{{ cPct(g.nrr, 1) }}</td><td class="n">{{ cPct(g.logo_churn, 1) }}</td><td class="n">{{ cMoney(g.ltv, cur, true) }}</td></tr></tbody></table></div>
      </details>

      <details class="card flat tbl"><summary>All customers ({{ cs.length.toLocaleString('en-US') }})</summary>
        <div class="ch"><div><p class="mut">{{ cs.length }} customers · {{ cMon(sp!.first, true) }} to {{ cMon(sp!.last, true) }} · {{ cur }}{{ hasCac ? '' : ' · add acquisition cost for LTV to CAC' }}</p></div>
          <div class="row"><input v-model="q" type="search" placeholder="Search customers, sectors…" class="srch"><button v-if="canEdit && sel.length >= 2" class="btn secondary sm" type="button" @click="mg.open = true; mg.keep = sel[0]!">Merge {{ sel.length }}</button></div></div>
        <div class="scroll"><table class="table"><thead><tr><th v-if="canEdit" class="cb" /><th class="s" @click="sortBy('name')">Customer{{ arrow('name') }}</th><th class="s" @click="sortBy('sector')">Sector{{ arrow('sector') }}</th><th class="s" @click="sortBy('group')">Size{{ arrow('group') }}</th>
          <th class="n s" @click="sortBy('mrr')">Per month{{ arrow('mrr') }}</th><th class="n s" @click="sortBy('ttm')">12 months{{ arrow('ttm') }}</th><th class="n s" @click="sortBy('growth')">Growth{{ arrow('growth') }}</th><th class="n s" @click="sortBy('tenure')">Customer for{{ arrow('tenure') }}</th><th class="n s" @click="sortBy('lifetime')">Lifetime{{ arrow('lifetime') }}</th><th class="n s" @click="sortBy('ltv')">LTV{{ arrow('ltv') }}</th><th class="n s" @click="sortBy('ltv_cac')">LTV:CAC{{ arrow('ltv_cac') }}</th><th /></tr></thead>
          <tbody><tr v-for="r in (showAll ? list : list.slice(0, 50))" :key="r.id" :class="{ off: !r.active }"><td v-if="canEdit" class="cb"><input v-model="sel" type="checkbox" :value="r.id" :aria-label="'Select ' + r.name"></td><td><b>{{ r.name }}</b><span class="sub">{{ r.active ? (r.segment || r.country || '') : 'Stopped paying ' + cMon(r.last ?? '') }}</span></td><td>{{ r.sector || '—' }}</td><td>{{ r.group }}</td>
            <td class="n">{{ cMoney(r.mrr, cur) }}</td><td class="n">{{ cMoney(r.ttm, cur) }}</td><td class="n" :class="(r.growth ?? 0) < 0 ? 'r' : ''">{{ r.growth === null ? '—' : (r.growth >= 0 ? '+' : '') + cPct(r.growth) }}</td><td class="n">{{ yrs(r.tenure) }}</td><td class="n">{{ cMoney(r.lifetime, cur, true) }}</td><td class="n">{{ cMoney(r.ltv, cur, true) }}</td><td class="n">{{ r.ltv_cac ? r.ltv_cac.toFixed(1) + '×' : '—' }}</td>
            <td class="n"><button v-if="canEdit" class="lk" type="button" @click="edit(r.id)">Edit</button></td></tr></tbody></table></div>
        <div v-if="list.length > 50 && !showAll" class="more"><button class="lk" type="button" @click="showAll = true">Show all {{ list.length }}</button></div>
      </details>
      <div class="card dat"><div><b>Your customer data</b><span>Same data as Revenue retention{{ data?.imports[0] ? ' · last upload ' + data.imports[0].created : '' }}</span></div><div class="row"><button v-if="canEdit" class="btn secondary sm" type="button" @click="up = true">Upload more</button><NuxtLink to="/financials/retention" class="lk">Revenue retention →</NuxtLink></div></div>
    </template>

    <ClientOnly><CustomerUpload :open="up" :existing="cs.length" extra="customers" @close="up = false" @done="uploaded" /></ClientOnly>
    <ClientOnly><MgmtReport v-if="rpt" :open="rpt" :subject="fs.s.value" :cust="custScope" :company="''" :only="['customers', 'retention']" title="Customer and retention report" @close="rpt = false" @done="(m) => { rpt = false; ok = m }" /></ClientOnly>
    <AppModal :open="ed.open" title="Customer" wide @close="ed.open = false">
      <div class="g2"><label class="label wide">Name<input v-model="ed.name" maxlength="200"></label>
        <label class="label">Sector<input v-model="ed.sector" maxlength="80" list="secs"><datalist id="secs"><option v-for="s in sectors" :key="s" :value="s" /></datalist></label>
        <label class="label">Segment<input v-model="ed.segment" maxlength="60" list="segs" placeholder="e.g. Enterprise"><datalist id="segs"><option v-for="s in segments" :key="s" :value="s" /></datalist></label>
        <label class="label">Country<input v-model="ed.country" maxlength="60"></label><label class="label">Plan or product<input v-model="ed.plan" maxlength="80"></label>
        <label class="label">Customer since<input v-model="ed.started_on" type="date"></label><label class="label">Acquisition cost ({{ cur }})<input v-model="ed.acquisition_cost" type="number" min="0"></label>
        <label class="label">Gross margin %<input v-model="ed.gross_margin_pct" type="number" min="-100" max="100" placeholder="Company average"></label></div>
      <p v-if="ed.msg" class="error">{{ ed.msg }}</p>
      <template #foot><button class="lk red" type="button" @click="delCust">Remove customer</button><span class="sp" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" :disabled="ed.busy" @click="saveEd">Save</button></template>
    </AppModal>
    <AppModal :open="mg.open" title="Merge customers" @close="mg.open = false">
      <div class="frm"><p class="mut">Their monthly revenue is added together under one name. Use this for the same customer written two ways.</p>
        <label class="label">Keep the name<select v-model="mg.keep"><option v-for="id in sel" :key="id" :value="id">{{ cs.find((c) => c.id === id)?.name }}</option></select></label></div>
      <template #foot><button class="btn secondary" @click="mg.open = false">Cancel</button><button class="btn" @click="merge">Merge</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .charts.two { grid-template-columns: 1fr 1fr; } .charts .wide { grid-column: 1 / -1; }
@media (max-width: 1000px) { .charts, .charts.two { grid-template-columns: 1fr; } }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; } .head h1 { margin: 0; } .sub { margin: 4px 0 0; color: var(--c-muted); font-size: 14px; }
.tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .sel { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--c-muted); }
select, input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.seg { display: flex; border: 1px solid var(--c-rule-strong); background: #fff; } .seg button { background: none; border: 0; padding: 6px 11px; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); } .mut { color: var(--c-muted); font-size: 12.5px; margin: 2px 0 0; }
.start { padding: 26px 28px; max-width: 760px; } .start h2 { margin: 0 0 6px; font-family: var(--font-heading); font-weight: 500; } .start p { margin: 0 0 10px; color: var(--c-ink-soft); } .start ul { margin: 0 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .btn.sm { padding: 6px 12px; font-size: 13px; }
.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; } .three .card { margin: 0; }
.card.flat { padding: 0; overflow: hidden; margin-bottom: 12px; } .ch { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; padding: 16px 18px 12px; flex-wrap: wrap; } .ch h3 { margin: 0; font-size: 16px; }
.lst { list-style: none; margin: 0; padding: 0 18px 12px; } .lst li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .lst .nm { display: flex; flex-direction: column; min-width: 0; } .lst .nm, .lst .v { overflow-wrap: anywhere; }
.lst em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .lst .v { text-align: right; display: flex; flex-direction: column; font-weight: 500; } .lst .v.up { color: var(--c-navy); } .lst .v.dn { color: var(--c-danger); } .lst .bar { grid-column: 1 / -1; width: 100%; } .lst .none { color: var(--c-muted); display: block; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; } .lk.red { color: var(--c-danger); }
.scroll { overflow-x: auto; } .table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); border-top: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; } th.s { cursor: pointer; } th.s:hover { color: var(--c-ink); }
td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); } td.r { color: var(--c-danger); } tr.off td { color: var(--c-muted); }
.cb { width: 34px; padding-right: 0; } .cb input { margin: 0; padding: 0; }
.bar { display: inline-block; width: 60px; height: 5px; background: #eef1f6; margin-right: 8px; vertical-align: middle; } .bar i { display: block; height: 100%; background: var(--c-navy); }
.srch { width: 240px; padding: 7px 10px; font-size: 13.5px; } .more { padding: 12px 18px; }
.dat { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; } .dat > div:first-child { display: flex; flex-direction: column; gap: 2px; } .dat span { font-size: 12.5px; color: var(--c-muted); }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; } .g2 .wide { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .frm { display: flex; flex-direction: column; gap: 10px; } .sp { flex: 1; }
@media (max-width: 1100px) { .three { grid-template-columns: 1fr; } }
.dir { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px; } .dh { display: flex; flex-direction: column; gap: 4px; } .vd { margin: 0; font-family: var(--font-heading); font-size: 16px; font-weight: 500; line-height: 1.5; color: var(--c-navy); max-width: 90ch; }
.sc { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; } .eyebrow { font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.kvr { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px 24px; font-size: 13px; color: var(--c-ink-soft); } .kvr b { color: var(--c-navy); font-weight: 500; }
@media (max-width: 1000px) { .sc { grid-template-columns: 1fr 1fr; } } @media (max-width: 640px) { .sc { grid-template-columns: 1fr; } }
.gbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 4px 0 10px; } .gbar .mut { font-size: 13px; }
.three.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } @media (max-width: 800px) { .three.n2 { grid-template-columns: 1fr; } }
.charts { align-items: stretch; }
</style>
