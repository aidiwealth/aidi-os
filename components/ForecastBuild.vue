<script setup lang="ts">
// Build a forecast from the company's own numbers: revenue, cost structure and growth from the statements in
// Financials, and cash from the connected bank accounts today, optionally with spending matched to what actually
// left the bank over the last three months.
import { run, type Assumptions, type FinSource as Fin, type BankSource as Bank } from '~/shared/forecast'
const props = defineProps<{ open: boolean; seed: Assumptions; fin: Fin | null; bank: Bank | null; currency: string }>()
const emit = defineEmits<{ close: []; done: [v: { name: string; assumptions: Assumptions }]; refresh: [] }>()
const o = reactive({ bankCash: true, match: false, growth: 0, months: 24, name: '' })
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
watch(() => props.open, (v) => { if (v) Object.assign(o, { bankCash: !!props.bank?.connected && !props.bank?.partial, match: !props.fin && !!props.bank?.full_months, growth: props.seed.revenue.growth_pct, months: 24, name: 'From ' + (props.fin ? 'Financials' : '') + (props.fin && props.bank?.connected ? ' + ' : '') + (props.bank?.connected ? 'bank' : '') + ' · ' + mon(new Date().toISOString().slice(0, 7)) }) })
const m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : briefMoney(v, props.currency))
const out1 = (a: Assumptions) => { const x = run({ ...a, months: 1 }).months[0]; return x ? x.cogs + x.opex : 0 }
const built = computed<Assumptions>(() => {
  const a = structuredClone(toRaw(props.seed)) as Assumptions
  a.months = o.months; a.revenue.growth_pct = Number(o.growth) || 0
  a.opening.cash = o.bankCash && props.bank?.connected ? props.bank.cash : props.fin?.cash ?? a.opening.cash
  if (o.match && props.bank?.full_months) {
    const now = out1(a), target = props.bank.avg_out
    if (now > 0 && target < now) { const k = target / now; a.opening.payroll *= k; a.costs = a.costs.map((c) => ({ ...c, amount: Math.round(c.amount * k) })); a.cogs_pct = Math.round(a.cogs_pct * k * 10) / 10 }
    else if (target > now) { const oc = a.costs.find((c) => c.key === 'other'); if (oc) oc.amount = Math.round(oc.amount + target - now) }
  }
  return a
})
const res = computed(() => run(built.value))
const fOut = computed(() => out1(built.value))
const bankLink = computed(() => props.bank?.enabled && !props.bank.connected)
</script>
<template>
  <AppModal :open="open" title="Build a forecast from your numbers" wide @close="emit('close')">
    <div class="fb">
      <p class="lead">Finvry starts from what has actually happened: revenue, costs and growth from the statements in Financials, and cash from your bank accounts today. Change anything after it is made.</p>
      <div class="two">
        <div class="src"><p class="h">From Financials</p>
          <template v-if="fin"><div class="kv"><span>Statements</span><b>{{ fin.months }} month{{ fin.months === 1 ? '' : 's' }}, to {{ mon(fin.latest) }}</b></div><div class="kv"><span>Revenue a month (last 3)</span><b>{{ m(fin.revenue) }}</b></div><div class="kv"><span>Costs a month (last 3)</span><b>{{ m(fin.costs) }}</b></div><div class="kv"><span>Revenue growth (last 6)</span><b>{{ fin.growth === null ? '—' : fin.growth + '% a month' }}</b></div><div class="kv"><span>Cash in the last statement</span><b>{{ m(fin.cash) }}</b></div></template>
          <p v-else class="mut">No monthly statements yet. <NuxtLink to="/financials">Add them in Financials</NuxtLink> (QuickBooks, Google Sheets or a file) for revenue and cost structure.</p></div>
        <div class="src"><p class="h">From your bank</p>
          <template v-if="bank?.connected"><div class="kv"><span>Cash now</span><b>{{ m(bank.cash) }}</b></div><div class="kv"><span>Accounts</span><b>{{ bank.accounts.filter((a) => !a.debt).length }} · {{ [...new Set(bank.accounts.map((a) => a.institution))].join(', ') }}</b></div>
            <template v-if="bank.full_months"><div class="kv"><span>Money in a month (last {{ bank.full_months }})</span><b>{{ m(bank.avg_in) }}</b></div><div class="kv"><span>Money out a month</span><b>{{ m(bank.avg_out) }}</b></div><div class="kv"><span>Net burn a month</span><b :class="{ red: bank.burn > 0 }">{{ bank.burn > 0 ? m(bank.burn) : 'None' }}</b></div></template>
            <p v-else class="mut">Money in and out will show once a full month of activity is available.</p>
            <div v-if="bank.spend.length" class="sp"><span v-for="s in bank.spend" :key="s.label">{{ s.label }} <b>{{ m(s.amount) }}</b></span></div></template>
          <template v-else><p class="mut">Connect your business bank for today's cash and what actually goes in and out each month. Read-only; we never move money.</p><BankFeeds v-if="bankLink" compact @changed="emit('refresh')" /></template></div>
      </div>
      <div class="opts">
        <label class="chk"><input v-model="o.bankCash" type="checkbox" :disabled="!bank?.connected"> Start from today's bank balance <em>{{ bank?.connected ? m(bank.cash) + (bank.partial ? ': connected US accounts only' + (bank.reported ? ', against ' + m(bank.reported) + ' cash in Financials' : '') + ', so the forecast starts from Financials unless you tick this' : '') : 'connect a bank first' }}</em></label>
        <label class="chk"><input v-model="o.match" type="checkbox" :disabled="!bank?.full_months"> Match monthly spending to the bank <em>{{ bank?.full_months ? 'money out averages ' + m(bank.avg_out) + '; the statements give ' + m(fin ? fin.costs : null) : 'needs a full month of bank activity' }}</em></label>
        <div class="g3"><label class="label">Revenue growth (% a month)<input v-model.number="o.growth" type="number" step="0.5"></label><label class="label">Length<select v-model.number="o.months"><option v-for="n in [12, 18, 24, 36]" :key="n" :value="n">{{ n }} months</option></select></label><label class="label">Name<input v-model="o.name" maxlength="120"></label></div>
      </div>
      <div class="pv"><div><span>Starts</span><b>{{ mon(built.start) }}</b></div><div><span>Opening cash</span><b>{{ m(built.opening.cash) }}</b></div><div><span>Spending, first month</span><b>{{ m(fOut) }}</b></div><div><span>{{ res.summary.zero_cash ? 'Cash runs out' : 'Cash at the end' }}</span><b :class="{ red: !!res.summary.zero_cash }">{{ res.summary.zero_cash ? mon(res.summary.zero_cash) : m(res.summary.cash_end) }}</b></div></div>
    </div>
    <template #foot><span class="spc" /><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="!fin && !bank?.connected" @click="emit('done', { name: o.name.trim() || 'Forecast', assumptions: built })">Create forecast</button></template>
  </AppModal>
</template>
<style scoped>
.fb { display: flex; flex-direction: column; gap: 14px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; line-height: 1.5; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .src { border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 6px; } .h { margin: 0 0 4px; font-weight: 600; font-size: 14px; }
.kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; padding: 3px 0; } .kv span { color: var(--c-muted); } .kv b { font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; } .red { color: var(--c-danger); }
.sp { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--c-rule); font-size: 12.5px; color: var(--c-muted); } .sp b { color: var(--c-ink); font-weight: 500; }
.opts { display: flex; flex-direction: column; gap: 8px; } .chk { display: flex; gap: 8px; align-items: baseline; font-size: 14px; } .chk em { font-style: normal; color: var(--c-muted); font-size: 12.5px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 12px; margin-top: 4px; } .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .label input, .label select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.pv { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--c-rule); } .pv div { padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; } .pv div + div { border-left: 1px solid var(--c-rule); } .pv span { font-size: 12px; color: var(--c-muted); } .pv b { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 760px) { .two, .g3, .pv { grid-template-columns: 1fr; } .pv div + div { border-left: 0; border-top: 1px solid var(--c-rule); } }
</style>
