<script setup lang="ts">
// Console settings: bank transfers into wallets. Monnify gives each company its own account number; when it is off,
// companies see the default bank details below and the team credits wallets by hand.
interface B { bank: string; account_number: string; account_name: string; routing?: string; swift?: string }
const { data, refresh } = await useFetch<{ monnify_enabled: boolean; monnify_env: string; monnify_api_key: string; monnify_secret_key: string; monnify_contract_code?: string; bank_ngn?: B; bank_usd?: B; webhook: string }>('/api/platform/wallet-settings')
const blank = (): B => ({ bank: '', account_number: '', account_name: '', routing: '', swift: '' })
const f = reactive({ monnify_enabled: false, monnify_env: 'sandbox', monnify_api_key: '', monnify_secret_key: '', monnify_contract_code: '', bank_ngn: blank(), bank_usd: blank() })
watchEffect(() => { const d = data.value; if (d) Object.assign(f, { monnify_enabled: d.monnify_enabled, monnify_env: d.monnify_env, monnify_api_key: d.monnify_api_key, monnify_secret_key: d.monnify_secret_key, monnify_contract_code: d.monnify_contract_code ?? '', bank_ngn: { ...blank(), ...(d.bank_ngn ?? {}) }, bank_usd: { ...blank(), ...(d.bank_usd ?? {}) } }) })
const msg = ref(''); const ok = ref('')
async function save() { msg.value = ''; ok.value = ''; try { await $fetch('/api/platform/wallet-settings', { method: 'POST', body: f }); ok.value = 'Saved.'; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>
<template>
  <form v-if="data" class="ws" @submit.prevent="save">
    <h2>Wallet &amp; bank transfers</h2>
    <p class="muted">How companies add money by bank transfer. With Monnify on, each naira wallet gets its own account number and transfers credit automatically. With it off, companies see the default bank details below and you credit their wallet in Finance when the money arrives.</p>
    <label class="tg"><input v-model="f.monnify_enabled" type="checkbox"> <b>Dedicated account numbers (Monnify)</b></label>
    <div v-if="f.monnify_enabled" class="g2">
      <label class="label">Environment<select v-model="f.monnify_env"><option value="sandbox">Sandbox (testing)</option><option value="live">Live</option></select></label>
      <label class="label">Contract code<input v-model="f.monnify_contract_code" maxlength="60"></label>
      <label class="label">API key<input v-model="f.monnify_api_key" maxlength="200" autocomplete="off"></label>
      <label class="label">Secret key<input v-model="f.monnify_secret_key" maxlength="200" autocomplete="off" placeholder="Leave as is to keep"></label>
      <p class="muted w">Set this webhook URL in your Monnify dashboard: <code>{{ data.webhook }}</code></p>
    </div>
    <h3>Default naira account <span class="muted">(shown when Monnify is off)</span></h3>
    <div class="g3"><label class="label">Bank<input v-model="f.bank_ngn.bank" maxlength="120"></label><label class="label">Account number<input v-model="f.bank_ngn.account_number" maxlength="40" inputmode="numeric"></label><label class="label">Account name<input v-model="f.bank_ngn.account_name" maxlength="200"></label></div>
    <h3>Default US dollar account <span class="muted">(optional)</span></h3>
    <div class="g3"><label class="label">Bank<input v-model="f.bank_usd.bank" maxlength="120"></label><label class="label">Account number<input v-model="f.bank_usd.account_number" maxlength="40"></label><label class="label">Account name<input v-model="f.bank_usd.account_name" maxlength="200"></label>
      <label class="label">Routing (ACH)<input v-model="f.bank_usd.routing" maxlength="40"></label><label class="label">SWIFT<input v-model="f.bank_usd.swift" maxlength="20"></label></div>
    <div><button class="btn" type="submit">Save</button></div><p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
  </form>
</template>
<style scoped>
.ws { display: flex; flex-direction: column; gap: 12px; } .ws h2 { margin: 0; } .ws h3 { margin: 6px 0 0; font-size: 17px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; }
label.label { display: flex; flex-direction: column; gap: 6px; } input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .tg { display: flex; gap: 8px; align-items: center; } .tg input { width: auto; }
.muted { color: var(--c-muted); font-size: 13px; margin: 0; font-weight: 400; } code { font-size: 12px; background: var(--c-paper-2); padding: 2px 6px; } .ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .g2, .g3 { grid-template-columns: 1fr; } }
</style>
