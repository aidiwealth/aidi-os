<script setup lang="ts">
// Assumptions for Public Markets: the market risk premium (entered monthly with its source) and the other inputs
// every valuation uses. A new value applies from its date; nothing is overwritten, so each valuation can be traced to
// what was in force. Admins and GPs set them; every change goes to the audit log.
import { fixed, day, ptTime } from '~/shared/market-format'
useHead({ title: 'Public markets · Assumptions' })
interface A { value: number | null; effective_date: string | null; source_url: string | null; set: boolean; set_by: 'person' | 'ai' | null }
interface M { label: string; unit: string; default: number | null; min: number; max: number; help: string }
const { data, refresh } = await useFetch<{ ai_on: boolean; current: Record<string, A>; meta: Record<string, M>; history: { key: string; value: number; effective_date: string; source_url: string | null; note: string | null; created_at: string; by: string | null }[]; rates: { DGS10: { value: number; d: string } | null; DTB3: { value: number; d: string } | null } }>('/api/markets/assumptions')
const today = new Date().toISOString().slice(0, 10)
const f = reactive({ open: false, key: '', value: '' as string | number, effective_date: today, source_url: '', note: '', busy: false, msg: '' })
function edit(k: string) { const c = data.value?.current[k]; Object.assign(f, { open: true, key: k, value: c?.value ?? '', effective_date: today, source_url: k === 'mrp_us' ? '' : '', note: '', busy: false, msg: '' }) }
async function save() {
  f.busy = true; f.msg = ''
  try { await $fetch('/api/markets/assumptions', { method: 'POST', body: { key: f.key, value: Number(f.value), effective_date: f.effective_date, source_url: f.source_url || null, note: f.note || null } }); f.open = false; await refresh() }
  catch (e) { f.msg = (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not save.' } finally { f.busy = false }
}
const show = (k: string, v: number | null) => (v == null ? 'Not set' : fixed(v, data.value?.meta[k]?.unit === 'years' ? 0 : 2) + (data.value?.meta[k]?.unit === '%' ? '%' : ' ' + (data.value?.meta[k]?.unit ?? '')))
</script>
<template>
  <section class="as">
    <MarketsNav />
    <div><h1>Assumptions</h1><p class="lead">The inputs every valuation uses. The AI sets the market risk premium each month from its published source; the rest keep their defaults unless you change them. Setting one yourself overrides the AI until its next monthly update. Earlier values are kept, and every change is recorded with who made it.</p></div>
    <div v-if="data" class="card">
      <table class="table" data-nosearch><thead><tr><th>Assumption</th><th class="n">In force</th><th>Since</th><th>Source</th><th /></tr></thead>
        <tbody><tr v-for="(m, k) in data.meta" :key="k">
          <td><b>{{ m.label }}</b><InfoTip :text="m.help" /><em v-if="k === 'mrp_us' && !data.current[k]?.set" class="need">{{ data.ai_on ? 'The AI is looking it up now; reload in a minute' : 'Needed for any stock value' }}</em></td>
          <td class="n">{{ show(k as string, data.current[k]?.value ?? null) }}<em v-if="!data.current[k]?.set && data.current[k]?.value != null">default</em><em v-else-if="data.current[k]?.set_by === 'ai'">set by AI</em></td>
          <td>{{ data.current[k]?.effective_date ? day(data.current[k]!.effective_date) : '—' }}</td>
          <td class="src"><a v-if="data.current[k]?.source_url" :href="data.current[k]!.source_url!" target="_blank" rel="noopener">{{ data.current[k]!.source_url!.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40) }} ↗</a><span v-else>—</span></td>
          <td class="n"><button class="btn secondary sm" @click="edit(k as string)">Set</button></td></tr></tbody></table>
    </div>
    <div v-if="data" class="card rates"><p class="k">Rates from FRED (updated daily)</p>
      <p>10-year Treasury (DGS10) <b>{{ data.rates.DGS10 ? fixed(data.rates.DGS10.value, 2) + '%' : '—' }}</b> <span class="mut">{{ data.rates.DGS10 ? day(data.rates.DGS10.d) : 'not loaded yet' }}</span> · used to discount cash flow</p>
      <p>3-month T-bill (DTB3) <b>{{ data.rates.DTB3 ? fixed(data.rates.DTB3.value, 2) + '%' : '—' }}</b> <span class="mut">{{ data.rates.DTB3 ? day(data.rates.DTB3.d) : 'not loaded yet' }}</span> · used in the beta regression</p>
      <p class="mut sm">Where to find the market risk premium: <a href="https://www.market-risk-premia.com/" target="_blank" rel="noopener">market-risk-premia.com (US implied)</a>, cross-check with <a href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histimpl.html" target="_blank" rel="noopener">Damodaran's implied premium</a>.</p></div>
    <div v-if="data?.history.length" class="card"><p class="k">Changes</p>
      <table class="table" data-nosearch><thead><tr><th>When</th><th>Assumption</th><th class="n">Value</th><th>From</th><th>By</th><th>Note</th></tr></thead>
        <tbody><tr v-for="h in data.history" :key="h.created_at + h.key"><td>{{ ptTime(h.created_at) }}</td><td>{{ data.meta[h.key]?.label ?? h.key }}</td><td class="n">{{ show(h.key, h.value) }}</td><td>{{ day(h.effective_date) }}</td><td>{{ h.by ?? '—' }}</td><td class="mut">{{ h.note ?? '' }}</td></tr></tbody></table></div>
    <AppModal :open="f.open" :title="data?.meta[f.key]?.label ?? 'Set'" @close="f.open = false">
      <form id="asf" class="af" @submit.prevent="save">
        <p class="mut sm">{{ data?.meta[f.key]?.help }}</p>
        <div class="g2"><label class="label">Value{{ data?.meta[f.key]?.unit === '%' ? ' (%)' : data?.meta[f.key]?.unit === 'years' ? ' (years)' : '' }}<input v-model="f.value" type="number" step="0.01" :min="data?.meta[f.key]?.min" :max="data?.meta[f.key]?.max" required></label>
          <label class="label">Applies from<input v-model="f.effective_date" type="date" required></label></div>
        <label class="label">Source {{ f.key === 'mrp_us' ? '(required)' : '(optional)' }}<input v-model="f.source_url" type="url" placeholder="https://…" :required="f.key === 'mrp_us'"></label>
        <label class="label">Note (optional)<input v-model="f.note" maxlength="500"></label>
        <p v-if="f.msg" class="error">{{ f.msg }}</p>
      </form>
      <template #foot><button type="button" class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" type="submit" form="asf" :disabled="f.busy">{{ f.busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.as { display: flex; flex-direction: column; gap: 16px; } .back { font-size: 13px; color: var(--c-blue-deep); text-decoration: none; } h1 { margin: 0 0 4px; } .lead { margin: 0; color: var(--c-muted); font-size: 14px; max-width: 720px; }
.card { padding: 16px 18px; overflow-x: auto; } .k { margin: 0 0 8px; font-size: 13px; color: var(--c-ink-soft); font-weight: 500; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { text-align: left; padding: 9px 10px; border-top: 1px solid var(--c-line-soft); } .n { text-align: right; white-space: nowrap; }
td em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } td em.need { color: var(--c-warn); } .src a { color: var(--c-blue-deep); }
.rates p { margin: 0 0 6px; font-size: 14px; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .btn.sm { height: 30px; font-size: 12.5px; }
.af { display: flex; flex-direction: column; gap: 12px; } .af .label { display: flex; flex-direction: column; gap: 4px; } .af input { font: inherit; font-size: 14px; height: 34px; border: 1px solid var(--c-rule-strong); padding: 0 8px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .error { color: var(--c-danger); margin: 0; }
</style>
