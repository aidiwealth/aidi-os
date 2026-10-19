<script setup lang="ts">
// Revenue retention and churn from customer revenue by month: NRR, GRR, logo churn, where revenue came from and went,
// retention by customer group (size, segment, sector, plan, country) and by cohort.
import { addM, bridge, byGroup, cohorts, COHORT_AT, customerStats, groupOf, retention, retentionTrend, win, type Basis, type GroupBy } from '~/shared/customer-metrics'
useHead({ title: 'Revenue retention' })
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const { data, pending, refresh, cs, sp, asOf, months, groupBy, t, cur, stamp } = await useCustomers()
const basis = ref<Basis>('month')
const up = ref(false); const ok = ref(''); const msg = ref('')
// The retention and customer report (the management report's customer sections), when the report module is on.
const rpt = ref(false)
const { data: modsR } = useNuxtData<{ code: string; usable?: boolean }[]>('modules')
const rptOk = computed(() => !!modsR.value?.find((m) => m.code === 'fin_report' && m.usable))
async function uploaded(m: string) { up.value = false; ok.value = m; await refresh() }
const r12 = computed(() => retention(cs.value, asOf.value, 12, basis.value))
const r12prev = computed(() => retention(cs.value, addM(asOf.value, -3), 12, basis.value))
const stats = computed(() => customerStats(cs.value, asOf.value, t.value, groupBy.value, data.value?.fin.gm ?? null, cur.value))
const groups = computed(() => byGroup(cs.value, stats.value.rows, asOf.value, groupBy.value, t.value, basis.value))
const br = computed(() => bridge(cs.value, months.value.filter((m) => m <= asOf.value).slice(-12)))
const churn3 = computed(() => { const b = br.value.slice(-3); const start = b.reduce((s, r) => s + r.start, 0); return start ? b.reduce((s, r) => s + r.churned + r.contraction, 0) / start : null })
const trend = computed(() => retentionTrend(cs.value, months.value.filter((m) => m <= asOf.value).slice(-12), basis.value).filter((x) => x.nrr !== null))
const coh = computed(() => cohorts(cs.value, asOf.value).slice(-12))
const enough = computed(() => months.value.length >= 13)
// Financials revenue against customer revenue for the last three months.
const recon = computed(() => {
  const f = data.value?.fin.revenue ?? {}, ms = [0, 1, 2].map((i) => addM(asOf.value, -i))
  if (!ms.every((m) => typeof f[m] === 'number')) return null
  const fin = ms.reduce((s, m) => s + f[m]!, 0), cust = ms.reduce((s, m) => s + cs.value.reduce((a, c) => a + (c.rev[m] ?? 0), 0), 0)
  return fin ? { fin, cust, gap: cust / fin - 1 } : null
})
// ---- Direction: where retention stands against what is usual, where revenue leaks, and who to call. ----
const P1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10)
const sum12 = computed(() => { const z = { start: br.value[0]?.start ?? 0, new: 0, expansion: 0, reactivated: 0, contraction: 0, churned: 0, end: br.value[br.value.length - 1]?.end ?? 0 }; for (const x of br.value) { z.new += x.new; z.expansion += x.expansion; z.reactivated += x.reactivated; z.contraction += x.contraction; z.churned += x.churned } return z })
// Revenue lost (customers leaving and spending less) by group over the last 12 months.
const leaks = computed(() => {
  const ms = months.value.filter((m) => m <= asOf.value).slice(-12), by = new Map<string, typeof cs.value>()
  for (const c of cs.value) { const g = groupOf(c, groupBy.value, ms[0] ?? asOf.value, t.value); const l = by.get(g) ?? []; l.push(c); by.set(g, l) }
  return [...by.entries()].map(([g, l]) => { const b = bridge(l, ms); return { group: g, lost: b.reduce((s, x) => s + x.churned + x.contraction, 0), added: b.reduce((s, x) => s + x.new + x.expansion + x.reactivated, 0) } }).sort((a, b) => b.lost - a.lost)
})
// Large customers whose last three months fell by a third or more against the three before: call them first.
const atRisk = computed(() => cs.value.map((c) => ({ c, now: win(c, asOf.value, 3), before: win(c, addM(asOf.value, -3), 3) })).filter((x) => x.before > 0 && x.now < x.before * 0.67).sort((a, b) => (b.before - b.now) - (a.before - a.now)).slice(0, 5))
const best = computed(() => [...groups.value].filter((g) => g.nrr !== null && g.share >= 0.05).sort((a, b) => b.nrr! - a.nrr!)[0] ?? null)
const verdict = computed(() => {
  const n = P1(r12.value.nrr), p = P1(r12prev.value.nrr), lk = leaks.value[0]
  if (n == null) return ''
  const dir = p == null ? '' : n - p >= 2 ? ', up ' + Math.round(n - p) + ' points in three months' : p - n >= 2 ? ', down ' + Math.round(p - n) + ' points in three months' : ', steady over three months'
  return (n >= 100 ? 'Customers from a year ago pay ' + Math.round(n - 100) + '% more today' : 'Customers from a year ago pay ' + Math.round(100 - n) + '% less today') + dir + '.' +
    (lk && lk.lost > 0 ? ' Most revenue lost came from ' + lk.group + ' (' + cMoney(lk.lost, cur.value, true) + ' over 12 months).' : '') +
    (atRisk.value.length ? ' ' + atRisk.value.length + ' sizeable customer' + (atRisk.value.length === 1 ? ' is' : 's are') + ' paying a third less than three months ago.' : '')
})
const GB: [GroupBy, string][] = [['size', 'Size'], ['segment', 'Segment'], ['sector', 'Sector'], ['plan', 'Plan'], ['country', 'Country']]
async function setGroup(g: GroupBy) { groupBy.value = g; if (canEdit.value) await $fetch('/api/financials/customers/config', { method: 'POST', body: { group_by: g } }).catch(() => {}) }
const tone = (v: number | null, good: number, ok: number) => (v === null ? '' : v >= good ? 'g' : v >= ok ? 'w' : 'r')
const pp = (v: number | null) => cPct(v, 1)
const heat = (v: number | null) => (v === null ? 'transparent' : 'rgba(15, 42, 92,' + Math.max(0.05, Math.min(0.85, v * 0.6)).toFixed(2) + ')')
// AI grouping suggestion.
interface Sug { name: string; why: string; kind: 'size' | 'custom'; enterprise_arr: number | null; midmarket_arr: number | null; segments: { name: string; rule: string }[]; assign: { id: string; name: string; segment: string }[]; alternatives: string[]; ai: boolean }
const sg = reactive({ open: false, busy: false, msg: '', s: null as Sug | null })
async function suggest() { Object.assign(sg, { open: true, busy: true, msg: '', s: null }); try { sg.s = await $fetch<Sug>('/api/financials/customers/suggest', { method: 'POST' }) } catch (e) { sg.msg = errOf(e) } finally { sg.busy = false } }
async function applySug() { if (!sg.s) return; sg.busy = true; try { await $fetch('/api/financials/customers/segments', { method: 'POST', body: sg.s }); sg.open = false; ok.value = 'Grouping applied: ' + sg.s.name + '.'; await refresh(); groupBy.value = sg.s.kind === 'size' ? 'size' : 'segment' } catch (e) { sg.msg = errOf(e) } finally { sg.busy = false } }
const sugCounts = computed(() => { const m = new Map<string, number>(); for (const a of sg.s?.assign ?? []) m.set(a.segment, (m.get(a.segment) ?? 0) + 1); return m })
// Size bands.
const bands = reactive({ open: false, ent: 0, mid: 0 })
function openBands() { Object.assign(bands, { open: true, ent: t.value.enterprise, mid: t.value.midmarket }) }
async function saveBands() { try { await $fetch('/api/financials/customers/config', { method: 'POST', body: { enterprise_arr: Number(bands.ent), midmarket_arr: Number(bands.mid), group_by: 'size' } }); bands.open = false; await refresh() } catch (e) { msg.value = errOf(e) } }
const clr = reactive({ open: false, confirm: '' })
async function clearAll() { try { await $fetch('/api/financials/customers/clear', { method: 'POST', body: { confirm: clr.confirm } }); clr.open = false; ok.value = 'Customer data deleted.'; await refresh() } catch (e) { msg.value = errOf(e) } }
const errOf = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
</script>

