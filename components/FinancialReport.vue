<script setup lang="ts">
// The financial review, laid out like the PDF plan and the Aidi Wealth statement: the headline and health score, key
// figures with the next steps, what is owned (pie chart) and owed, where each month's money goes, how we suggest
// spreading the money (today and suggested, as pie charts), what savings could be worth (bars by year), and what is
// going well or needs watching. Used in the portal, on the client page for staff, and on the shared link (read-only).
import { mdRender } from '~/shared/markdown'
import { PLAIN_BUCKET, reportHeadline, reportRest, reportSteps, scoreWord } from '~/shared/wm-report'
const props = defineProps<{ report: Record<string, any>; history: { as_of: string; net_worth: number }[]; api?: string; pdf?: string; ro?: boolean; prepared?: string }>()
const emit = defineEmits<{ share: []; changed: [] }>()
const cur = computed(() => (props.report.currency && /^[A-Z]{3}$/.test(props.report.currency) ? props.report.currency : 'USD'))
const m = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(Math.round(v || 0))
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(v || 0))
const short = (v: number) => { const a = Math.abs(v || 0), s = cur.value === 'USD' ? '$' : cur.value === 'NGN' ? '₦' : ''; return (v < 0 ? '−' : '') + s + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : Math.round(a)) }
const PAL = ['#0c1a2e', '#3d59a6', '#6b9ed9', '#54789a', '#8c9eb3', '#ccdbed']
const score = computed(() => Math.round(Number(props.report.health_score ?? 0)))
const cf = computed(() => props.report.cash_flow ?? {})
const bs = computed(() => props.report.balance_sheet ?? { assets: [], liabilities: [], net_worth: 0 })
const owe = computed(() => (bs.value.liabilities ?? []).reduce((a: number, l: any) => a + Number(l.value || 0), 0))
const own = computed(() => (bs.value.assets ?? []).reduce((a: number, l: any) => a + Math.max(0, Number(l.value || 0)), 0))
const restHtml = computed(() => mdRender(reportRest(props.report)))
// Pie charts: slices as SVG ring paths (viewBox -50..50), starting at the top, clockwise.
function ring(vals: number[], ro = 46, ri = 30) {
  const tot = vals.reduce((a, v) => a + Math.max(0, v), 0); if (!tot) return []
  let a0 = -Math.PI / 2; const pt = (r: number, a: number) => (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2)
  return vals.map((v) => {
    const share = Math.max(0, v) / tot; if (share >= 0.9999) return 'M 0 ' + -ro + ' A ' + ro + ' ' + ro + ' 0 1 1 0 ' + ro + ' A ' + ro + ' ' + ro + ' 0 1 1 0 ' + -ro + ' M 0 ' + -ri + ' A ' + ri + ' ' + ri + ' 0 1 0 0 ' + ri + ' A ' + ri + ' ' + ri + ' 0 1 0 0 ' + -ri + ' Z'
    const a1 = a0 + share * Math.PI * 2, big = share > 0.5 ? 1 : 0
    const d = share <= 0 ? '' : 'M ' + pt(ro, a0) + ' A ' + ro + ' ' + ro + ' 0 ' + big + ' 1 ' + pt(ro, a1) + ' L ' + pt(ri, a1) + ' A ' + ri + ' ' + ri + ' 0 ' + big + ' 0 ' + pt(ri, a0) + ' Z'
    a0 = a1; return d
  })
}
const owned = computed(() => {
  const a = [...(bs.value.assets ?? [])].filter((x: any) => Number(x.value) > 0).sort((x: any, y: any) => y.value - x.value)
  const top = a.slice(0, 5).map((x: any) => ({ label: String(x.label), v: Number(x.value) }))
  if (a.length > 5) top.push({ label: 'Other', v: a.slice(5).reduce((s: number, x: any) => s + Number(x.value), 0) })
  return top.map((x, i) => ({ ...x, c: PAL[i]! }))
})
const ownPaths = computed(() => ring(owned.value.map((x) => x.v)))
const mix = computed(() => ((props.report.fortress?.rows ?? []) as any[]).map((r, i) => ({ ...r, name: r.key === 'tbills' ? 'T-bills or fixed deposits' : PLAIN_BUCKET[r.key] ?? r.label, c: PAL[i % PAL.length]! })))
const nowPaths = computed(() => ring(mix.value.map((r) => r.current_pct))), tgtPaths = computed(() => ring(mix.value.map((r) => r.target_pct)))
const spend = computed(() => Math.max(0, Number(cf.value.monthly_spending || 0))), left = computed(() => Math.max(0, Number(cf.value.monthly_surplus || 0)))
const inc = computed(() => Math.max(spend.value + left.value, Number(cf.value.monthly_income || 0), 1))
const series = computed(() => (props.report.series ?? []) as { year: number; plan: number; as_is: number }[])
const peak = computed(() => Math.max(1, ...series.value.map((s) => Math.max(s.plan, s.as_is))))
const last = computed(() => series.value[series.value.length - 1])
const steps = computed(() => reportSteps(props.report))
const top = computed(() => steps.value.slice(0, 3)), rest = computed(() => steps.value.slice(3))
const doneN = computed(() => steps.value.filter((s) => s.done).length)
const busy = ref('')
async function tick(title: string, done: boolean) {
  if (!props.api || props.ro) return
  busy.value = title
  try { await $fetch(props.api, { method: 'POST', body: { action: 'step_done', title, done } }); emit('changed') } finally { busy.value = '' }
}
function goSteps() { if (import.meta.client) document.getElementById('fr-steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
</script>
<template>
  <div class="fr">
    <section class="card hero">
      <div class="hl">
        <span class="mut">Prepared {{ new Date(prepared ?? report.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }}{{ report.edited_at ? ' · checked by your adviser' : '' }}</span>
        <h2>{{ reportHeadline(report) }}</h2>
        <div v-if="reportRest(report)" class="md" v-html="restHtml" />
        <div class="bt"><button v-if="steps.length" class="btn" @click="goSteps">See your next steps</button><a v-if="pdf" :href="pdf" class="btn secondary">Download PDF report</a><button v-if="!ro && api" class="btn secondary" @click="emit('share')">Share with family</button></div>
      </div>
      <div class="sc"><span class="mut">Financial health</span><div class="sv"><b>{{ score }}</b><span>out of 100</span></div>
        <div class="seg"><i v-for="k in 5" :key="k" :class="{ on: score >= k * 20 - 10 }" /></div><span class="sw">{{ scoreWord(score) }}</span></div>
    </section>

    <section class="cols">
      <div class="card">
        <h3>Key figures</h3>
        <div class="big2"><div><span>Net worth</span><b>{{ m(bs.net_worth) }}</b></div><div><span>Left over each month</span><b>{{ m(cf.monthly_surplus) }}</b></div></div>
        <div class="tr hd"><span /><span>Amount</span></div>
        <div class="tr"><span>Money coming in, a month</span><b>{{ m(cf.monthly_income) }}</b></div>
        <div class="tr in"><span>Spending and tax, a month</span><b>{{ m(cf.monthly_spending) }}</b></div>
        <div class="tr in"><span>Left over, a month</span><b>{{ m(cf.monthly_surplus) }}</b></div>
        <div class="tr"><span>Share of income you keep</span><b>{{ Math.round(cf.savings_rate_pct ?? 0) }}%</b></div>
        <div class="tr"><span>What you own</span><b>{{ m(own) }}</b></div>
        <div class="tr"><span>What you owe</span><b>−{{ m(owe) }}</b></div>
        <div class="tr tot"><span>Net worth</span><b>{{ m(bs.net_worth) }}</b></div>
      </div>
      <div v-if="steps.length" id="fr-steps" class="card">
        <div class="sh"><h3>Your next steps</h3><span class="mut">{{ doneN }} of {{ steps.length }} done</span></div>
        <div v-for="(s, k) in top" :key="s.title" class="ns" :class="{ dn: s.done }">
          <span class="no">{{ s.done ? '✓' : k + 1 }}</span>
          <div><div class="nt"><b>{{ s.title }}</b><em :class="s.priority">{{ s.timeframe }}</em></div><p>{{ s.detail }}</p>
            <button v-if="!ro && api" class="lk" :disabled="busy === s.title" @click="tick(s.title, !s.done)">{{ s.done ? 'Done · undo' : 'Mark as done' }}</button></div>
        </div>
        <details v-if="rest.length" class="all"><summary>All {{ steps.length }} steps, by when</summary>
          <div v-for="s in rest" :key="s.title" class="ar" :class="{ dn: s.done }"><span class="mut">{{ s.timeframe }}</span><span><b>{{ s.title }}</b> {{ s.detail }}</span>
            <label v-if="!ro && api" class="ck"><input type="checkbox" :checked="s.done" :disabled="busy === s.title" @change="tick(s.title, ($event.target as HTMLInputElement).checked)"> Done</label></div>
        </details>
      </div>
    </section>

    <section class="cols">
      <div class="card">
        <h3>What you own</h3>
        <div class="pie">
          <svg viewBox="-50 -50 100 100" class="donut" role="img" :aria-label="'What you own: ' + owned.map((x) => x.label + ' ' + m(x.v)).join(', ')"><circle v-if="!ownPaths.length" r="38" fill="none" stroke="#eeece7" stroke-width="16" /><path v-for="(d, i) in ownPaths" :key="i" :d="d" :fill="owned[i]!.c" fill-rule="evenodd" /><text y="4" text-anchor="middle" class="ctr">{{ short(own) }}</text></svg>
          <div class="leg"><div class="tr hd"><span /><span>Value</span><span>%</span></div>
            <div v-for="x in owned" :key="x.label" class="tr"><span><i :style="{ background: x.c }" />{{ x.label }}</span><b>{{ m(x.v) }}</b><span>{{ own ? Math.round((x.v / own) * 100) : 0 }}%</span></div>
            <div class="tr tot"><span>Total</span><b>{{ m(own) }}</b><span /></div></div>
        </div>
        <h3 class="h2">What you owe</h3>
        <div v-for="(l, i) in bs.liabilities" :key="i" class="tr"><span>{{ l.label }}</span><b>{{ m(l.value) }}</b></div>
        <p v-if="!(bs.liabilities ?? []).length" class="mut">Nothing owed.</p>
        <div class="tr tot"><span>Total owed</span><b>{{ m(owe) }}</b></div>
        <div class="tr nw"><span>Net worth (what you own minus what you owe)</span><b>{{ m(bs.net_worth) }}</b></div>
      </div>
      <div class="card">
        <h3>Money each month</h3>
        <div class="stack"><i :style="{ width: (spend / inc) * 100 + '%', background: '#6b9ed9' }" /><i :style="{ width: (left / inc) * 100 + '%', background: '#0c1a2e' }" /></div>
        <div class="tr"><span><i style="background: #6b9ed9" />Spending and tax</span><b>{{ m(spend) }}</b><span>{{ Math.round((spend / inc) * 100) }}%</span></div>
        <div class="tr"><span><i style="background: #0c1a2e" />Left over</span><b>{{ m(left) }}</b><span>{{ Math.round((left / inc) * 100) }}%</span></div>
        <div class="tr tot"><span>Money coming in, a month</span><b>{{ m(cf.monthly_income) }}</b><span /></div>
        <h3 class="h2">Over a year</h3>
        <div v-for="(l, i) in report.income_statement?.lines ?? []" :key="i" class="tr"><span>{{ l.label }}</span><b :class="{ neg: l.annual < 0 }">{{ m(l.annual) }}</b></div>
        <div class="tr tot"><span>What is left over the year</span><b>{{ m(report.income_statement?.net) }}</b></div>
      </div>
    </section>

    <section class="cols">
      <div v-if="mix.length" class="card">
        <h3>How we suggest spreading your money</h3>
        <div class="pies">
          <figure><svg viewBox="-50 -50 100 100" class="donut" role="img" :aria-label="'Today: ' + mix.map((r) => r.name + ' ' + r.current_pct + '%').join(', ')"><path v-for="(d, i) in nowPaths" :key="i" :d="d" :fill="mix[i]!.c" fill-rule="evenodd" /><text y="4" text-anchor="middle" class="ctr">Today</text></svg></figure>
          <figure><svg viewBox="-50 -50 100 100" class="donut" role="img" :aria-label="'Suggested: ' + mix.map((r) => r.name + ' ' + r.target_pct + '%').join(', ')"><path v-for="(d, i) in tgtPaths" :key="i" :d="d" :fill="mix[i]!.c" fill-rule="evenodd" /><text y="4" text-anchor="middle" class="ctr">Suggested</text></svg></figure>
        </div>
        <div class="tr hd q"><span>Kind of investment</span><span>Today</span><span>Suggested</span><span>To move</span></div>
        <div v-for="r in mix" :key="r.key" class="tr q"><span><i :style="{ background: r.c }" />{{ r.name }}</span><span>{{ r.current_pct }}%</span><span>{{ r.target_pct }}%</span><b :class="r.gap > 0 ? 'add' : r.gap < 0 ? 'cut' : ''">{{ r.gap === 0 ? '—' : (r.gap > 0 ? '+' : '−') + short(Math.abs(r.gap)) }}</b></div>
        <p class="disc">Spreading money across different kinds of investment means one bad year for one of them can't undo your progress. Based on about {{ usd(report.fortress.base) }} you could invest. A general guide, not personal advice: your adviser will go through what fits you before anything moves.</p>
      </div>
      <div v-if="series.length && last" class="card">
        <h3>What your savings could be worth</h3>
        <div class="big2"><div><span>Following the plan, {{ last.year }}</span><b>{{ m(last.plan) }}</b></div><div><span>If nothing changes, {{ last.year }}</span><b class="grey">{{ m(last.as_is) }}</b></div></div>
        <div class="chart" role="img" :aria-label="'Following the plan grows to ' + m(last.plan) + ' by ' + last.year + '; if nothing changes, ' + m(last.as_is)">
          <div class="yax"><span>{{ short(peak) }}</span><span>{{ short(peak / 2) }}</span><span>{{ short(0) }}</span></div>
          <div class="plot"><i class="g g1" /><i class="g g2" />
            <div v-for="s in series" :key="s.year" class="yr"><div class="pair"><i class="pl" :style="{ height: (s.plan / peak) * 100 + '%' }" /><i class="ai" :style="{ height: (s.as_is / peak) * 100 + '%' }" /></div><span>{{ s.year }}</span></div></div>
        </div>
        <div class="key"><span><i class="pl" />Following the plan</span><span><i class="ai" />If nothing changes</span></div>
        <p class="disc">Assumes {{ m(report.projection?.monthly_contribution) }} a month invested, growing {{ report.projection?.annual_return_pct }}% a year after costs. Real returns go up and down; this is a guide, not a promise.</p>
      </div>
    </section>

    <section class="cols">
      <div class="card"><h3>Going well</h3><ul class="ls"><li v-for="(s, i) in report.strengths" :key="i"><span class="ic">+</span>{{ s }}</li></ul></div>
      <div class="card"><h3>Watch out for</h3><ul class="ls"><li v-for="(s, i) in report.risks" :key="i"><span class="ic w">!</span>{{ s }}</li></ul></div>
    </section>

    <section v-if="history.length > 1" class="card"><h3>Your net worth so far (USD)</h3><MiniLine :values="history.map((h) => h.net_worth)" color="#3d59a6" :height="90" /><div class="ax"><span>{{ history[0]!.as_of }}</span><span>{{ usd(history[history.length - 1]!.net_worth) }}</span><span>{{ history[history.length - 1]!.as_of }}</span></div></section>
    <p class="foot">Prepared by Aidi Wealth from the information provided. General guidance, not investment advice.</p>
  </div>
</template>
<style scoped>
.fr { display: flex; flex-direction: column; gap: 14px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } h3 { margin: 0 0 12px; font-size: 17px; font-weight: 500; color: var(--c-navy); padding-top: 10px; border-top: 1px solid var(--c-rule); } .h2 { margin-top: 22px; }
.hero { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; padding: 28px; } .hl { flex: 999 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.hl h2 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -0.02em; color: var(--c-navy); } .md { color: var(--c-ink-soft); line-height: 1.55; max-width: 680px; } .md :deep(p) { margin: 0 0 8px; } .md :deep(ul), .md :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.bt { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; } .bt a { text-decoration: none; }
.sc { flex: 1 1 220px; display: flex; flex-direction: column; gap: 8px; background: #f3f3f3; padding: 18px; }
.sv { display: flex; align-items: baseline; gap: 6px; } .sv b { font-size: 44px; line-height: 1; color: var(--c-navy); } .sv span { color: var(--c-muted); font-size: 13px; }
.seg { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; } .seg i { height: 8px; background: #ccdbed; } .seg i.on { background: #3d59a6; } .sw { font-size: 13px; color: var(--c-ink-soft); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; } .cols .card { min-width: 0; }
.big2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: #f3f3f3; padding: 12px 14px; margin-bottom: 12px; } .big2 span { display: block; font-size: 12px; color: var(--c-muted); } .big2 b { font-size: 22px; font-weight: 500; color: var(--c-navy); } .big2 b.grey { color: #6e737b; }
.tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 6px 4px; font-size: 14px; } .tr b { font-weight: 600; text-align: right; } .tr.in { padding-left: 14px; }
.tr.hd { font-size: 12px; color: var(--c-muted); border-bottom: 1px solid var(--c-rule); padding-bottom: 4px; } .tr.hd span:not(:first-child) { text-align: right; }
.tr.tot { background: #f3f3f3; font-weight: 600; margin-top: 4px; } .tr.nw { background: #ccdbed; font-weight: 600; margin-top: 8px; } .neg { color: var(--c-muted); }
.tr > span:first-child { display: flex; align-items: center; gap: 8px; min-width: 0; } .tr > span:first-child i, .key i { width: 11px; height: 11px; flex: none; display: block; }
.tr:has(> span:nth-child(3)) { grid-template-columns: minmax(0, 1fr) auto 48px; } .tr:has(> span:nth-child(3)) > span:last-child { text-align: right; }
.tr.q.q { grid-template-columns: minmax(0, 1fr) 56px 76px 70px; } .tr.q > span:not(:first-child), .tr.q > b { text-align: right; }
.sh { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--c-rule); padding-top: 10px; margin-bottom: 12px; } .sh h3 { flex: 1; border-top: 0; padding-top: 0; margin: 0; } .sh .mut { margin-left: 8px; }
.ns { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .ns.dn b { text-decoration: line-through; color: var(--c-muted); }
.no { width: 24px; height: 24px; background: var(--c-navy); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12.5px; }
.nt { display: flex; justify-content: space-between; gap: 10px; } .nt b { font-size: 15px; color: var(--c-navy); } .nt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); white-space: nowrap; } .nt em.high { color: var(--c-warn); }
.ns p { margin: 4px 0; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.5; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.all { margin-top: 12px; } .all summary { cursor: pointer; font-weight: 600; color: var(--c-blue-deep); font-size: 14px; }
.ar { display: grid; grid-template-columns: 110px minmax(0, 1fr) 70px; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .ar.dn b { text-decoration: line-through; color: var(--c-muted); } .ck { display: flex; gap: 6px; align-items: center; font-size: 13px; justify-self: end; }
.pie { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 16px; align-items: center; } .donut { width: 100%; max-width: 130px; display: block; } .ctr { font-size: 9px; font-weight: 600; fill: var(--c-ink); }
.pies { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 10px; } .pies figure { margin: 0; display: flex; justify-content: center; }
.stack { display: flex; height: 26px; margin-bottom: 10px; } .stack i { display: block; height: 100%; }
.chart { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 6px; height: 220px; } .yax { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: var(--c-muted); text-align: right; padding-bottom: 20px; }
.plot { position: relative; display: flex; gap: 10px; align-items: stretch; } .plot .g { position: absolute; left: 0; right: 0; height: 1px; background: #eeece7; } .g1 { top: 0; } .g2 { top: calc((100% - 20px) / 2); }
.yr { flex: 1; display: flex; flex-direction: column; position: relative; } .pair { flex: 1; display: flex; gap: 3px; align-items: flex-end; justify-content: center; border-bottom: 1px solid var(--c-rule-strong); } .pair i { width: 38%; max-width: 22px; display: block; min-height: 2px; }
.yr > span { font-size: 11.5px; color: var(--c-muted); text-align: center; height: 20px; line-height: 20px; } .pl { background: #0c1a2e; } .ai { background: #ccdbed; }
.key { display: flex; flex-wrap: wrap; gap: 18px; font-size: 13px; color: var(--c-ink-soft); margin-top: 10px; } .key span { display: flex; align-items: center; gap: 6px; }
.add { color: #3d59a6; } .cut { color: var(--c-warn); } .disc { margin: 12px 0 0; font-size: 12.5px; color: var(--c-muted); line-height: 1.5; }
.ls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.5; } .ls li { display: flex; gap: 8px; } .ic { color: #3d59a6; font-weight: 700; flex: none; width: 12px; } .ic.w { color: var(--c-warn); }
.ax { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); margin-top: 4px; } .foot { font-size: 12.5px; color: var(--c-muted); margin: 0; }
@media (max-width: 560px) { .pie { grid-template-columns: 1fr; } .donut { margin: 0 auto; } .ar { grid-template-columns: 1fr; gap: 4px; } .tr.q.q { grid-template-columns: minmax(0, 1fr) 48px 64px 60px; font-size: 13px; } }
</style>
