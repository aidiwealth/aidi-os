<script setup lang="ts">
// The AI financial review: health score, statements, actions, and growth (actual net worth plus the projection).
const props = defineProps<{ report: Record<string, any>; history: { as_of: string; net_worth: number }[] }>()
const cur = computed(() => (props.report.currency && /^[A-Z]{3}$/.test(props.report.currency) ? props.report.currency : 'USD'))
const m = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(v)
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const tone = computed(() => (props.report.health_score >= 70 ? 'ok' : props.report.health_score >= 45 ? 'mid' : 'low'))
const last = computed(() => props.report.series?.[props.report.series.length - 1])
</script>
<template>
  <div class="fr">
    <div class="top card"><div class="sc" :class="tone"><b>{{ Math.round(report.health_score) }}</b><span>Financial health</span></div><div><p class="sum">{{ report.summary }}</p><p class="mut">Prepared {{ new Date(report.generated).toLocaleDateString('en-GB') }} from the information provided. General guidance, not investment advice.</p></div></div>
    <div class="g3"><div class="card"><h4>Monthly cash flow</h4><div class="rw"><span>Income</span><b>{{ m(report.cash_flow.monthly_income) }}</b></div><div class="rw"><span>Spending &amp; tax</span><b>{{ m(report.cash_flow.monthly_spending) }}</b></div><div class="rw tot"><span>Left over</span><b :class="report.cash_flow.monthly_surplus >= 0 ? 'up' : 'dn'">{{ m(report.cash_flow.monthly_surplus) }}</b></div><p class="mut">Savings rate {{ report.cash_flow.savings_rate_pct.toFixed(0) }}%</p></div>
      <div class="card"><h4>Income statement (yearly)</h4><div v-for="(l, i) in report.income_statement.lines" :key="i" class="rw"><span>{{ l.label }}</span><b :class="l.annual < 0 ? 'neg' : ''">{{ m(l.annual) }}</b></div><div class="rw tot"><span>Net</span><b>{{ m(report.income_statement.net) }}</b></div></div>
      <div class="card"><h4>Balance sheet</h4><div v-for="(l, i) in report.balance_sheet.assets" :key="'a' + i" class="rw"><span>{{ l.label }}</span><b>{{ m(l.value) }}</b></div><div v-for="(l, i) in report.balance_sheet.liabilities" :key="'l' + i" class="rw"><span>{{ l.label }}</span><b class="neg">−{{ m(l.value) }}</b></div><div class="rw tot"><span>Net worth</span><b>{{ m(report.balance_sheet.net_worth) }}</b></div></div></div>
    <div class="card"><div class="gh"><h4>Growth</h4><span class="mut"><i class="lg plan" /> With the plan ({{ m(report.projection.monthly_contribution) }}/month at {{ report.projection.annual_return_pct }}%) <i class="lg asis" /> As is</span></div>
      <MiniLine :values="report.series.map((x: any) => x.plan)" :second="report.series.map((x: any) => x.as_is)" :height="170" />
      <div class="ax"><span>{{ report.series[0]?.year }}</span><span v-if="last">In {{ report.projection.years }} years: <b>{{ m(last.plan) }}</b> with the plan, {{ m(last.as_is) }} as is</span><span>{{ last?.year }}</span></div>
      <template v-if="history.length > 1"><h4 class="h2">Actual net worth (USD), as it grows with your accounts</h4><MiniLine :values="history.map((h) => h.net_worth)" color="#1f7a4d" :height="90" /><div class="ax"><span>{{ history[0]!.as_of }}</span><span>{{ usd(history[history.length - 1]!.net_worth) }}</span><span>{{ history[history.length - 1]!.as_of }}</span></div></template></div>
    <div class="g2"><div class="card"><h4>Strengths</h4><ul><li v-for="(s, i) in report.strengths" :key="i">{{ s }}</li></ul></div><div class="card"><h4>Risks</h4><ul><li v-for="(s, i) in report.risks" :key="i">{{ s }}</li></ul></div></div>
    <div class="card"><h4>What to do</h4><div v-for="(a, i) in report.actions" :key="i" class="ac"><span class="pri" :class="a.priority">{{ a.priority }}</span><div><b>{{ a.title }}</b><span class="mut"> · {{ a.timeframe }}</span><p>{{ a.detail }}</p></div></div></div>
  </div>
</template>
<style scoped>
.fr { display: flex; flex-direction: column; gap: 12px; } .card h4 { margin: 0 0 8px; font-size: 14.5px; } .h2 { margin-top: 14px !important; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; }
.top { display: flex; gap: 18px; align-items: center; } .sc { width: 96px; height: 96px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; border: 6px solid; } .sc b { font-size: 28px; } .sc span { font-size: 10.5px; color: var(--c-muted); text-align: center; } .sc.ok { border-color: #1f7a4d; } .sc.mid { border-color: #b5470b; } .sc.low { border-color: #b42318; } .sum { margin: 0 0 6px; font-size: 14.5px; line-height: 1.55; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .rw { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 4px 0; border-top: 1px solid var(--c-rule); } .rw.tot { font-weight: 600; } .neg { color: var(--c-danger); } .up { color: var(--c-ok); } .dn { color: var(--c-danger); }
.gh { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; } .lg { display: inline-block; width: 14px; height: 3px; vertical-align: middle; margin: 0 4px 0 10px; } .lg.plan { background: #1c4f9c; } .lg.asis { background: #9aa3ad; } .ax { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); margin-top: 4px; }
ul { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.55; } .ac { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .ac p { margin: 2px 0 0; color: var(--c-ink-soft); } .pri { font-size: 11px; text-transform: uppercase; padding: 2px 7px; height: fit-content; background: var(--c-paper-2); font-weight: 600; } .pri.high { background: rgba(180,35,24,.08); color: var(--c-danger); } .pri.medium { background: rgba(181,71,8,.09); color: var(--c-warn); }
@media (max-width: 900px) { .g3, .g2 { grid-template-columns: 1fr; } }
</style>
