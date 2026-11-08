<script setup lang="ts">
// Place a chart in text. Simple: one figure (revenue, ARR, transaction volume, customers…) by month, quarter or year,
// with growth. Customer analysis: concentration, bridge, cohorts and the like. Also changes a placed chart.
const props = defineProps<{ open: boolean; chartId?: string | null }>()
const emit = defineEmits<{ close: []; done: [r: { url: string; alt: string }] }>()
interface Opt { subjects: { value: string; label: string }[]; metrics: { key: string; label: string; unit: string; group: string }[]; customers: boolean }
const opts = ref<Opt | null>(null)
type Kind = 'concentration' | 'metric' | 'sectors' | 'bridge' | 'cohorts' | 'logos' | 'mix' | 'top_trend' | 'arr' | 'traction' | 'distribution'
const tab = ref<'simple' | 'analysis'>('simple')
const f = reactive({ kind: 'metric' as Kind, quarters: 8, by: 'size' as 'size' | 'segment', top: 2, names: false, subject: '', metrics: ['revenue'] as string[], period: 'year' as 'month' | 'quarter' | 'year', count: 5, style: 'bar' as 'bar' | 'line', title: '', freeze: false })
const svg = ref(''), busy = ref(false), msg = ref('')
const KINDS: [Kind, string, string][] = [['arr', 'ARR growth', 'Annual recurring revenue at each quarter end, with growth'], ['traction', 'Customer traction', 'Paying customers each quarter, with growth'], ['distribution', 'Customer distribution', 'Customers by what they pay a year: share of customers against share of revenue'], ['concentration', 'Customer concentration', 'Largest customers against everyone else, year on year'], ['bridge', 'Revenue bridge', 'Last year to this year: new customers, growth, shrinkage, lost'],
  ['cohorts', 'Revenue by customer start year', 'Each quarter split by the year customers first paid'], ['logos', 'Customers won and lost', 'New and lost paying customers by quarter'],
  ['mix', 'Revenue by customer group', 'By size (Enterprise, Mid-market, SMB) or segment, by quarter'], ['top_trend', 'Reliance on the largest customers', 'Share of revenue from the top 1, 5 and 10 over time'],
  ['sectors', 'Revenue by sector', 'Share of revenue by customer sector, no names']]
