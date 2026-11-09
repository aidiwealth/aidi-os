<script setup lang="ts">
// The financial review, in plain words: a headline and health score, four key figures, the next three steps (ticked
// off as they go) and the rest by when, where the month's money goes, what they own and owe, what savings could be
// worth, how we suggest spreading the money, and what is going well or needs watching. Used in the portal, on the
// client page for staff, and on the shared family link (read-only).
import { PLAIN_BUCKET, reportHeadline, reportRest, reportSteps, scoreWord } from '~/shared/wm-report'
const props = defineProps<{ report: Record<string, any>; history: { as_of: string; net_worth: number }[]; api?: string; pdf?: string; ro?: boolean; prepared?: string }>()
const emit = defineEmits<{ share: []; changed: [] }>()
const cur = computed(() => (props.report.currency && /^[A-Z]{3}$/.test(props.report.currency) ? props.report.currency : 'USD'))
const m = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(Math.round(v || 0))
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(v || 0))
const score = computed(() => Math.round(Number(props.report.health_score ?? 0)))
const cf = computed(() => props.report.cash_flow ?? {})
const bs = computed(() => props.report.balance_sheet ?? { assets: [], liabilities: [], net_worth: 0 })
const owe = computed(() => (bs.value.liabilities ?? []).reduce((a: number, l: any) => a + Number(l.value || 0), 0))
const own = computed(() => (bs.value.assets ?? []).reduce((a: number, l: any) => a + Math.max(0, Number(l.value || 0)), 0))
const steps = computed(() => reportSteps(props.report))
const top = computed(() => steps.value.slice(0, 3)), rest = computed(() => steps.value.slice(3))
const doneN = computed(() => steps.value.filter((s) => s.done).length)
const when = (s: { priority: string }) => (s.priority === 'high' ? 'Now' : s.priority === 'medium' ? 'Soon' : 'Later')
const series = computed(() => (props.report.series ?? []) as { year: number; plan: number; as_is: number }[])
const peak = computed(() => Math.max(1, ...series.value.map((s) => Math.max(s.plan, s.as_is))))
const last = computed(() => series.value[series.value.length - 1])
const spend = computed(() => Math.max(0, Number(cf.value.monthly_spending || 0))), left = computed(() => Math.max(0, Number(cf.value.monthly_surplus || 0)))
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
        <p v-if="reportRest(report)">{{ reportRest(report) }}</p>
        <div class="bt"><button v-if="steps.length" class="btn" @click="goSteps">See your next steps</button><a v-if="pdf" :href="pdf" class="btn secondary">Download PDF report</a><button v-if="!ro && api" class="btn secondary" @click="emit('share')">Share with family</button></div>
      </div>
      <div class="sc"><span class="mut">Financial health</span><div class="sv"><b>{{ score }}</b><span>out of 100</span></div>
        <div class="seg"><i v-for="k in 5" :key="k" :class="{ on: score >= k * 20 - 10 }" /></div><span class="sw">{{ scoreWord(score) }}</span></div>
    </section>

    <section class="tiles">
      <div class="card t"><span>Net worth</span><b>{{ m(bs.net_worth) }}</b><em>What you own minus what you owe</em></div>
      <div class="card t"><span>Left over each month</span><b>{{ m(cf.monthly_surplus) }}</b><em>After tax and spending</em></div>
      <div class="card t"><span>You keep</span><b>{{ Math.round(cf.savings_rate_pct ?? 0) }}%</b><em>of your income. 20% is already good.</em></div>
      <div class="card t"><span>You owe</span><b>{{ m(owe) }}</b><em>{{ (bs.liabilities ?? []).length ? (bs.liabilities.length + ' debt' + (bs.liabilities.length === 1 ? '' : 's')) : 'No debts' }}</em></div>
    </section>

    <section v-if="steps.length" id="fr-steps" class="card">
      <div class="sh"><h3>Your next {{ top.length === 1 ? 'step' : top.length + ' steps' }}</h3><span class="mut">{{ doneN }} of {{ steps.length }} done{{ ro ? '' : ' · tick them off as you go' }}</span></div>
      <div class="cards">
        <div v-for="(s, k) in top" :key="s.title" class="st" :class="{ dn: s.done }">
          <div class="sth"><span class="no">{{ s.done ? '✓' : k + 1 }}</span><span class="tf" :class="s.priority">{{ s.timeframe || when(s) }}</span></div>
          <b>{{ s.title }}</b><p>{{ s.detail }}</p>
          <button v-if="!ro && api" class="btn secondary" :disabled="busy === s.title" @click="tick(s.title, !s.done)">{{ s.done ? 'Done · undo' : 'Mark as done' }}</button>
        </div>
      </div>
      <details v-if="rest.length" class="all"><summary>All {{ steps.length }} steps, by when</summary>
        <div v-for="s in rest" :key="s.title" class="ar" :class="{ dn: s.done }"><span class="mut">{{ s.timeframe }}</span><span><b>{{ s.title }}</b> {{ s.detail }}</span>
          <label v-if="!ro && api" class="ck"><input type="checkbox" :checked="s.done" :disabled="busy === s.title" @change="tick(s.title, ($event.target as HTMLInputElement).checked)"> Done</label><span v-else class="mut">{{ when(s) }}</span></div>
      </details>
    </section>

    <section class="g2">
      <div class="card">
        <h3>Where each month's money goes</h3>
        <div class="stack"><i class="sp" :style="{ flex: spend || 0.0001 }" /><i class="lf" :style="{ flex: left || 0.0001 }" /></div>
        <div class="lg"><span><i class="sp" />Spending and tax</span><b>{{ m(spend) }}</b></div>
        <div class="lg"><span><i class="lf" />Left over</span><b>{{ m(left) }}</b></div>
        <div class="lg tot"><span>Money coming in, a month</span><b>{{ m(cf.monthly_income) }}</b></div>
      </div>
      <div class="card">
        <h3>What you own and owe</h3>
        <span class="lb">Own</span>
        <div v-for="(a, i) in bs.assets" :key="'a' + i" class="ow"><span>{{ a.label }}</span><b>{{ m(a.value) }}</b><i :style="{ width: own ? Math.min(100, (Math.max(0, a.value) / own) * 100) + '%' : '0' }" /></div>
        <span class="lb">Owe</span>
        <div v-for="(l, i) in bs.liabilities" :key="'l' + i" class="ow"><span>{{ l.label }}</span><b>{{ m(l.value) }}</b></div>
        <p v-if="!(bs.liabilities ?? []).length" class="mut">Nothing owed.</p>
        <div class="lg tot"><span>Net worth</span><b>{{ m(bs.net_worth) }}</b></div>
      </div>
    </section>

    <section v-if="series.length && last" class="card">
      <h3>What your savings could be worth</h3>
      <p class="mut">If you invest {{ m(report.projection?.monthly_contribution) }} a month from now, compared with leaving things as they are.</p>
      <div class="two"><div><span class="mut">Following the plan, in {{ last.year }}</span><b>{{ m(last.plan) }}</b></div><div><span class="mut">If nothing changes, in {{ last.year }}</span><b class="grey">{{ m(last.as_is) }}</b></div></div>
      <div class="bars" role="img" :aria-label="'Following the plan grows to ' + m(last.plan) + ' by ' + last.year + '; if nothing changes, ' + m(last.as_is)">
        <div v-for="s in series" :key="s.year" class="yr"><div class="pair"><i class="pl" :style="{ height: (s.plan / peak) * 100 + '%' }" /><i class="ai" :style="{ height: (s.as_is / peak) * 100 + '%' }" /></div><span>{{ s.year }}</span></div>
      </div>
      <div class="key"><span><i class="pl" />Following the plan</span><span><i class="ai" />If nothing changes</span><span class="mut">Assumes {{ report.projection?.annual_return_pct }}% growth a year after costs. Real returns go up and down.</span></div>
    </section>

    <section v-if="report.fortress?.rows?.length" class="card">
      <div class="sh"><h3>How we suggest spreading your money</h3></div>
      <p class="mut">On about {{ usd(report.fortress.base) }} you could invest. Spreading money across different kinds of investment means one bad year for one of them can't undo your progress.</p>
      <div class="mx hd"><span>Kind of investment</span><span>Dark bar: now · outline: suggested</span><span class="n">To move</span></div>
      <div v-for="x in report.fortress.rows" :key="x.key" class="mx"><span>{{ PLAIN_BUCKET[x.key] ?? x.label }}</span>
        <span class="mb"><i class="now" :style="{ width: Math.min(100, x.current_pct) + '%' }" /><i class="tgt" :style="{ width: x.target_pct + '%' }" /></span>
        <b class="n" :class="x.gap > 0 ? 'add' : x.gap < 0 ? 'cut' : ''">{{ x.gap === 0 ? '—' : (x.gap > 0 ? '+' : '−') + usd(Math.abs(x.gap)) }}</b></div>
      <p class="disc">A general guide to a resilient mix, not personal investment, tax or legal advice. Your adviser will go through what fits you before anything moves.</p>
    </section>

    <section class="g2">
      <div class="card"><h3>Going well</h3><ul class="ls"><li v-for="(s, i) in report.strengths" :key="i"><span class="ic">✓</span>{{ s }}</li></ul></div>
      <div class="card"><h3>Watch out for</h3><ul class="ls"><li v-for="(s, i) in report.risks" :key="i"><span class="ic w">!</span>{{ s }}</li></ul></div>
    </section>

    <section v-if="history.length > 1" class="card"><h3>Your net worth so far (USD)</h3><MiniLine :values="history.map((h) => h.net_worth)" color="#1c547d" :height="90" /><div class="ax"><span>{{ history[0]!.as_of }}</span><span>{{ usd(history[history.length - 1]!.net_worth) }}</span><span>{{ history[history.length - 1]!.as_of }}</span></div></section>
    <p class="foot">Prepared by Aidi Wealth from the information provided. General guidance, not investment advice.</p>
  </div>