<template>
  <section>
    <FinTabs />
    <div class="head"><div><h1>Revenue retention</h1><p class="sub">How much of last year's revenue your customers still pay, what they added, and who left.</p></div>
      <div v-if="cs.length" class="tools">
        <label class="sel">To<select v-model="asOf"><option v-for="m in [...months].reverse()" :key="m" :value="m">{{ cMon(m, true) }}</option></select></label>
        <div class="seg" role="group" aria-label="Basis"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Annual']]" :key="k" :class="{ on: basis === k }" :title="k === 'month' ? 'This month vs the same month last year' : k === 'quarter' ? 'Last 3 months vs the same 3 months last year' : 'Last 12 months vs the 12 before'" @click="basis = k as Basis">{{ l }}</button></div>
        <button v-if="rptOk" class="btn secondary" type="button" title="Revenue retention and customers as a PDF or Excel report, for all customers or one group" @click="rpt = true">Retention report</button>
        <button v-if="canEdit" class="btn" type="button" @click="up = true">Add customer revenue</button></div></div>
    <ClientOnly><CustomerLink :can-edit="canEdit" class="clink" @changed="uploaded('')" /></ClientOnly>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <p v-if="!data && pending" class="mut ld">Loading your customers…</p>
    <div v-else-if="!cs.length" class="start card">
      <div><h2>Measure retention and churn</h2><p>Upload what each customer paid each month. We work out net and gross revenue retention, customer churn, expansion and retention by customer group and cohort, the numbers investors ask for.</p>
        <ul><li><b>The Finvry customer revenue template</b>: one row per customer with its Currency, months across</li><li>Optional: Segment, Sector, Country, Plan, Start date, Acquisition cost</li><li>13 months or more, so this year can be compared with last</li></ul>
        <p class="mut">Read exactly by its headings, with no AI, so every figure lands where it should. We check for the same customer written two ways before saving.</p>
        <div class="row"><button v-if="canEdit" class="btn" type="button" @click="up = true">Add customer revenue</button><a class="btn secondary" href="/api/financials/customers/template">Download the template</a></div></div>
    </div>

    <template v-else>
      <p v-if="!enough" class="note">You have {{ months.length }} month{{ months.length === 1 ? '' : 's' }} of customer revenue. Year-on-year retention needs 13 or more; add earlier months for NRR and GRR.</p>
      <div class="dir card">
        <div class="dh"><span class="eyebrow">Where you stand</span><p class="vd">{{ verdict || 'Add 13 months or more of customer revenue to see where retention stands.' }}</p></div>
        <div class="sc">
          <BenchBar label="Net revenue retention" :value="P1(r12.nrr)" :prev="P1(r12prev.nrr)" :bands="[90, 100]" :max="150" hint="110%+ is strong" />
          <BenchBar label="Gross revenue retention" :value="P1(r12.grr)" :prev="P1(r12prev.grr)" :bands="[80, 90]" :max="100" hint="Losses only" />
          <BenchBar label="Customers lost in 12 months" :value="P1(r12.logo_churn)" :prev="P1(r12prev.logo_churn)" :bands="[10, 25]" :max="60" lower-is-better :hint="r12.customers ? (r12.customers - r12.kept) + ' of ' + r12.customers : ''" />
          <BenchBar label="Monthly revenue churn" :value="P1(churn3)" :bands="[1, 3]" :max="8" lower-is-better hint="Lost and downgraded, last 3 months" />
        </div>
      </div>
      <div class="act">
        <div class="card ac"><span class="eyebrow">Biggest leak</span><template v-if="leaks[0] && leaks[0].lost > 0"><b>{{ leaks[0].group }}</b><p>{{ cMoney(leaks[0].lost, cur, true) }} lost to customers leaving or spending less in 12 months{{ leaks[0].added ? ', against ' + cMoney(leaks[0].added, cur, true) + ' added' : '' }}.</p><em>Find out why they leave: price, product or service. Fix the biggest reason first.</em></template><p v-else>No revenue lost in the last 12 months.</p></div>
        <div class="card ac"><span class="eyebrow">Strongest group</span><template v-if="best"><b>{{ best.group }} · {{ pp(best.nrr) }}</b><p>Keeps and grows its revenue best, with {{ cPct(best.share) }} of revenue.</p><em>Win more customers like these and learn what they buy.</em></template><p v-else>Needs a year of history by group.</p></div>
        <div class="card ac"><span class="eyebrow">Call this month</span><template v-if="atRisk.length"><ol><li v-for="x in atRisk" :key="x.c.id"><span>{{ x.c.name }}</span><em>{{ cMoney(x.now / 3, cur, true) }} a month, was {{ cMoney(x.before / 3, cur, true) }}</em></li></ol></template><p v-else>No large customer has dropped by a third in the last three months.</p></div>
      </div>
      <div class="charts two">
        <Waterfall title="Revenue over the last 12 months" sub="Monthly revenue" :currency="cur" :start="{ label: cMon(br[0]?.month ?? asOf), value: sum12.start }" :steps="[{ label: 'New', value: sum12.new }, { label: 'Expansion', value: sum12.expansion }, { label: 'Returned', value: sum12.reactivated }, { label: 'Downgrades', value: -sum12.contraction }, { label: 'Lost', value: -sum12.churned }]" :end-label="cMon(asOf)" foot="Each step adds up the 12 months: how revenue moved from the month at the start to this month." />
        <HBars :title="'Net revenue retention by ' + (GB.find(([k]) => k === groupBy)?.[1].toLowerCase() ?? 'group')" sub="Same customers, a year on" :rows="groups.filter((g) => g.nrr !== null).map((g) => ({ label: g.group, value: Math.round(g.nrr! * 1000) / 10, note: g.customers + ' customers' }))" :ref-line="100" ref-label="100%: customers pay as much as a year ago" />
      </div>
      <p v-if="recon && Math.abs(recon.gap) > 0.05" class="warn">Customer revenue for the last three months ({{ cMoney(recon.cust, cur) }}) is {{ cPct(Math.abs(recon.gap), 1) }} {{ recon.gap > 0 ? 'above' : 'below' }} the revenue in your Financials ({{ cMoney(recon.fin, cur) }}). Check for missing customers, credits or revenue recorded differently.</p>
      <CustAnalysis kind="retention" :stamp="stamp" />
      <ClientOnly><ShareTo v-if="canEdit" :sections="['intro', 'retention']" what="revenue retention" /></ClientOnly>

      <div class="card flat">
        <div class="ch"><div><h3>Retention by {{ GB.find(([k]) => k === groupBy)?.[1].toLowerCase() }}</h3><p class="mut">{{ groupBy === 'size' ? 'Enterprise from ' + cMoney(t.enterprise, cur, true) + ' a year, Mid-market from ' + cMoney(t.midmarket, cur, true) + ', SMB below. Customers are placed by what they paid a year ago.' : data?.config.scheme?.name ? data.config.scheme.name + ': ' + data.config.scheme.why : 'Set on each customer (from your file, the Customers page, or a suggested grouping).' }}</p></div>
          <div class="gt"><div class="seg sm" role="group" aria-label="Group by"><button v-for="[k, l] in GB" :key="k" :class="{ on: groupBy === k }" @click="setGroup(k)">{{ l }}</button></div>
            <button v-if="canEdit && groupBy === 'size'" class="lk" type="button" @click="openBands">Change bands</button><button v-if="canEdit" class="lk" type="button" @click="suggest">✦ Suggest groups</button></div></div>
        <div class="scroll"><table class="table"><thead><tr><th>{{ GB.find(([k]) => k === groupBy)?.[1] }}</th><th class="n">Customers</th><th class="n">Share of revenue</th><th class="n">Avg / month</th><th class="n">NRR</th><th class="n">GRR</th><th class="n">Customer churn</th><th class="n">Revenue growth</th></tr></thead>
          <tbody><tr v-for="g in groups" :key="g.group"><td><b>{{ g.group }}</b></td><td class="n">{{ g.active }}<span class="sub">of {{ g.customers }}</span></td><td class="n"><span class="bar"><i :style="{ width: Math.round(g.share * 100) + '%' }" /></span>{{ cPct(g.share) }}</td><td class="n">{{ cMoney(g.arpa, cur) }}</td>
            <td class="n" :class="tone(g.nrr, 1.05, 0.9)">{{ pp(g.nrr) }}</td><td class="n" :class="tone(g.grr, 0.9, 0.8)">{{ pp(g.grr) }}</td><td class="n" :class="g.logo_churn === null ? '' : g.logo_churn <= 0.1 ? 'g' : g.logo_churn <= 0.25 ? 'w' : 'r'">{{ pp(g.logo_churn) }}</td><td class="n">{{ g.growth === null ? '—' : (g.growth >= 0 ? '+' : '') + cPct(g.growth) }}</td></tr></tbody></table></div>
      </div>

      <div class="charts">
        <TrendChart title="Net revenue retention" unit="pct" :points="trend.map((x) => ({ label: cMon(x.month), value: Math.round((x.nrr ?? 0) * 1000) / 10 }))" foot="Each month vs a year earlier" :foot-value="r12.nrr === null ? null : Math.round(r12.nrr * 1000) / 10" />
        <TrendChart title="Gross revenue retention" unit="pct" :points="trend.map((x) => ({ label: cMon(x.month), value: Math.round((x.grr ?? 0) * 1000) / 10 }))" foot="Losses only" :foot-value="r12.grr === null ? null : Math.round(r12.grr * 1000) / 10" />
        <TrendChart title="Customers lost (12 months)" unit="pct" :points="trend.map((x) => ({ label: cMon(x.month), value: Math.round((x.logo_churn ?? 0) * 1000) / 10 }))" foot="Share of customers from a year before who stopped paying" :foot-value="r12.logo_churn === null ? null : Math.round(r12.logo_churn * 1000) / 10" />
      </div>
      <div class="charts">
        <StackBars class="wide" title="Where revenue came from and went" sub="Last 12 months" :currency="cur" :labels="br.map((x) => cMon(x.month))" :series="[{ name: 'New', values: br.map((x) => x.new) }, { name: 'Expansion', values: br.map((x) => x.expansion) }, { name: 'Returned', values: br.map((x) => x.reactivated) }, { name: 'Downgrades', values: br.map((x) => x.contraction), down: true }, { name: 'Lost', values: br.map((x) => x.churned), down: true }]" foot="Above the line: revenue added. Below: revenue lost. Hover a month for the amounts." />
      </div>
      <div class="charts two">
        <TrendChart title="Active customers" :points="br.map((x) => ({ label: cMon(x.month), value: x.active }))" foot="Paying in the month" :foot-value="br[br.length - 1]?.active ?? null" />
        <StackBars title="Customers won and lost" sub="Last 12 months" unit="count" :labels="br.map((x) => cMon(x.month))" :series="[{ name: 'Won', values: br.map((x) => x.new_logos) }, { name: 'Lost', values: br.map((x) => x.lost_logos), down: true }]" />
      </div>

      <div class="card flat"><div class="ch"><div><h3>Where revenue came from and went</h3><p class="mut">Month by month: new customers, customers paying more or less, and customers lost.</p></div></div>
        <div class="scroll"><table class="table"><thead><tr><th>Month</th><th class="n">Start</th><th class="n">+ New</th><th class="n">+ Expansion</th><th class="n">+ Returned</th><th class="n">− Downgrades</th><th class="n">− Lost</th><th class="n">End</th><th class="n">Customers (+/−)</th></tr></thead>
          <tbody><tr v-for="x in [...br].reverse()" :key="x.month"><td><b>{{ cMon(x.month) }}</b></td><td class="n">{{ cMoney(x.start, cur) }}</td><td class="n pos">{{ x.new ? cMoney(x.new, cur) : '—' }}</td><td class="n pos">{{ x.expansion ? cMoney(x.expansion, cur) : '—' }}</td><td class="n pos">{{ x.reactivated ? cMoney(x.reactivated, cur) : '—' }}</td><td class="n neg">{{ x.contraction ? cMoney(-x.contraction, cur) : '—' }}</td><td class="n neg">{{ x.churned ? cMoney(-x.churned, cur) : '—' }}</td><td class="n"><b>{{ cMoney(x.end, cur) }}</b></td><td class="n">{{ x.active }}<span class="sub">+{{ x.new_logos }} / −{{ x.lost_logos }}</span></td></tr></tbody></table></div></div>

      <div v-if="coh.length" class="card flat"><div class="ch"><div><h3>Cohorts</h3><p class="mut">Customers grouped by the quarter they first paid: their revenue later as a share of their first three months. Above 100% means they grew.</p></div></div>
        <div class="scroll"><table class="table coh"><thead><tr><th>First paid</th><th class="n">Customers</th><th v-for="k in COHORT_AT" :key="k" class="n">{{ k === 0 ? 'Start' : 'Month ' + k }}</th></tr></thead>
          <tbody><tr v-for="c in [...coh].reverse()" :key="c.cohort"><td><b>{{ c.cohort }}</b></td><td class="n">{{ c.size }}</td><td v-for="(v, i) in c.cells" :key="i" class="n hc" :style="{ background: heat(v), color: v !== null && v > 0.75 ? '#fff' : '' }">{{ v === null ? '' : cPct(v) }}</td></tr></tbody></table></div></div>

      <div class="card dat"><div><b>Your customer data</b><span>{{ cs.length }} customers · {{ cMon(sp!.first, true) }} to {{ cMon(sp!.last, true) }} · {{ cur }}{{ data?.imports[0] ? ' · last upload ' + data.imports[0].created : '' }}</span></div>
        <div class="row"><NuxtLink to="/financials/customers" class="lk">Edit customers →</NuxtLink><button v-if="canEdit" class="btn secondary sm" type="button" @click="up = true">Upload more</button><button v-if="canEdit" class="lk red" type="button" @click="clr.open = true; clr.confirm = ''">Delete all</button></div></div>
    </template>

    <ClientOnly><CustomerUpload :open="up" :existing="cs.length" extra="retention" @close="up = false" @done="uploaded" /></ClientOnly>
    <ClientOnly><MgmtReport v-if="rpt" :open="rpt" subject="" :company="''" :only="['retention', 'customers']" title="Retention and customer report" @close="rpt = false" @done="(m) => { rpt = false; ok = m }" /></ClientOnly>
    <AppModal :open="sg.open" title="Suggested customer groups" wide @close="sg.open = false">
      <p v-if="sg.busy && !sg.s" class="mut">Looking at your customers…</p>
      <div v-else-if="sg.s" class="sgb"><h3>{{ sg.s.name }}</h3><p>{{ sg.s.why }}</p>
        <table class="table"><tbody><tr v-for="s in sg.s.segments" :key="s.name"><td><b>{{ s.name }}</b></td><td>{{ s.rule }}</td><td v-if="sg.s.kind === 'custom'" class="n">{{ sugCounts.get(s.name) ?? 0 }} customers</td></tr></tbody></table>
        <p v-if="sg.s.alternatives.length" class="mut">Other ways to group: {{ sg.s.alternatives.join('; ') }}.</p>
        <p class="mut">{{ sg.s.kind === 'custom' ? 'Applying sets each customer\'s Segment; you can change any of them on the Customers page.' : 'Applying sets the size bands used for Enterprise, Mid-market and SMB.' }}{{ sg.s.ai ? '' : ' (Worked out from your customers\' revenue.)' }}</p></div>
      <p v-if="sg.msg" class="error">{{ sg.msg }}</p>
      <template #foot><button class="btn secondary" @click="sg.open = false">Cancel</button><button class="btn" :disabled="!sg.s || sg.busy" @click="applySug">Apply</button></template>
    </AppModal>
    <AppModal :open="bands.open" title="Size bands" @close="bands.open = false">
      <div class="frm"><p class="mut">By annual revenue from the customer ({{ cur }}).</p><label class="label">Enterprise from<input v-model.number="bands.ent" type="number" min="1"></label><label class="label">Mid-market from<input v-model.number="bands.mid" type="number" min="1"></label><p class="mut">Below that is SMB.</p></div>
      <template #foot><button class="btn secondary" @click="bands.open = false">Cancel</button><button class="btn" @click="saveBands">Save</button></template>
    </AppModal>
    <AppModal :open="clr.open" title="Delete all customer data" @close="clr.open = false">
      <div class="frm"><p>This removes every customer and their monthly revenue. Your Financials are not affected.</p><label class="label">Type DELETE to confirm<input v-model="clr.confirm" autocomplete="off"></label></div>
      <template #foot><button class="btn secondary" @click="clr.open = false">Cancel</button><button class="btn danger" :disabled="clr.confirm !== 'DELETE'" @click="clearAll">Delete</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; } .head h1 { margin: 0; } .sub { margin: 4px 0 0; color: var(--c-muted); font-size: 14px; }
.tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .sel { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--c-muted); }
select, input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.seg { display: flex; border: 1px solid var(--c-rule-strong); background: #fff; } .seg button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; } .seg.sm button { padding: 6px 11px; font-size: 12.5px; }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); } .mut { color: var(--c-muted); font-size: 12.5px; margin: 2px 0 0; }
.note { background: #f5f7fb; border: 1px solid #d9e2ef; padding: 10px 14px; font-size: 13.5px; } .warn { background: #fff8ec; border: 1px solid #f0d9ae; color: #6d4a0c; padding: 10px 14px; font-size: 13.5px; margin: 0 0 12px; }
.start { display: grid; gap: 12px; padding: 26px 28px; max-width: 760px; } .start h2 { margin: 0 0 6px; font-family: var(--font-heading); font-weight: 500; } .start p { margin: 0 0 10px; color: var(--c-ink-soft); } .start ul { margin: 0 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .btn.danger { background: var(--c-danger); border-color: var(--c-danger); color: #fff; } .btn.danger:disabled { opacity: .45; } .btn.sm { padding: 6px 12px; font-size: 13px; }
.card.flat { padding: 0; overflow: hidden; margin-bottom: 12px; } .ch { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; padding: 16px 18px 12px; flex-wrap: wrap; } .ch h3 { margin: 0; font-size: 16px; } .gt { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; } .lk.red { color: var(--c-danger); }
.scroll { overflow-x: auto; } .table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); border-top: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; }
td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
td.g { color: var(--c-navy); font-weight: 600; } td.w { color: #8a5a0a; font-weight: 600; } td.r { color: var(--c-danger); font-weight: 600; } td.pos { color: var(--c-navy); } td.neg { color: var(--c-danger); }
.bar { display: inline-block; width: 60px; height: 5px; background: #eef1f6; margin-right: 8px; vertical-align: middle; } .bar i { display: block; height: 100%; background: var(--c-navy); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .charts.two { grid-template-columns: 1.4fr 1fr; }
.coh td.hc { font-variant-numeric: tabular-nums; }
.dat { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; } .dat > div:first-child { display: flex; flex-direction: column; gap: 2px; } .dat span { font-size: 12.5px; color: var(--c-muted); }
.frm { display: flex; flex-direction: column; gap: 10px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .sgb h3 { margin: 0 0 6px; } .sgb p { margin: 0 0 10px; }
@media (max-width: 1000px) { .charts, .charts.two { grid-template-columns: 1fr; } }
.dir { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px; } .dh { display: flex; flex-direction: column; gap: 4px; } .vd { margin: 0; font-family: var(--font-heading); font-size: 19px; line-height: 1.4; color: var(--c-navy); max-width: 980px; }
.sc { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; } .eyebrow { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.act { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; } .ac { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; } .ac b { font-size: 16px; font-weight: 600; color: var(--c-navy); } .ac p { margin: 0; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.5; } .ac em { font-style: normal; font-size: 12.5px; color: var(--c-blue-deep); }
.ac ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; } .ac li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; border-bottom: 1px solid var(--c-rule); padding-bottom: 5px; } .ac li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; } .ac li em { color: #9b3b32; white-space: nowrap; font-size: 12px; }
.charts .wide { grid-column: 1 / -1; }
@media (max-width: 1000px) { .sc, .act { grid-template-columns: 1fr 1fr; } } @media (max-width: 640px) { .sc, .act { grid-template-columns: 1fr; } }
</style>
