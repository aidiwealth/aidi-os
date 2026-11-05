<script setup lang="ts">
// The founder decides what investors see about the figures: a financial summary on the data room, investor page and
// updates, and which linked sheets are shown as the source.
interface V { summary: boolean; links: { id: string; name: string; url: string; show_source: boolean }[]; preview: unknown; company: boolean; has_securities?: boolean; securities?: boolean | null; has_safe?: boolean; safe?: 'equity' | 'liability' | null; safe_rest?: string | null; rest_options?: { entity_id: string; name: string; period_end: string; currency: string; amount: number }[] }
const { data, refresh } = await useLazyFetch<V>('/api/financials/visibility', { server: false })
const busy = ref(false)
async function set(body: Record<string, unknown>) { busy.value = true; try { await $fetch('/api/financials/visibility', { method: 'POST', body }); await refresh() } finally { busy.value = false } }
const amt = (v: number, c: string) => (c === 'USD' ? '$' : c + ' ') + Math.round(v).toLocaleString('en-US')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mon = (d: string) => MON[Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4)
</script>
<template>
  <div v-if="data?.company" class="card fv">
    <div><h3>What investors see</h3><p class="hint">Hidden from investors until you turn it on.</p></div>
    <label class="row"><input type="checkbox" :checked="data.summary" :disabled="busy" @change="set({ summary: ($event.target as HTMLInputElement).checked })"><span><b>A short financial summary</b><em>Revenue (last 12 months and quarter), growth, gross margin, net income, cash and runway.</em></span></label>
    <div v-if="data.has_securities" class="srcs"><span class="lbl">Treasury bills and other securities, for investors</span>
      <label class="row"><input type="radio" name="fvsec" :checked="data.securities === true" :disabled="busy" @change="set({ investor_cash_with_securities: true })"><span><b>With cash, as "Cash and marketable securities"</b></span></label>
      <label class="row"><input type="radio" name="fvsec" :checked="data.securities === false" :disabled="busy" @change="set({ investor_cash_with_securities: false })"><span><b>Cash is the bank balance only</b></span></label>
      <p v-if="data.securities === null" class="hint ask">Used on your investor page, updates and data room.</p></div>
    <div class="srcs"><span class="lbl">SAFE and convertible notes on the balance sheet (reports and statements)</span>
      <label class="row"><input type="radio" name="fvsafe" :checked="data.safe === 'equity'" :disabled="busy" @change="set({ safe_treatment: 'equity' })"><span><b>In equity</b><em>As in QuickBooks ("VC funding"): they convert into shares and are not repaid in cash.</em></span></label>
      <label class="row"><input type="radio" name="fvsafe" :checked="data.safe === 'liability'" :disabled="busy" @change="set({ safe_treatment: 'liability' })"><span><b>As a non-current liability</b><em>As on a US tax return and often under US GAAP (ASC 480).</em></span></label>
      <template v-if="!data.has_safe">
        <template v-if="data.rest_options?.length">
          <p class="hint">Your figures have no category named SAFE. If your SAFEs are the part of Other liabilities that no category explains, tick it:</p>
          <label v-for="x in data.rest_options" :key="x.entity_id" class="row"><input type="checkbox" :checked="data.safe_rest === x.entity_id" :disabled="busy" @change="set({ safe_rest: ($event.target as HTMLInputElement).checked ? x.entity_id : null })"><span><b>{{ x.name }}: {{ amt(x.amount, x.currency) }} in Other liabilities is our SAFE and convertible notes</b><em>Not in any category at {{ mon(x.period_end) }}. Shown as "SAFE and convertible notes", every month; your figures are not changed.</em></span></label>
        </template>
        <p v-else class="hint ask">Your figures have no category named SAFE, convertible notes or VC funding yet, so there is nothing to move. Add one under the line it sits in (for example "SAFE notes" under Other liabilities): in Statements, Edit the month, then Your categories, or name the row that way in your linked sheet and sync.</p>
      </template>
      <p v-else-if="!data.safe" class="hint ask">Until you choose, they show where your figures put them.</p></div>
    <div v-if="data.links.length" class="srcs"><span class="lbl">Show where the figures come from</span>
      <label v-for="l in data.links" :key="l.id" class="row"><input type="checkbox" :checked="l.show_source" :disabled="busy" @change="set({ link_id: l.id, show_source: ($event.target as HTMLInputElement).checked })"><span><b>{{ l.name }}</b><em>Anyone with the link can open the sheet, so share it view-only.</em></span></label></div>
    <p v-else class="hint">Link your sheet (above) to show investors where the figures come from.</p>
    <details v-if="data.preview" class="pv"><summary>Preview</summary><FinSummary :fin="data.preview as any" /></details>
  </div>
</template>
<style scoped>
.fv { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; } .fv h3 { margin: 0; } .hint { color: var(--c-muted); font-size: 12.5px; margin: 2px 0 0; }
.row { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; } .row input { margin-top: 3px; } .row b { display: block; font-weight: 600; } .row em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.srcs { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--c-rule); } .lbl { font-size: 12px; color: var(--c-muted); }
.pv summary { cursor: pointer; font-size: 13px; color: var(--c-blue-deep); } .pv :deep(.fs) { margin-top: 10px; }
.ask { color: #8a5a0a; }
</style>