</template>
<style scoped>
.fr { display: flex; flex-direction: column; gap: 14px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } h3 { margin: 0 0 10px; font-size: 18px; color: var(--c-navy); }
.hero { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; padding: 28px; } .hl { flex: 999 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.hl h2 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -0.02em; color: var(--c-navy); } .hl p { margin: 0; color: var(--c-ink-soft); line-height: 1.55; max-width: 680px; }
.bt { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; } .bt a { text-decoration: none; }
.sc { flex: 1 1 220px; display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--c-rule); background: #fbfaf8; padding: 18px; }
.sv { display: flex; align-items: baseline; gap: 6px; } .sv b { font-size: 44px; line-height: 1; color: var(--c-navy); } .sv span { color: var(--c-muted); font-size: 13px; }
.seg { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; } .seg i { height: 8px; background: #d9e3ec; } .seg i.on { background: var(--c-blue-deep); } .sw { font-size: 13px; color: var(--c-ink-soft); }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .t { display: flex; flex-direction: column; gap: 3px; } .t span { font-size: 13px; color: var(--c-muted); } .t b { font-size: 24px; color: var(--c-navy); } .t em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.sh { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
.st { border: 1px solid var(--c-rule); padding: 18px; display: flex; flex-direction: column; gap: 8px; } .st.dn { background: #f7f9fb; } .st.dn b { text-decoration: line-through; color: var(--c-muted); }
.sth { display: flex; justify-content: space-between; align-items: center; } .no { width: 28px; height: 28px; background: var(--c-navy); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; }
.tf { font-size: 12px; font-weight: 600; color: var(--c-muted); } .tf.high { color: var(--c-warn); } .st b { font-size: 16px; color: var(--c-navy); } .st p { margin: 0; font-size: 14px; color: var(--c-ink-soft); line-height: 1.5; flex: 1; }
.all { border-top: 1px solid var(--c-rule); margin-top: 14px; padding-top: 12px; } .all summary { cursor: pointer; font-weight: 600; color: var(--c-blue-deep); font-size: 14px; }
.ar { display: grid; grid-template-columns: 130px minmax(0, 1fr) 80px; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .ar.dn b { text-decoration: line-through; color: var(--c-muted); } .ck { display: flex; gap: 6px; align-items: center; font-size: 13px; justify-self: end; }
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.stack { display: flex; height: 26px; margin-bottom: 10px; } .stack i, .lg i { display: block; } .sp { background: var(--c-blue-deep); } .lf { background: var(--c-navy); }
.lg { display: flex; justify-content: space-between; font-size: 14px; padding: 5px 0; } .lg span { display: flex; align-items: center; gap: 8px; } .lg i { width: 10px; height: 10px; } .lg.tot { border-top: 1px solid var(--c-rule); margin-top: 6px; padding-top: 10px; color: var(--c-muted); }
.lb { display: block; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); margin: 6px 0 4px; }
.ow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; font-size: 14px; padding: 4px 0; } .ow i { grid-column: 1 / -1; display: block; height: 5px; background: var(--c-blue-deep); }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; } .two > div { border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; } .two b { font-size: 26px; color: var(--c-navy); } .two b.grey { color: #6e737b; }
.bars { display: flex; gap: 10px; align-items: stretch; height: 210px; padding-top: 6px; } .yr { flex: 1; display: flex; flex-direction: column; } .pair { flex: 1; display: flex; gap: 4px; align-items: flex-end; border-bottom: 1px solid var(--c-rule-strong); } .pair i { flex: 1; display: block; min-height: 2px; }
.yr span { font-size: 12px; color: var(--c-muted); text-align: center; padding-top: 6px; } .pl { background: var(--c-navy); } .ai { background: #c9ced5; }
.key { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--c-ink-soft); margin-top: 12px; } .key span { display: flex; align-items: center; gap: 6px; } .key i { width: 12px; height: 12px; display: block; }
.mx { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr) 110px; gap: 12px 18px; align-items: center; padding: 9px 0; font-size: 14px; border-top: 1px solid var(--c-rule); } .mx.hd { font-size: 12px; color: var(--c-muted); border-top: 0; margin-top: 10px; } .n { text-align: right; }
.mb { position: relative; height: 14px; background: var(--c-paper-2); display: block; } .mb .now { position: absolute; left: 0; top: 0; height: 14px; background: var(--c-navy); } .mb .tgt { position: absolute; left: 0; top: 0; height: 14px; border: 1.5px solid var(--c-blue-deep); box-sizing: border-box; }
.add { color: var(--c-blue-deep); } .cut { color: var(--c-warn); } .disc { margin: 12px 0 0; font-size: 12.5px; color: var(--c-muted); background: var(--c-paper-2); padding: 10px 12px; }
.ls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.5; } .ls li { display: flex; gap: 8px; } .ic { color: var(--c-blue-deep); font-weight: 700; flex: none; } .ic.w { color: var(--c-warn); }
.ax { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); margin-top: 4px; } .foot { font-size: 12.5px; color: var(--c-muted); margin: 0; }
@media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cards, .g2 { grid-template-columns: 1fr; } .ar { grid-template-columns: 1fr; gap: 4px; } .mx { grid-template-columns: minmax(0, 1fr) 90px; } .mx .mb { grid-column: 1 / -1; grid-row: 2; } .mx.hd > span:nth-child(2) { display: none; } }
</style>