// The figures people chart most first (revenue, ARR, the company's own volumes and counts), then everything else.
const TOP = ['revenue', 'cust:arr', 'cust:active', 'gross_margin', 'gross_profit', 'net_income', 'cash', 'burn', 'runway', 'cust:nrr']
const groups = computed(() => {
  const ms = opts.value?.metrics ?? [], used = new Set<string>()
  const most = [...TOP.map((k) => ms.find((m) => m.key === k)).filter((m): m is Opt['metrics'][number] => !!m), ...ms.filter((m) => m.group === 'Your KPIs')]
  most.forEach((m) => used.add(m.key))
  const g = new Map<string, Opt['metrics']>([['Most used', most]]); for (const m of ms) { if (used.has(m.key) || m.key.includes('@')) continue; const a = g.get(m.group) ?? []; a.push(m); g.set(m.group, a) }
  return [...g.entries()].filter(([, a]) => a.length)
})
function per(p: 'month' | 'quarter' | 'year') { f.period = p; f.count = p === 'year' ? 5 : p === 'quarter' ? 8 : 12 }
watch(tab, (t) => { if (t === 'simple') f.kind = 'metric'; else if (f.kind === 'metric') f.kind = 'arr' })
const spec = computed(() => {
  const subject = f.subject || undefined, title = f.title.trim() || undefined
  return f.kind === 'concentration' ? { kind: f.kind, top: f.top, names: f.names, subject, title } : f.kind === 'sectors' || f.kind === 'bridge' || f.kind === 'distribution' ? { kind: f.kind, subject, title } : f.kind === 'mix' ? { kind: f.kind, by: f.by, quarters: f.quarters, subject, title } : ['cohorts', 'logos', 'top_trend', 'arr', 'traction'].includes(f.kind) ? { kind: f.kind, quarters: f.quarters, subject, title } : { kind: f.kind, metrics: f.metrics.filter(Boolean), period: f.period, count: f.count, style: f.style, subject, title }
})
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
let timer: ReturnType<typeof setTimeout> | undefined
async function preview() { msg.value = ''; try { svg.value = (await $fetch<{ svg: string }>('/api/charts/preview', { method: 'POST', body: { spec: spec.value } })).svg } catch (e) { svg.value = ''; msg.value = err(e) } }
watch(spec, () => { clearTimeout(timer); timer = setTimeout(preview, 350) }, { deep: true })
watch(() => props.open, async (o) => {
  if (!o) return
  svg.value = ''; msg.value = ''
  if (!opts.value) try { opts.value = await $fetch<Opt>('/api/charts/options') } catch { opts.value = { subjects: [], metrics: [], customers: false } }
  if (props.chartId) {
    try { const r = await $fetch<{ spec: Record<string, unknown> | null; frozen_at: string | null }>('/api/charts/' + props.chartId); if (r.spec) { Object.assign(f, { title: '', subject: '', ...r.spec, freeze: !!r.frozen_at }); tab.value = f.kind === 'metric' ? 'simple' : 'analysis' } } catch (e) { msg.value = err(e) }
  }
  preview()
}, { immediate: true })
async function save() {
  busy.value = true; msg.value = ''
  try {
    const r = props.chartId ? await $fetch<{ url: string }>('/api/charts/' + props.chartId, { method: 'POST', body: { spec: spec.value, freeze: f.freeze } }) : await $fetch<{ url: string }>('/api/charts', { method: 'POST', body: { spec: spec.value, freeze: f.freeze } })
    emit('done', { url: r.url, alt: 'Chart: ' + (f.title.trim() || (f.kind === 'metric' ? opts.value?.metrics.find((m) => m.key === f.metrics[0])?.label ?? 'chart' : KINDS.find((k) => k[0] === f.kind)?.[1] ?? 'chart')) })
  } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
function setMetric(i: number, v: string) { const a = [...f.metrics]; if (v) a[i] = v; else a.splice(i, 1); f.metrics = a.filter(Boolean).slice(0, 2) }
</script>
<template>
  <AppModal :open="open" :title="chartId ? 'Change chart' : 'Insert a chart'" xl @close="emit('close')">
    <div class="cp">
      <div class="side">
        <div class="tabs"><button type="button" :class="{ on: tab === 'simple' }" @click="tab = 'simple'">Simple</button><button type="button" :class="{ on: tab === 'analysis' }" :disabled="!!opts && !opts.customers" @click="tab = 'analysis'">Customer analysis</button></div>
        <template v-if="tab === 'analysis'">
          <div class="kinds"><button v-for="k in KINDS" :key="k[0]" type="button" :class="{ on: f.kind === k[0] }" @click="f.kind = k[0]"><b>{{ k[1] }}</b><span>{{ k[2] }}</span></button></div>
        </template>
        <p v-if="opts && !opts.customers" class="mut sm">Customer analysis needs customer revenue on the Customers page.</p>
        <label v-if="opts?.subjects.length">Company<select v-model="f.subject"><option value="">Main company</option><option v-for="s in opts.subjects" :key="s.value" :value="s.value">{{ s.label }}</option></select></label>
        <template v-if="f.kind === 'concentration'">
          <label>Largest customers shown<select v-model.number="f.top"><option v-for="n in 5" :key="n" :value="n">{{ n === 1 ? 'Top customer' : 'Top ' + n }}</option></select></label>
          <label class="ck"><input v-model="f.names" type="checkbox"> Show customer names <span class="mut sm">(otherwise Customer A, B…)</span></label>
        </template>
        <label v-if="f.kind === 'mix'">Group customers by<select v-model="f.by"><option value="size">Size (annual run-rate)</option><option value="segment">Segment</option></select></label>
        <label v-if="['cohorts', 'logos', 'mix', 'top_trend', 'arr', 'traction'].includes(f.kind)">Quarters shown<select v-model.number="f.quarters"><option v-for="n in [4, 6, 8, 12]" :key="n" :value="n">{{ n }}</option></select></label>
        <template v-if="tab === 'simple'">
          <label>Show<select :value="f.metrics[0]" @change="setMetric(0, ($event.target as HTMLSelectElement).value)"><optgroup v-for="[g, ms] in groups" :key="g" :label="g"><option v-for="x in ms" :key="x.key" :value="x.key">{{ x.label }}</option></optgroup></select></label>
          <div class="seg"><span>By</span><button v-for="p in (['month', 'quarter', 'year'] as const)" :key="p" type="button" :class="{ on: f.period === p }" @click="per(p)">{{ p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year' }}</button></div>
          <label>How many<select v-model.number="f.count"><option v-for="n in (f.period === 'year' ? [3, 4, 5, 6, 8, 10] : [4, 6, 8, 12, 18, 24, 36])" :key="n" :value="n">{{ n }} {{ f.period === 'year' ? 'years' : f.period === 'quarter' ? 'quarters' : 'months' }}</option></select></label>
          <details class="more"><summary>More options</summary>
            <label>Compare with (optional)<select :value="f.metrics[1] ?? ''" @change="setMetric(1, ($event.target as HTMLSelectElement).value)"><option value="">—</option><optgroup v-for="[g, ms] in groups" :key="g" :label="g"><option v-for="x in ms" :key="x.key" :value="x.key">{{ x.label }}</option></optgroup></select></label>
            <label>Style<select v-model="f.style"><option value="bar">Bars</option><option value="line">Line</option></select></label>
          </details>
        </template>
        <label>Title <span class="mut sm">(optional; worked out for you)</span><input v-model="f.title" maxlength="140" placeholder="e.g. ARR passed $5M in 2026"></label>
        <label class="ck"><input v-model="f.freeze" type="checkbox"> Freeze at today's figures <span class="mut sm">(otherwise it updates as your figures change)</span></label>
      </div>
      <div class="pv"><div v-if="svg" class="svg" v-html="svg" /><div v-else class="ph mut">{{ msg || 'Preparing the preview…' }}</div></div>
    </div>
    <template #foot><span v-if="msg && svg" class="er">{{ msg }}</span><span class="sp" /><button class="btn secondary" type="button" @click="emit('close')">Cancel</button><button class="btn" type="button" :disabled="busy || !svg" @click="save">{{ busy ? 'Saving…' : chartId ? 'Save chart' : 'Insert chart' }}</button></template>
  </AppModal>
</template>
<style scoped>
.cp { display: grid; grid-template-columns: 300px 1fr; gap: 20px; } @media (max-width: 820px) { .cp { grid-template-columns: 1fr; } }
.side { display: flex; flex-direction: column; gap: 12px; } .side label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-ink-soft); } .side select, .side input:not([type]) { font: inherit; font-size: 14px; padding: 7px 8px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.side label.ck { flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; } .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.kinds { display: flex; flex-direction: column; gap: 6px; max-height: 330px; overflow-y: auto; } .kinds button { text-align: left; border: 1px solid var(--c-rule); background: #fff; padding: 9px 11px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 2px; } .kinds button b { font-size: 14px; color: var(--c-ink); font-weight: 600; } .kinds button span { font-size: 12.5px; color: var(--c-muted); }
.tabs { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--c-rule-strong); } .tabs button { font: inherit; font-size: 13.5px; padding: 8px; border: 0; background: #fff; cursor: pointer; color: var(--c-ink-soft); } .tabs button.on { background: var(--c-navy); color: #fff; } .tabs button:disabled { opacity: .5; cursor: default; }
.seg { display: flex; align-items: center; gap: 0; font-size: 13px; color: var(--c-ink-soft); } .seg span { margin-right: 10px; } .seg button { font: inherit; font-size: 13.5px; padding: 6px 14px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; margin-left: -1px; } .seg button.on { background: var(--c-paper-2); border-color: var(--c-navy); position: relative; }
.more summary { cursor: pointer; font-size: 13px; color: var(--c-blue-deep); } .more[open] { display: flex; flex-direction: column; gap: 10px; }
.kinds button.on { border-color: var(--c-navy); background: var(--c-paper-2); } .kinds button:disabled { opacity: .5; cursor: default; }
.pv { border: 1px solid var(--c-rule); background: #fff; min-height: 320px; display: flex; align-items: center; justify-content: center; padding: 10px; } .svg { width: 100%; } .svg :deep(svg) { width: 100%; height: auto; display: block; } .ph { font-size: 14px; }
.sp { flex: 1; } .er { color: var(--c-danger); font-size: 13px; } .sm { font-size: 12px; } .mut { color: var(--c-muted); }
</style>
