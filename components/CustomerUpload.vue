<script setup lang="ts">
// Upload customer revenue: say what is needed, read the file, check it for duplicates (AI), then save.
const props = defineProps<{ open: boolean; existing: number; extra?: 'retention' | 'customers' }>()
const emit = defineEmits<{ close: []; done: [msg: string] }>()
interface Dup { names: string[]; to: string; reason: string; sure: boolean; existing: boolean }
interface Prev { id: string; summary: { sheet: string; layout: string; customers: number; rows: number; repeated: number; skipped: number; first: string; last: string; months: number; known: number; total: number; attrs: string[]; ai_mapped: boolean; notes: string[] }; dupes: Dup[]; existing: number }
const st = reactive({ busy: false, msg: '', prev: null as Prev | null, pick: [] as boolean[], keepRepeats: false, mode: 'merge' as 'merge' | 'replace' })
watch(() => props.open, (o) => { if (o) Object.assign(st, { busy: false, msg: '', prev: null, pick: [], keepRepeats: false, mode: 'merge' }) })
const ATTR: Record<string, string> = { segment: 'Segment', sector: 'Sector', country: 'Country', plan: 'Plan', started_on: 'Start date', acquisition_cost: 'Acquisition cost', gross_margin_pct: 'Gross margin' }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read the file.'
async function read(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  st.busy = true; st.msg = ''
  try { const fd = new FormData(); fd.append('file', f); st.prev = await $fetch<Prev>('/api/financials/customers/preview', { method: 'POST', body: fd }); st.pick = st.prev.dupes.map((d) => d.sure) }
  catch (e) { st.msg = err(e) } finally { st.busy = false }
}
async function save() {
  if (!st.prev) return
  st.busy = true; st.msg = ''
  try {
    const merges = st.prev.dupes.filter((_, i) => st.pick[i]).map((d) => ({ names: d.names, to: d.to }))
    const r = await $fetch<{ customers: number; months: number; merged: number }>('/api/financials/customers/import', { method: 'POST', body: { id: st.prev.id, merges, keep_repeats: st.keepRepeats, mode: st.mode } })
    emit('done', r.customers + ' customers saved (' + r.months.toLocaleString('en-US') + ' customer-months)' + (r.merged ? ', ' + r.merged + ' duplicate' + (r.merged === 1 ? '' : 's') + ' merged' : '') + '.')
  } catch (e) { st.msg = err(e) } finally { st.busy = false }
}
const mon = (m: string) => (m ? new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <AppModal :open="open" :title="st.prev ? 'Check your customer data' : 'Upload customer revenue'" wide @close="emit('close')">
    <div v-if="!st.prev" class="cu">
      <div class="need">
        <div><h4>What we need</h4>
          <table><tbody>
            <tr><td><b>Customer</b></td><td>The customer's name, written the same way every month</td></tr>
            <tr><td><b>Month</b></td><td>The month the revenue is for (2025-01, Jan 2025 or a date)</td></tr>
            <tr><td><b>Revenue</b></td><td>What the customer paid or was billed that month</td></tr>
            <tr class="opt"><td>Segment</td><td>Optional: Enterprise, SMB, or your own groups</td></tr>
            <tr class="opt"><td>Sector</td><td>Optional: Banking, Retail, Telecoms… {{ extra === 'customers' ? '(needed for the sector view)' : '' }}</td></tr>
            <tr class="opt"><td>Country, Plan, Start date</td><td>Optional</td></tr>
            <tr class="opt"><td>Acquisition cost</td><td>Optional: what it cost to win the customer, for LTV to CAC and payback</td></tr>
          </tbody></table></div>
        <div class="tips"><h4>Keep it simple</h4><ul><li>One table on one sheet, headings in the first row</li><li>One row per customer per month, or one row per customer with months across the top</li><li>No totals rows, merged cells or formulas that show errors</li><li>Give at least 13 months, so a year-on-year comparison is possible</li><li>One currency for all the figures</li></ul>
          <a href="/api/financials/customers/template" class="lk">Download a template (CSV)</a></div>
      </div>
      <DropZone accept=".xlsx,.csv" :disabled="st.busy" :label="st.busy ? 'Reading and checking for duplicates…' : 'Drag and drop the file here'" hint="Excel or CSV · or click to choose" no-tip @change="read" />
      <p v-if="st.msg" class="error">{{ st.msg }}</p>
    </div>
    <div v-else class="cu">
      <div class="sum"><div><b>{{ st.prev.summary.customers.toLocaleString('en-US') }}</b><span>customers</span></div><div><b>{{ st.prev.summary.months }}</b><span>months, {{ mon(st.prev.summary.first) }} – {{ mon(st.prev.summary.last) }}</span></div><div><b>{{ Math.round(st.prev.summary.total).toLocaleString('en-US') }}</b><span>total revenue</span></div><div><b>{{ st.prev.summary.known }}</b><span>already saved</span></div></div>
      <p class="mut">Read from "{{ st.prev.summary.sheet }}" ({{ st.prev.summary.layout === 'long' ? 'one row per customer per month' : 'months across the columns' }}{{ st.prev.summary.ai_mapped ? ', layout found by AI' : '' }}).{{ st.prev.summary.attrs.length ? ' Also found: ' + st.prev.summary.attrs.map((a) => ATTR[a]).join(', ') + '.' : '' }}</p>
      <ul v-if="st.prev.summary.notes.length" class="notes"><li v-for="(n, i) in st.prev.summary.notes" :key="i">{{ n }}</li></ul>
      <label v-if="st.prev.summary.repeated && st.prev.summary.layout === 'long'" class="ck"><input v-model="st.keepRepeats" type="checkbox"> Keep the {{ st.prev.summary.repeated }} repeated row{{ st.prev.summary.repeated === 1 ? '' : 's' }} (only if they are real, separate charges)</label>
      <div class="dup"><h4>{{ st.prev.dupes.length ? 'Possible duplicate customers (' + st.prev.dupes.length + ')' : 'No duplicate customers found' }}</h4>
        <p v-if="st.prev.dupes.length" class="mut">Merging puts their revenue under one name. Merge only the same paying customer; branches or subsidiaries you bill separately should stay apart.</p>
        <div v-if="st.prev.dupes.length" class="dl"><div v-for="(d, i) in st.prev.dupes" :key="i" class="di"><label class="ck"><input v-model="st.pick[i]" type="checkbox"> Merge</label>
          <div class="dn"><span class="nm">{{ d.names.join('  ·  ') }}</span><span class="why">{{ d.sure ? 'Same name' : 'Suggested by AI' }}: {{ d.reason }}{{ d.existing ? ' (includes a saved customer)' : '' }}</span></div>
          <label class="keep">Keep<select v-model="d.to"><option v-for="n in d.names" :key="n" :value="n">{{ n }}</option></select></label></div></div>
        <div v-if="st.prev.dupes.length > 1" class="all"><button type="button" class="lk" @click="st.pick = st.prev!.dupes.map(() => true)">Merge all</button><button type="button" class="lk" @click="st.pick = st.prev!.dupes.map(() => false)">Merge none</button></div></div>
      <div v-if="existing" class="mode"><label class="ck"><input v-model="st.mode" type="radio" value="merge"> Add to the {{ existing }} saved customers (months in this file replace the same months)</label><label class="ck"><input v-model="st.mode" type="radio" value="replace"> Replace all saved customer data with this file</label></div>
      <p v-if="st.msg" class="error">{{ st.msg }}</p>
    </div>
    <template #foot><button class="btn secondary" type="button" @click="st.prev ? (st.prev = null) : emit('close')">{{ st.prev ? 'Back' : 'Cancel' }}</button><button v-if="st.prev" class="btn" type="button" :disabled="st.busy" @click="save">{{ st.busy ? 'Saving…' : 'Save ' + st.prev.summary.customers + ' customers' }}</button></template>
  </AppModal>
</template>

<style scoped>
.cu { display: flex; flex-direction: column; gap: 14px; font-size: 13.5px; }
.need { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; } h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
table { width: 100%; border-collapse: collapse; } td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--c-rule); vertical-align: top; font-size: 13px; color: var(--c-ink-soft); } td:first-child { white-space: nowrap; color: var(--c-ink); width: 150px; } tr.opt td:first-child { color: var(--c-muted); }
.tips { background: #f5f7fb; padding: 12px 14px; } .tips ul { margin: 0 0 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-ink-soft); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--c-rule); border: 1px solid var(--c-rule); } .sum div { background: #fff; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .sum b { font-size: 20px; font-weight: 500; color: var(--c-navy); } .sum span { font-size: 12px; color: var(--c-muted); }
.mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .notes { margin: 0; padding-left: 18px; color: #8a5a0a; font-size: 13px; }
.ck { display: flex; gap: 8px; align-items: center; font-size: 13px; } .ck input { margin: 0; }
.dup { border: 1px solid var(--c-rule); padding: 12px 14px; background: #fff; } .dl { max-height: 300px; overflow: auto; display: flex; flex-direction: column; margin-top: 8px; }
.di { display: grid; grid-template-columns: 80px 1fr 220px; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--c-rule); } .dn { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .nm { font-weight: 500; overflow-wrap: anywhere; } .why { font-size: 12px; color: var(--c-muted); }
.keep { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--c-muted); } .keep select { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); background: #fff; }
.all { display: flex; gap: 14px; margin-top: 8px; } .mode { display: flex; flex-direction: column; gap: 6px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 760px) { .need, .di { grid-template-columns: 1fr; } .sum { grid-template-columns: 1fr 1fr; } }
</style>
