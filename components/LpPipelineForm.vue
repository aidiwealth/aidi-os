<script setup lang="ts">
// Create or edit an LP pipeline: a fund raise (tied to one of the funds), a debt facility, or a co-investment / SPV
// (tied to a deal's round and, once invested, the portfolio company).
const props = defineProps<{ open: boolean; edit?: Record<string, unknown> | null; fundId?: string }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
interface Opts { funds: { id: string; name: string; currency: string; target: number | null }[]; deals: { id: string; company: string; round: string | null }[]; companies: { id: string; name: string; deal_id: string | null }[] }
const { data: o, execute } = useLazyFetch<Opts>('/api/funds/pipelines', { server: false, immediate: false })
const f = reactive({ id: '', name: '', kind: 'fund', fund_id: '', deal_id: '', company_id: '', currency: 'USD', target: '' as string | number, target_close: '', interest_pct: '' as string | number, tenor_months: '' as string | number, status: 'open' })
const msg = ref(''), busy = ref(false)
watch(() => props.open, async (v) => {
  if (!v) return
  msg.value = ''; await execute()
  const e = props.edit
  Object.assign(f, e ? { id: e.id, name: e.name, kind: e.kind, fund_id: e.fund_id ?? '', deal_id: e.deal_id ?? '', company_id: e.company_id ?? '', currency: e.currency ?? 'USD', target: e.target ?? '', target_close: e.target_close ?? '', interest_pct: e.interest_pct ?? '', tenor_months: e.tenor_months ?? '', status: e.status ?? 'open' }
    : { id: '', name: '', kind: 'fund', fund_id: props.fundId ?? o.value?.funds[0]?.id ?? '', deal_id: '', company_id: '', currency: 'USD', target: '', target_close: '', interest_pct: '', tenor_months: '', status: 'open' })
  if (!e && f.fund_id) { const fd = o.value?.funds.find((x) => x.id === f.fund_id); if (fd) { f.name = fd.name + ' raise'; f.currency = fd.currency; f.target = fd.target ?? '' } }
})
watch(() => f.fund_id, (id) => { if (f.id || f.kind !== 'fund') return; const fd = o.value?.funds.find((x) => x.id === id); if (fd) { f.name = fd.name + ' raise'; f.currency = fd.currency; if (fd.target) f.target = fd.target } })
watch(() => f.deal_id, (id) => { if (!id) return; const c = o.value?.companies.find((x) => x.deal_id === id); if (c) f.company_id = c.id; const d = o.value?.deals.find((x) => x.id === id); if (d && !f.id && f.kind === 'co_invest') f.name = 'Co-invest: ' + d.company + (d.round ? ' ' + d.round : '') })
watch(() => f.company_id, (id) => { if (!id || f.id || f.kind !== 'co_invest' || f.deal_id) return; const c = o.value?.companies.find((x) => x.id === id); if (c) f.name = 'Co-invest: ' + c.name })
async function save() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/funds/pipelines', { method: 'POST', body: { ...f, id: f.id || undefined, fund_id: f.fund_id || null, deal_id: f.deal_id || null, company_id: f.company_id || null, target: Number(f.target) || null, interest_pct: f.interest_pct === '' ? null : Number(f.interest_pct), tenor_months: f.tenor_months === '' ? null : Number(f.tenor_months) } }); emit('saved', r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
</script>
<template>
  <AppModal :open="open" :title="f.id ? 'Edit pipeline' : 'New LP pipeline'" @close="emit('close')">
    <form id="lppf" class="g2" @submit.prevent="save">
      <label class="label w">What are you raising<select v-model="f.kind" :disabled="!!f.id"><option value="fund">A fund (LP commitments)</option><option value="debt">A debt facility (lenders, credit funds)</option><option value="co_invest">A co-investment / SPV into a deal or portfolio company</option></select></label>
      <label v-if="f.kind === 'fund'" class="label w">Fund<select v-model="f.fund_id" required><option value="" disabled>Choose the fund</option><option v-for="x in o?.funds ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select><span v-if="o && !o.funds.length" class="mut">Set up the fund first (Funds &amp; LPs → Add a fund).</span></label>
      <template v-if="f.kind === 'co_invest'">
        <label class="label">Deal (VC round)<select v-model="f.deal_id"><option value="">None</option><option v-for="x in o?.deals ?? []" :key="x.id" :value="x.id">{{ x.company }}{{ x.round ? ' · ' + x.round : '' }}</option></select></label>
        <label class="label">Portfolio company<select v-model="f.company_id"><option value="">None (yet)</option><option v-for="x in o?.companies ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
        <p class="mut w">Once the deal closes and the company is added to the portfolio, the pipeline links to it.</p>
      </template>
      <label v-if="f.kind === 'debt'" class="label w">Fund or vehicle borrowing (optional)<select v-model="f.fund_id"><option value="">None</option><option v-for="x in o?.funds ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
      <label class="label w">Name<input v-model="f.name" required maxlength="120"></label>
      <label class="label">Target<input v-model="f.target" inputmode="decimal"></label>
      <label class="label">Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
      <template v-if="f.kind === 'debt'"><label class="label">Interest (% a year)<input v-model="f.interest_pct" inputmode="decimal"></label><label class="label">Tenor (months)<input v-model="f.tenor_months" inputmode="numeric"></label></template>
      <label class="label">Target close<input v-model="f.target_close" type="date"></label>
      <label v-if="f.id" class="label">Status<select v-model="f.status"><option value="open">Open</option><option value="closed">Closed</option></select></label>
      <p v-if="msg" class="error w">{{ msg }}</p>
    </form>
    <template #foot><span class="sp" /><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" type="submit" form="lppf" :disabled="busy">{{ f.id ? 'Save' : 'Create pipeline' }}</button></template>
  </AppModal>
</template>
<style scoped>
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .error { color: var(--c-danger); margin: 0; } .sp { flex: 1; }
</style>
