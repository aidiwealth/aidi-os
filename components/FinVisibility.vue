<script setup lang="ts">
// The founder decides what investors see about the figures: a financial summary on the data room, investor page and
// updates, and which linked sheets are shown as the source.
interface V { summary: boolean; links: { id: string; name: string; url: string; show_source: boolean }[]; preview: unknown; company: boolean; has_securities?: boolean; securities?: boolean | null }
const { data, refresh } = await useLazyFetch<V>('/api/financials/visibility', { server: false })
const busy = ref(false)
async function set(body: Record<string, unknown>) { busy.value = true; try { await $fetch('/api/financials/visibility', { method: 'POST', body }); await refresh() } finally { busy.value = false } }
</script>
<template>
  <div v-if="data?.company" class="card fv">
    <div><h3>What investors see</h3><p class="hint">Hidden from investors until you turn it on.</p></div>
    <label class="row"><input type="checkbox" :checked="data.summary" :disabled="busy" @change="set({ summary: ($event.target as HTMLInputElement).checked })"><span><b>A short financial summary</b><em>Revenue (last 12 months and quarter), growth, gross margin, net income, cash and runway.</em></span></label>
    <div v-if="data.has_securities" class="srcs"><span class="lbl">Treasury bills and other securities, for investors</span>
      <label class="row"><input type="radio" name="fvsec" :checked="data.securities === true" :disabled="busy" @change="set({ investor_cash_with_securities: true })"><span><b>With cash, as "Cash and marketable securities"</b></span></label>
      <label class="row"><input type="radio" name="fvsec" :checked="data.securities === false" :disabled="busy" @change="set({ investor_cash_with_securities: false })"><span><b>Cash is the bank balance only</b></span></label>
      <p v-if="data.securities === null" class="hint ask">Used on your investor page, updates and data room.</p></div>
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
