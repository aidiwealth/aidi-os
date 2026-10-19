<script setup lang="ts">
// Upload a forecast: the Finvry forecast template (or any sheet with months across and line names down a column) is
// read by fixed rules with no AI; a PDF is read with AI. The founder checks the mapping and the totals (and the closing
// cash against the file's own cash line) before it becomes a forecast.
import { run, defaults, addMonths, COST_LINES, type Assumptions, type FixedMonth } from '~/shared/forecast'
const props = defineProps<{ open: boolean; seed: Assumptions }>()
const emit = defineEmits<{ close: []; done: [v: { name: string; assumptions: Assumptions }] }>()
type MapTo = 'revenue' | 'cogs' | 'payroll' | 'marketing' | 'rnd' | 'ga' | 'other' | 'tax' | 'items' | 'funding' | 'customers' | 'headcount' | 'cash_balance' | 'ignore'
interface Line { label: string; maps_to: MapTo; values: { month: string; value: number }[] }
interface Sheet { currency: string; start: string; opening_cash: number | null; lines: Line[]; notes: string[] }
const MAP: [MapTo, string][] = [['revenue', 'Revenue'], ['cogs', 'Cost of revenue'], ['payroll', 'Payroll'], ...COST_LINES.map((c) => [c.key as MapTo, c.label] as [MapTo, string]), ['tax', 'Tax'], ['items', 'One-off item (+ in / − out)'], ['funding', 'Funding raised'], ['customers', 'Customers'], ['headcount', 'Headcount'], ['cash_balance', 'Closing cash (check only)'], ['ignore', 'Leave out (subtotal / non-cash)']]
const how = ref<'rules' | 'ai'>('rules'), files = ref<File[]>([]), busy = ref(false), msg = ref(''), sheet = ref<Sheet | null>(null), fnames = ref<string[]>([]), name = ref('')
watch(() => props.open, (o) => { if (o) { files.value = []; sheet.value = null; msg.value = '' } })
function add(ev: Event) { for (const f of Array.from(((ev.target as HTMLInputElement).files ?? []) as ArrayLike<File>)) if (files.value.length < 3 && !files.value.some((x) => x.name === f.name)) files.value.push(f) }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function read() {
  busy.value = true; msg.value = ''
  const fd = new FormData(); for (const f of files.value) fd.append('files', f, f.name)
  try { const r = await $fetch<{ sheet: Sheet; files: string[]; how?: 'rules' | 'ai' }>('/api/forecast/read-sheet', { method: 'POST', body: fd }); sheet.value = r.sheet; how.value = r.how ?? 'rules'; fnames.value = r.files; name.value = r.files[0]!.replace(/\.[a-z0-9]+$/i, '').slice(0, 100) }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const COSTS = new Set(COST_LINES.map((c) => c.key))
const built = computed<Assumptions | null>(() => {
  const s = sheet.value; if (!s) return null
  const fixed: Record<string, FixedMonth> = {}
  for (const l of s.lines) {
    if (l.maps_to === 'ignore' || l.maps_to === 'cash_balance') continue
    for (const v of l.values) {
      if (v.month < s.start) continue
      const F = (fixed[v.month] ??= {})
      if (COSTS.has(l.maps_to)) { F.costs ??= {}; F.costs[l.maps_to] = (F.costs[l.maps_to] ?? 0) + v.value }
      else { const k = l.maps_to as Exclude<keyof FixedMonth, 'costs'>; F[k] = (F[k] ?? 0) + v.value }
    }
  }
  const ms = Object.keys(fixed).sort(); if (!ms.length) return null
  const first = fixed[ms[0]!]!, last = fixed[ms[ms.length - 1]!]!
  const span = (Number(ms[ms.length - 1]!.slice(0, 4)) - Number(s.start.slice(0, 4))) * 12 + Number(ms[ms.length - 1]!.slice(5)) - Number(s.start.slice(5)) + 1
  const revs = ms.map((m) => fixed[m]!.revenue).filter((x): x is number => x !== undefined && x > 0).slice(-7)
  const growth = revs.length > 1 ? Math.round((Math.pow(revs[revs.length - 1]! / revs[0]!, 1 / (revs.length - 1)) - 1) * 1000) / 10 : 3
  const a = defaults(s.start, { cash: s.opening_cash ?? props.seed.opening.cash, revenue: first.revenue ?? 0, payroll: first.payroll ?? 0, headcount: first.headcount ?? props.seed.opening.headcount, customers: first.customers ?? 0 }, Object.fromEntries(COST_LINES.map((c) => [c.key, first.costs?.[c.key] ?? 0])), s.currency)
  a.months = Math.min(60, Math.max(span, 24)); a.revenue.growth_pct = Math.max(-20, Math.min(50, growth))
  a.cogs_pct = last.revenue && last.cogs !== undefined ? Math.round(last.cogs / last.revenue * 1000) / 10 : props.seed.cogs_pct
  a.costs = a.costs.map((c) => ({ ...c, growth_pct: 1 })); a.payroll_raise_pct = 0
  a.fixed = fixed; a.source = { file: fnames.value.join(', ').slice(0, 200), imported_at: new Date().toISOString(), lines: s.lines.map((l) => ({ label: l.label.slice(0, 200), maps_to: l.maps_to })) }
  return a
})
const res = computed(() => (built.value ? run(built.value) : null))
const months = computed(() => Object.keys(built.value?.fixed ?? {}).sort())
const mon = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const money = (v: number) => briefMoney(v, sheet.value?.currency ?? 'USD')
const total = (l: Line) => l.values.filter((v) => v.month >= (sheet.value?.start ?? '')).reduce((s, v) => s + v.value, 0)
const sum = (k: MapTo) => (sheet.value?.lines ?? []).filter((l) => l.maps_to === k).reduce((s, l) => s + total(l), 0)
// Closing cash in the file against the cash this forecast works out, month by month.
const cashCheck = computed(() => {
  const l = sheet.value?.lines.find((x) => x.maps_to === 'cash_balance'); if (!l || !res.value) return null
  const pairs = l.values.map((v) => ({ m: v.month, theirs: v.value, ours: res.value!.months.find((x) => x.month === v.month)?.cash })).filter((p) => p.ours !== undefined) as { m: string; theirs: number; ours: number }[]
  if (!pairs.length) return null
  const worst = pairs.reduce((w, p) => (Math.abs(p.ours - p.theirs) > Math.abs(w.ours - w.theirs) ? p : w), pairs[0]!)
  const ok = Math.abs(worst.ours - worst.theirs) <= Math.max(100, Math.abs(worst.theirs) * 0.02)
  return { ok, worst, last: pairs[pairs.length - 1]! }
})
function done() { if (built.value) emit('done', { name: name.value.trim() || 'Accountant forecast', assumptions: built.value }) }
</script>
<template>
  <AppModal :open="open" :title="sheet ? 'Check the imported forecast' : 'Import a forecast'" wide @close="emit('close')">
    <div v-if="!sheet" class="fi">
      <div class="tpl"><div><b>Use the Finvry forecast template</b><span class="mut">Months across, the forecast's lines down the side, totals and closing cash worked out for you. Finvry reads it exactly, with no AI, so every figure lands where it should.</span></div><a class="btn secondary sm" href="/api/forecast/template">Download template</a></div>
      <p class="lead">Upload the filled template (or a sheet laid out the same way: months across one heading row, the line names down the first column). You check every line and the totals before it is saved. A PDF from your accountant can still be read, with AI; check it carefully.</p>
      <DropZone multiple accept=".xlsx,.xlsm,.csv,.pdf" :disabled="busy" hint="The template (Excel or CSV), or a PDF · up to 3 files" @change="add" />
      <ul v-if="files.length" class="fl"><li v-for="(f, i) in files" :key="f.name"><b>{{ f.name }}</b><button class="lk red" @click="files.splice(i, 1)">Remove</button></li></ul>
      <p v-if="busy" class="mut">Reading… larger models can take a minute.</p><p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <div v-else class="fi">
      <div class="nr"><label class="label">Name<input v-model="name" maxlength="120"></label><p class="mut">{{ fnames.join(', ') }} · {{ months.length }} months from {{ months[0] ? mon(months[0]) : '—' }} to {{ months.length ? mon(months[months.length - 1]!) : '—' }} · {{ sheet.currency }}</p></div>
      <div class="fx-stats"><StatTile label="Revenue" :value="money(sum('revenue'))" :note="'Over ' + months.length + ' months'" /><StatTile label="Costs" :value="money(sum('cogs') + sum('payroll') + sum('marketing') + sum('rnd') + sum('ga') + sum('other'))" note="Cost of revenue, payroll and operating" /><StatTile label="Funding" :value="money(sum('funding'))" /><StatTile label="Opening cash" :value="money(built?.opening.cash ?? 0)" :note="sheet.opening_cash === null ? 'Not in the file: from your figures' : 'From the file'" /></div>
      <div v-if="cashCheck" class="ck"><span class="dot" :class="cashCheck.ok ? 'ok' : 'red'" /><span v-if="cashCheck.ok">Closing cash matches the file (<b>{{ money(cashCheck.last.theirs) }}</b> in {{ mon(cashCheck.last.m) }}).</span><span v-else>Closing cash differs from the file: <b>{{ money(cashCheck.worst.ours) }}</b> here against <b>{{ money(cashCheck.worst.theirs) }}</b> in {{ mon(cashCheck.worst.m) }}. Check that no line is counted twice or left out, and the opening cash.</span></div>
      <div v-if="sheet.notes.length" class="nt"><p class="bh">Notes</p><ul><li v-for="(x, i) in sheet.notes" :key="i">{{ x }}</li></ul></div>
      <div class="tw"><table class="t" data-nosearch><thead><tr><th>Line in the file</th><th>Goes to</th><th class="r">Total</th><th class="r">Months</th></tr></thead>
        <tbody><tr v-for="(l, i) in sheet.lines" :key="i" :class="{ off: l.maps_to === 'ignore' }"><td>{{ l.label }}</td><td><select v-model="l.maps_to"><option v-for="[k, lab] in MAP" :key="k" :value="k">{{ lab }}</option></select></td><td class="r">{{ ['customers', 'headcount'].includes(l.maps_to) ? Math.round(l.values[l.values.length - 1]?.value ?? 0).toLocaleString('en-US') + ' at end' : money(total(l)) }}</td><td class="r">{{ l.values.length }}</td></tr></tbody></table></div>
      <p class="mut sm2">After {{ months.length ? mon(months[months.length - 1]!) : 'the file' }} the forecast continues with assumptions you can change ({{ built?.revenue.growth_pct }}% monthly revenue growth, from the file's trend).{{ how === 'ai' ? ' Read with AI from a PDF: check the totals against the original.' : ' Read from your cells by line name, with no AI.' }}</p>
    </div>
    <template #foot><span class="sp" /><template v-if="!sheet"><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="busy || !files.length" @click="read">{{ busy ? 'Reading…' : 'Read forecast' }}</button></template>
      <template v-else><button class="btn secondary" @click="sheet = null">Back</button><button class="btn" :disabled="!built" @click="done">Save as a new forecast</button></template></template>
  </AppModal>
</template>
<style scoped>
.tpl { display: flex; gap: 14px; align-items: center; justify-content: space-between; border: 1px solid #d9e2ef; background: #f5f7fb; padding: 12px 14px; } .tpl b { display: block; font-weight: 500; margin-bottom: 2px; } .tpl .btn { white-space: nowrap; text-decoration: none; }
.fi { display: flex; flex-direction: column; gap: 14px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; } .sm2 { font-size: 12px; }
.fi .fx-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } @media (max-width: 760px) { .fi .fx-stats { grid-template-columns: 1fr 1fr; } }
.fl { list-style: none; margin: 0; padding: 0; border: 1px solid var(--c-rule); } .fl li { display: flex; justify-content: space-between; padding: 9px 12px; font-size: 13.5px; border-bottom: 1px solid var(--c-rule); } .fl li:last-child { border: 0; } .fl b { font-weight: 500; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; cursor: pointer; } .lk.red { color: var(--c-danger); }
.nr { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; } .nr .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; min-width: 280px; } .nr input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); }
.ck { display: flex; gap: 10px; align-items: center; border: 1px solid var(--c-rule); padding: 10px 14px; font-size: 13.5px; } .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; } .dot.ok { background: var(--c-ink-soft); } .dot.red { background: var(--c-danger); }
.nt { border: 1px solid var(--c-rule); padding: 10px 14px; } .bh { margin: 0 0 4px; font-weight: 600; font-size: 13.5px; } .nt ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); }
.tw { max-height: 44vh; overflow: auto; border: 1px solid var(--c-rule); }
.t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; position: sticky; top: 0; } .t td { padding: 6px 10px; border-bottom: 1px solid var(--c-rule); } .t .r { text-align: right; font-variant-numeric: tabular-nums; }
.t select { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--c-rule-strong); background: #fff; } tr.off td { color: var(--c-muted); }
</style>
