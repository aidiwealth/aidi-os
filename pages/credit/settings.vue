<script setup lang="ts">
// Admin: switch loan applications on or off and tune credit scoring.
useHead({ title: 'Credit settings' })
interface Cfg { loans_enabled: boolean; countries: string[]; auto_checks: boolean; require_bvn: boolean; max_amount: Record<string, number>; bands: { excellent: number; good: number; fair: number }; default_rate: number; default_tenor: number }
const { data, error, refresh } = await useFetch<{ config: Cfg; creditchek: { env: boolean; stored: boolean }; us_bureau: boolean }>('/api/credit/settings')
const c = reactive<Cfg>({ loans_enabled: true, countries: [], auto_checks: true, require_bvn: true, max_amount: {}, bands: { excellent: 750, good: 680, fair: 600 }, default_rate: 24, default_tenor: 12 })
const countriesText = ref(''); const maxNgn = ref<number | ''>(''); const maxUsd = ref<number | ''>(''); const key = ref('')
watchEffect(() => { if (data.value) { Object.assign(c, JSON.parse(JSON.stringify(data.value.config))); countriesText.value = c.countries.join(', '); maxNgn.value = c.max_amount.NGN ?? ''; maxUsd.value = c.max_amount.USD ?? '' } })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function save() { busy.value = true; msg.value = ''; ok.value = ''
  const max: Record<string, number> = {}; if (maxNgn.value !== '') max.NGN = Number(maxNgn.value); if (maxUsd.value !== '') max.USD = Number(maxUsd.value)
  try { await $fetch('/api/credit/settings', { method: 'POST', body: { config: { ...c, countries: countriesText.value.split(',').map((x) => x.trim()).filter(Boolean), max_amount: max }, creditchek_key: key.value || undefined } }); key.value = ''; await refresh(); ok.value = 'Saved.' } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function clearKey() { if (!confirm('Remove the stored CreditChek key? Automatic checks stop unless a key is set in the server settings.')) return; await $fetch('/api/credit/settings', { method: 'POST', body: { clear_key: true } }); await refresh() }
</script>
<template>
  <section>
    <NuxtLink to="/credit" class="back">← Credit</NuxtLink>
    <h1>Credit settings</h1><p class="lead">Loan requests from the pitch form and how credit is scored. Only admins can change these.</p>
    <p v-if="error" class="error">{{ error.statusCode === 403 ? 'Only admins can change credit settings.' : 'Could not load the settings.' }}</p>
    <template v-else-if="data">
      <div class="card sec"><h2>Loan applications</h2>
        <label class="sw"><input v-model="c.loans_enabled" type="checkbox"> Accept venture debt / loan requests on the pitch form</label>
        <label class="label">Countries we lend in<input v-model="countriesText" placeholder="Leave empty for all countries, or e.g. Nigeria, Ghana, United States"><span class="hint">Requests from other countries are told loans are not available there yet.</span></label>
        <div class="g3"><label class="label">Largest loan · NGN<input v-model="maxNgn" type="number" min="0" placeholder="No limit"></label><label class="label">Largest loan · USD<input v-model="maxUsd" type="number" min="0" placeholder="No limit"></label><span /></div>
        <div class="g3"><label class="label">Default rate (% a year)<input v-model.number="c.default_rate" type="number" min="0" max="200" step="0.5"></label><label class="label">Default tenor (months)<input v-model.number="c.default_tenor" type="number" min="1" max="360"></label><span /></div></div>
      <div class="card sec"><h2>Credit checks</h2>
        <label class="sw"><input v-model="c.auto_checks" type="checkbox"> Run credit checks automatically when a loan request arrives</label>
        <label class="sw"><input v-model="c.require_bvn" type="checkbox"> Require the founder's BVN for Nigerian loan requests</label>
        <div class="key"><b>CreditChek (Nigeria)</b><span v-if="data.creditchek.env" class="okc">Connected through the server settings</span><span v-else-if="data.creditchek.stored" class="okc">Connected with a stored key <button class="lk" type="button" @click="clearKey">Remove key</button></span><span v-else class="warn">Not connected: automatic checks are off</span>
          <label v-if="!data.creditchek.env" class="label">{{ data.creditchek.stored ? 'Replace the key' : 'Secret key' }}<input v-model="key" type="password" autocomplete="off" placeholder="sk_live_…"><span class="hint">Stored encrypted. Used for BVN (founder) and RC (business) checks.</span></label></div>
        <p class="hint">US and other countries: no bureau is connected{{ data.us_bureau ? '' : ' (switched off)' }}. Enter scores manually and upload the founder's Equifax, Experian, TransUnion, FICO or Credit Karma report.</p></div>
      <div class="card sec"><h2>Score bands</h2><p class="hint">Scores run from 300 to 850. Bands colour the scores across Credit, applications and the LP portal.</p>
        <div class="g3"><label class="label">Excellent from<input v-model.number="c.bands.excellent" type="number" min="300" max="850"></label><label class="label">Good from<input v-model.number="c.bands.good" type="number" min="300" max="850"></label><label class="label">Fair from<input v-model.number="c.bands.fair" type="number" min="300" max="850"></label></div><p class="hint">Below {{ c.bands.fair }} is Poor.</p></div>
      <div class="acts"><button class="btn" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save settings' }}</button><span v-if="ok" class="okc">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span></div>
    </template>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } h1 { margin: 6px 0 0; } .lead { color: var(--c-muted); margin: 4px 0 16px; }
.sec { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; max-width: 860px; } .sec h2 { margin: 0; font-size: 17px; } .sw { display: flex; gap: 8px; align-items: center; font-size: 14px; } .sw input { width: auto; }
label.label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; } input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); box-sizing: border-box; width: 100%; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hint { font-size: 12.5px; color: var(--c-muted); margin: 0; } .key { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--c-paper-2); } .okc { color: var(--c-ok); font-size: 13px; } .warn { color: var(--c-warn); font-size: 13px; }
.lk { background: none; border: 0; color: var(--c-danger); cursor: pointer; font: inherit; font-size: 12.5px; margin-left: 8px; } .acts { display: flex; gap: 12px; align-items: center; } .error { color: var(--c-danger); }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
</style>
