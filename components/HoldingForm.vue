<script setup lang="ts">
// Add or edit a holding: stocks/ETFs, crypto, gold/silver (dealer, vault, ounces, spot or manual value), savings, other.
const props = defineProps<{ clientId?: string | null; edit?: Record<string, any> | null }>()
const emit = defineEmits<{ saved: []; close: [] }>()
const e = props.edit ?? null
const f = reactive({ category: e?.category ?? 'public_securities', name: e?.name ?? '', platform: e?.platform ?? '', currency: e?.currency ?? 'USD', cost: e?.cost ?? '', current_value: e?.current_value ?? '', as_of: e?.as_of ?? new Date().toISOString().slice(0, 10), notes: e?.notes ?? '',
  symbol: e?.meta?.symbol ?? '', units: e?.meta?.units ?? '', metal: e?.meta?.metal ?? 'gold', product: e?.meta?.product ?? '', quantity: e?.meta?.quantity ?? '', ounces: e?.meta?.ounces ?? '', dealer: e?.meta?.dealer ?? 'APMEX', vault: e?.meta?.vault ?? 'APMEX Citadel vault', certificate: e?.meta?.certificate ?? '', valuation: e?.meta?.valuation ?? 'manual', rate: e?.meta?.rate ?? '', maturity: e?.meta?.maturity ?? '' })
const msg = ref(''); const busy = ref(false)
const num = (v: unknown) => (v === '' || v == null ? undefined : Number(v))
async function save() { busy.value = true; msg.value = ''
  const meta: Record<string, unknown> = f.category === 'precious_metals' ? { metal: f.metal, product: f.product || undefined, quantity: num(f.quantity), ounces: num(f.ounces), dealer: f.dealer || undefined, vault: f.vault || undefined, certificate: f.certificate || undefined, valuation: f.valuation } : f.category === 'public_securities' || f.category === 'crypto' ? { symbol: f.symbol || undefined, units: num(f.units) } : f.category === 'cash' || f.category === 'bonds' ? { rate: num(f.rate), maturity: f.maturity || undefined } : {}
  try { await $fetch('/api/wm/holdings', { method: 'POST', body: { id: e?.id, wm_client_id: props.clientId ?? null, category: f.category, name: f.name, platform: f.platform, currency: f.currency, cost: num(f.cost) ?? null, current_value: num(f.current_value) ?? null, as_of: f.as_of, notes: f.notes, meta } }); emit('saved') } catch (er) { msg.value = (er as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false } }
</script>
<template>
  <div class="hf"><div class="g3"><label>Asset type<select v-model="f.category"><option value="public_securities">Stocks &amp; ETFs</option><option value="crypto">Crypto</option><option value="precious_metals">Gold / silver</option><option value="cash">Fixed USD savings / cash</option><option value="bonds">Bonds / T-bills</option><option value="fund">Fund</option><option value="real_estate">Real estate</option><option value="retirement">Retirement</option><option value="other">Other</option></select></label>
      <label>Name *<input v-model="f.name" maxlength="200" :placeholder="f.category === 'precious_metals' ? '1 oz Gold Bar - PAMP' : 'e.g. VOO, Bitcoin, Sprout USD savings'"></label><label>Platform / where held<input v-model="f.platform" maxlength="120" placeholder="Robinhood, Alpaca, Busha, APMEX, Cowrywise…"></label>
      <template v-if="f.category === 'public_securities' || f.category === 'crypto'"><label>Symbol<input v-model="f.symbol" maxlength="20"></label><label>Units<input v-model="f.units" type="number" min="0" step="any"></label><span /></template>
      <template v-if="f.category === 'precious_metals'"><label>Metal<select v-model="f.metal"><option value="gold">Gold</option><option value="silver">Silver</option><option value="platinum">Platinum</option></select></label><label>Quantity (pieces)<input v-model="f.quantity" type="number" min="0"></label><label>Total ounces<input v-model="f.ounces" type="number" min="0" step="any"></label>
        <label>Dealer<input v-model="f.dealer" maxlength="120"></label><label>Storage / vault<input v-model="f.vault" maxlength="120"></label><label>Certificate / serial<input v-model="f.certificate" maxlength="120"></label>
        <label>Value by<select v-model="f.valuation"><option value="manual">Dealer statement (enter value)</option><option value="spot">Spot price × ounces</option></select></label><span /><span /></template>
      <template v-if="f.category === 'cash' || f.category === 'bonds'"><label>Interest % a year<input v-model="f.rate" type="number" min="0" step="0.01"></label><label>Matures<input v-model="f.maturity" type="date"></label><span /></template>
      <label>Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label><label>Cost<input v-model="f.cost" type="number" min="0" step="0.01"></label><label>Current value<input v-model="f.current_value" type="number" min="0" step="0.01" :disabled="f.category === 'precious_metals' && f.valuation === 'spot'"></label>
      <label>Value as of<input v-model="f.as_of" type="date"></label></div>
    <label class="full">Notes<textarea v-model="f.notes" rows="2" maxlength="3000" /></label>
    <div class="row"><button class="btn" :disabled="busy || !f.name" @click="save">{{ busy ? 'Saving…' : e ? 'Save changes' : 'Add holding' }}</button><button class="btn secondary" @click="emit('close')">Cancel</button><span v-if="msg" class="error">{{ msg }}</span></div></div>
</template>
<style scoped>
.hf, .hf * { box-sizing: border-box; } .hf { display: flex; flex-direction: column; gap: 10px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; min-width: 0; } .row { display: flex; gap: 8px; align-items: center; } .error { color: var(--c-danger); font-size: 13px; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
</style>
