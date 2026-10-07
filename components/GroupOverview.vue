<script setup lang="ts">
import VcInsights from '~/pages/analytics.vue'
import FoInsights from '~/pages/family-office/analytics.vue'
import CsInsights from '~/pages/client-services/analytics.vue'
useHead({ title: 'Overview' })
const { data: modsO } = await useFetch<{ code: string; usable: boolean }[]>('/api/modules', { key: 'modules' })
const has = (c: string) => !!modsO.value?.some((m) => m.code === c && m.usable)
const TABS = computed(() => [['overview', 'Overview'], ...(has('analytics') ? [['vc', 'Venture capital']] : []), ...(has('fo_analytics') ? [['fo', 'Family office']] : []), ...(has('cs_analytics') ? [['cs', 'Client services']] : []), ...(has('wealth_mgmt') ? [['wm', 'Wealth management']] : [])] as [string, string][])
const otab = ref(String(useRoute().query.tab ?? 'overview'))
type Pt = { period: string; value: number }
interface O {
  name: string; org: string; today: string
  vc?: { pitches?: { last30: number; fresh: number; series: Pt[] }; pipeline?: { open: number; deployed: number; invested: number; byStage: Record<string, number> }; portfolio?: { active: number; revenue: number; revenuePeriod: string | null; series: Pt[]; reportsSent: number; reportsDone: number } }
  fo?: { entities?: number; documents?: number; compliance?: { overdue: number; week: number; month: number }; cash?: { byCurrency: { currency: string; value: number }[]; main: string; series: Pt[] }; circulating?: number }
  credit?: { active: number; outstanding: { currency: string; value: number }[]; arrears: number }
  cs?: { open: number; overdue: number; week: number; done30: number }
  attention: { tone: 'red' | 'amber' | 'blue'; text: string; to: string }[]
  activity: { at: string; who: string | null; text: string; area: string }[]
  quick: { label: string; to: string }[]
}
const { data } = await useFetch<O>('/api/overview')
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
const first = computed(() => (data.value?.name ?? '').split(' ')[0])
const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const money = (v: number, c = 'USD') => { const a = Math.abs(v); const s = a >= 1e9 ? (v / 1e9).toFixed(1) + 'bn' : a >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : a >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : Math.round(v).toLocaleString(); return (c === 'USD' ? '$' : c === 'NGN' ? '₦' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c + ' ') + s }
const pts = (s?: Pt[]) => (s ?? []).map((x) => ({ label: new Date(x.period + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.value }))
const month = (p: string | null) => (p ? new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : '')
const ago = (s: string) => { const m = Math.floor((Date.now() - Date.parse(s)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago' }
const STAGE: Record<string, string> = { screening: 'Screening', first_call: 'First call', diligence: 'Diligence', ic: 'IC' }
interface Kpi { label: string; value: string; sub: string; to: string; tone?: string }
const kpis = computed<Kpi[]>(() => {
  const d = data.value; if (!d) return []
  const k: Kpi[] = []
  if (d.vc?.pitches) k.push({ label: 'Pitches, last 30 days', value: String(d.vc.pitches.last30), sub: d.vc.pitches.fresh + ' new to review', to: '/deals' })
  if (d.vc?.pipeline) k.push({ label: 'Open deals', value: String(d.vc.pipeline.open), sub: money(d.vc.pipeline.deployed) + ' deployed · ' + d.vc.pipeline.invested + ' invested', to: '/pipeline' })
  if (d.vc?.portfolio) k.push({ label: 'Portfolio revenue', value: money(d.vc.portfolio.revenue), sub: d.vc.portfolio.active + ' companies' + (d.vc.portfolio.revenuePeriod ? ' · ' + month(d.vc.portfolio.revenuePeriod) : ''), to: '/portfolio' })
  if (d.fo?.cash) { const fc = d.fo.cash as typeof d.fo.cash & { totalUsd?: number }; k.push({ label: 'Group cash', value: fc.byCurrency.length ? (fc.byCurrency.length > 1 && fc.totalUsd != null ? '≈ ' + money(fc.totalUsd, 'USD') : money(fc.byCurrency[0]!.value, fc.byCurrency[0]!.currency)) : '—', sub: fc.byCurrency.length > 1 ? fc.byCurrency.map((c) => money(c.value, c.currency)).join(' + ') + ' (naira converted at today\'s rate)' : 'from tied-out statements', to: '/banking' }) }
  if (d.fo?.compliance) k.push({ label: 'Compliance, next 30 days', value: String(d.fo.compliance.month), sub: d.fo.compliance.overdue ? d.fo.compliance.overdue + ' overdue' : 'nothing overdue', to: '/compliance', tone: d.fo.compliance.overdue ? 'red' : '' })
  if (d.credit) k.push({ label: 'Loan book', value: d.credit.outstanding.length ? money(d.credit.outstanding[0]!.value, d.credit.outstanding[0]!.currency) : '—', sub: d.credit.active + ' active · ' + d.credit.arrears + ' in arrears', to: '/credit', tone: d.credit.arrears ? 'red' : '' })
  if (d.cs) k.push({ label: 'Open client jobs', value: String(d.cs.open), sub: d.cs.week + ' due this week · ' + d.cs.done30 + ' done in 30 days', to: '/services', tone: d.cs.overdue ? 'red' : '' })
  if (d.fo?.entities !== undefined && k.length < 8) k.push({ label: 'Entities', value: String(d.fo.entities), sub: (d.fo.documents ?? 0) + ' documents', to: '/entities' })
  return k.slice(0, 8)
})
const charts = computed(() => {
  const d = data.value; if (!d) return []
  const c: { title: string; sub: string; points: { label: string; value: number }[]; unit: 'usd' | 'count'; foot: string; symbol?: string }[] = []
  if (d.vc?.pitches) c.push({ title: 'Pitches received', sub: 'Per month', points: pts(d.vc.pitches.series), unit: 'count', foot: d.vc.pitches.series.reduce((s, x) => s + x.value, 0) + ' in 12 months' })
  if (d.vc?.portfolio) c.push({ title: 'Portfolio revenue', sub: 'Combined, per month', points: pts(d.vc.portfolio.series), unit: 'usd', foot: d.vc.portfolio.reportsDone + ' of ' + d.vc.portfolio.reportsSent + ' updates in for last month' })
  if (d.fo?.cash) c.push({ title: 'Group cash', sub: d.fo.cash.main + ', month end', points: pts(d.fo.cash.series), unit: 'usd', symbol: ({ USD: '$', NGN: '₦', GBP: '£', EUR: '€' } as Record<string, string>)[d.fo.cash.main] ?? d.fo.cash.main + ' ', foot: d.fo.cash.byCurrency.length + ' currenc' + (d.fo.cash.byCurrency.length === 1 ? 'y' : 'ies') })
  return c.slice(0, 3)
})
const empty = computed(() => !!data.value && !kpis.value.length)
</script>

<template>
  <section v-if="data" class="ov">
    <div class="head">
      <div><p class="date">{{ dateLabel }}</p><h1>{{ greeting }}{{ first ? ', ' + first : '' }}</h1></div>
      <div v-if="data.quick.length" class="quick"><NuxtLink v-for="q in data.quick" :key="q.to" :to="q.to" class="btn secondary">{{ q.label }}</NuxtLink></div>
    </div>

    <nav v-if="TABS.length > 1" class="otabs" role="tablist"><button v-for="[k, l] in TABS" :key="k" role="tab" :aria-selected="otab === k" :class="{ on: otab === k }" @click="otab = k">{{ l }}</button></nav>
    <div v-if="otab === 'vc'" class="ovtab"><VcInsights /></div>
    <div v-else-if="otab === 'fo'" class="ovtab"><FoInsights /></div>
    <div v-else-if="otab === 'cs'" class="ovtab"><CsInsights /></div>
    <div v-else-if="otab === 'wm'" class="ovtab"><WmAnalytics /></div>
    <template v-else>
    <div v-if="empty" class="card none"><span class="wic"><AppIcon name="home" /></span><h2>Welcome to {{ data.org }}</h2><p class="muted">Your areas will show their figures here as you add entities, deals, documents and accounts. Use the menu to get started.</p></div>

    <div v-if="kpis.length" class="kpis" :class="'n' + Math.min(4, kpis.length)">
      <NuxtLink v-for="k in kpis" :key="k.label" :to="k.to" class="kpi"><span class="kl">{{ k.label }}</span><b>{{ k.value }}</b><span class="ks" :class="k.tone">{{ k.sub }}</span></NuxtLink>
    </div>

    <div v-if="charts.length" class="charts" :class="'n' + charts.length">
      <TrendChart v-for="c in charts" :key="c.title" class="card" :title="c.title" :sub="c.sub" :points="c.points" :unit="c.unit" :symbol="c.symbol" :foot="c.foot" />
    </div>

    <div class="two">
      <div class="card att">
        <h2>Needs attention</h2>
        <ul v-if="data.attention.length"><li v-for="(a, i) in data.attention" :key="i"><NuxtLink :to="a.to"><span class="dot" :class="a.tone" />{{ a.text }}<AppIcon name="right" class="go" /></NuxtLink></li></ul>
        <p v-else class="clear">All clear. Nothing needs you right now.</p>
        <div v-if="data.vc?.pipeline && Object.keys(data.vc.pipeline.byStage).length" class="stages">
          <p class="kl">Pipeline by stage</p>
          <div class="sbar"><NuxtLink v-for="(n, s) in data.vc.pipeline.byStage" :key="s" to="/pipeline" :style="{ flex: n }" :title="STAGE[s] + ': ' + n"><span>{{ STAGE[s] ?? s }}</span><b>{{ n }}</b></NuxtLink></div>
        </div>
      </div>
      <div class="card act">
        <h2>Recent activity</h2>
        <ul v-if="data.activity.length" class="tl"><li v-for="(a, i) in data.activity" :key="i"><span class="ic"><AppIcon :name="a.area" /></span><span class="tt"><b>{{ a.text }}</b><em>{{ a.who ?? 'System' }} · {{ ago(a.at) }}</em></span></li></ul>
        <EmptyState v-else compact icon="home" title="No activity yet" />
      </div>
    </div>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.date { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); }
.quick { display: flex; gap: 8px; flex-wrap: wrap; }
.none { margin-bottom: 16px; } .none h2 { margin-bottom: 6px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpis.n1 { grid-template-columns: 1fr; } .kpis.n2 { grid-template-columns: repeat(2, 1fr); } .kpis.n3 { grid-template-columns: repeat(3, 1fr); }
.kpi { background: var(--c-paper); border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; transition: border-color .12s; }
.kpi:hover { border-color: var(--c-blue-deep); text-decoration: none; }
.kl { font-size: 12.5px; font-weight: 500; color: var(--c-muted); }
.kpi b { font-size: 32px; line-height: 1.05; color: var(--c-navy); }
.ks { font-size: 12px; color: var(--c-muted); } .ks.red { color: var(--c-danger); }
.charts { display: grid; gap: 12px; margin-bottom: 16px; } .charts.n2 { grid-template-columns: 1fr 1fr; } .charts.n3 { grid-template-columns: repeat(3, 1fr); }
.charts .card { padding: 0; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.two h2 { margin-bottom: 12px; }
.att ul, .tl { list-style: none; padding: 0; margin: 0; }
.att li a { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--c-rule); color: var(--c-ink); font-size: 14px; text-decoration: none; }
.att li a:hover { color: var(--c-blue-deep); }
.dot { width: 8px; height: 8px; flex: none; } .dot.red { background: var(--c-danger); } .dot.amber { background: var(--c-warn); } .dot.blue { background: var(--c-blue); }
.go { width: 14px; height: 14px; margin-left: auto; color: var(--c-muted); }
.clear { color: var(--c-ok); margin: 0; }
.stages { margin-top: 18px; } .stages .kl { display: block; margin-bottom: 8px; }
.sbar { display: flex; gap: 2px; } .sbar a { min-width: 64px; background: var(--c-signal-soft); padding: 8px 10px; display: flex; flex-direction: column; text-decoration: none; color: var(--c-blue-deep); font-size: 12px; }
.sbar a b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); } .sbar a:hover { background: rgba(28,84,125,.14); }
.tl li { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); }
.tl .ic { width: 28px; height: 28px; flex: none; display: grid; place-items: center; background: var(--c-paper-2); color: var(--c-blue-deep); } .tl .ic svg { width: 15px; height: 15px; }
.tt { display: flex; flex-direction: column; } .tt b { font-weight: 500; font-size: 13.5px; color: var(--c-ink); } .tt em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.muted { color: var(--c-muted); }
@media (max-width: 1100px) { .kpis, .kpis.n3 { grid-template-columns: repeat(2, 1fr); } .charts.n2, .charts.n3, .two { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .kpis, .kpis.n2, .kpis.n3 { grid-template-columns: 1fr; } }
.wic { width: 64px; height: 64px; border-radius: 50%; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; margin: 0 auto 12px; } .wic :deep(svg) { width: 28px; height: 28px; } .card.none { text-align: center; padding: 44px 24px; }
.otabs { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 4px 0 18px; width: fit-content; max-width: 100%; overflow-x: auto; } .otabs button { background: none; border: 0; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; color: var(--c-ink-soft); white-space: nowrap; } .otabs button.on { background: #fff; color: var(--c-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
</style>
