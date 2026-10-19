<script setup lang="ts">
// The group's exchange rates by month: the company's own book rates (typed in or uploaded from an Exchange rates or
// FX rates tab), and for months without one, the rate the group figures used and where it came from.
interface Use { per_usd: number; source: 'book' | 'book_near' | 'history' | 'daily'; from_month?: string }
interface D { to: string; quotes: string[]; rows: { month: string; rates: Record<string, { book: number | null; used: Use | null }> }[] }
const props = defineProps<{ open: boolean; canEdit: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const data = ref<D | null>(null); const msg = ref(''); const ok = ref(''); const busy = ref(false)
const edit = reactive<Record<string, string>>({})
async function load() { data.value = await $fetch<D>('/api/financials/fx-rates'); for (const r of data.value.rows) for (const q of data.value.quotes) edit[q + '|' + r.month] = r.rates[q]?.book != null ? String(r.rates[q]!.book) : '' }
watch(() => props.open, (o) => { if (o) { msg.value = ''; ok.value = ''; void load() } }, { immediate: true })
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const SRC: Record<Use['source'], string> = { book: 'book', book_near: 'nearest book', history: 'daily that month', daily: "today's daily" }
const changed = computed(() => (data.value?.rows ?? []).flatMap((r) => (data.value?.quotes ?? []).map((q) => ({ q, m: r.month, was: r.rates[q]?.book ?? null, now: edit[q + '|' + r.month]?.trim() ?? '' })))
  .filter((x) => (x.now === '' ? x.was !== null : Number(x.now.replace(/,/g, '')) !== x.was)))
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const rates = changed.value.map((x) => ({ quote: x.q, month: x.m, per_usd: x.now === '' ? null : Number(x.now.replace(/,/g, '')) }))
    if (rates.some((r) => r.per_usd !== null && !(r.per_usd > 0))) throw new Error('Rates are units of the currency per 1 USD, above zero.')
    await $fetch('/api/financials/fx-rates', { method: 'POST', body: { rates } }); ok.value = 'Saved. The group figures use them now.'; await load(); emit('changed')
  } catch (e) { msg.value = err(e, (e as Error).message || 'Could not save.') } finally { busy.value = false }
}
async function upload(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { const fd = new FormData(); fd.append('file', f); const r = await $fetch<{ saved: number; currencies: string[] }>('/api/financials/fx-rates/upload', { method: 'POST', body: fd }); ok.value = r.saved + ' monthly rate' + (r.saved === 1 ? '' : 's') + ' saved (' + r.currencies.join(', ') + ').'; await load(); emit('changed') }
  catch (e) { msg.value = err(e, 'Could not read that file.') } finally { busy.value = false; (ev.target as HTMLInputElement).value = '' }
}
</script>

<template>
  <AppModal :open="open" title="Exchange rates for the group" wide @close="emit('close')">
    <div class="fx">
      <p class="hint">Units of each currency per 1 USD, as in your books. The group converts each month at your book rate for it; a month without one uses your nearest book rate, else the daily rate. Upload a workbook with an Exchange rates or FX rates tab (a month column and a rate column under a heading like "NGN per 1 USD", or one row per currency with months across), or type the rates in.</p>
      <div v-if="canEdit" class="up"><label class="btn secondary sm">Upload rates<input type="file" accept=".xlsx,.csv" hidden :disabled="busy" @change="upload"></label></div>
      <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
      <p v-if="data && !data.quotes.length" class="hint">Every company in the group reports in {{ data.to }}: no rates needed.</p>
      <div v-else-if="data" class="tw"><table class="t" data-nosearch>
        <thead><tr><th>Month</th><th v-for="q in data.quotes" :key="q">{{ q }} per $1</th></tr></thead>
        <tbody><tr v-for="r in data.rows" :key="r.month"><td>{{ mon(r.month) }}</td>
          <td v-for="q in data.quotes" :key="q"><div class="cl"><input v-if="canEdit" v-model="edit[q + '|' + r.month]" inputmode="decimal" :placeholder="r.rates[q]?.used ? String(Math.round(r.rates[q]!.used!.per_usd * 100) / 100) : ''" :aria-label="q + ' ' + mon(r.month)"><b v-else>{{ r.rates[q]?.book ?? '—' }}</b>
            <em v-if="r.rates[q]?.used && r.rates[q]!.book == null" :class="{ weak: r.rates[q]!.used!.source !== 'book' }">used {{ Math.round(r.rates[q]!.used!.per_usd * 100) / 100 }} · {{ SRC[r.rates[q]!.used!.source] }}</em></div></td></tr></tbody></table></div>
      <p v-else class="hint">Loading…</p>
    </div>
    <template #foot><button class="btn secondary" type="button" @click="emit('close')">Close</button><button v-if="canEdit" class="btn" type="button" :disabled="busy || !changed.length" @click="save">{{ busy ? 'Saving…' : changed.length ? 'Save ' + changed.length + ' rate' + (changed.length === 1 ? '' : 's') : 'Save' }}</button></template>
  </AppModal>
</template>

<style scoped>
.fx { display: flex; flex-direction: column; gap: 10px; } .hint { margin: 0; font-size: 13px; color: var(--c-muted); line-height: 1.5; } .okm { margin: 0; color: var(--c-ok); font-size: 13.5px; } .error { margin: 0; color: var(--c-danger); font-size: 13.5px; }
.tw { max-height: 420px; overflow: auto; border: 1px solid var(--c-rule); } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.t th { position: sticky; top: 0; background: #fff; text-align: left; font-weight: 500; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule-strong); }
.t td { padding: 5px 10px; border-bottom: 1px solid var(--c-rule); } .cl { display: flex; align-items: center; gap: 10px; }
.t input { width: 120px; font: inherit; font-size: 13.5px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); } .t em { font-style: normal; font-size: 12px; color: var(--c-muted); } .t em.weak { color: #8a5a0a; }
</style>
