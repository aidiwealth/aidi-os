<script setup lang="ts">
useHead({ title: 'Finvry · Settings' })
const { data, refresh } = await useFetch<{ issuer_name: string; issuer_address: string; issuer_email: string; invoice_prefix: string; payment_terms_days: number; payment_instructions: string; ngn_per_usd: number }>('/api/platform/settings')
const { data: pay } = await useFetch<{ stripe: boolean; stripeWebhook: boolean; paystack: boolean; stripeWebhookUrl: string; paystackWebhookUrl: string }>('/api/platform/payments')
const copy = (s: string) => navigator.clipboard.writeText(s)
const f = reactive({ issuer_name: '', issuer_address: '', issuer_email: '', invoice_prefix: 'FIN', payment_terms_days: 14, payment_instructions: '', ngn_per_usd: 1600 })
watchEffect(() => { if (data.value) Object.assign(f, data.value) })
const msg = ref(''); const ok = ref('')
async function save() {
  msg.value = ''; ok.value = ''
  try { await $fetch('/api/platform/settings', { method: 'POST', body: f }); ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
</script>

<template>
  <section>
    <p class="label">Finvry platform</p>
    <h1>Settings</h1>
    <form class="card frm" @submit.prevent="save">
      <h2>Invoices</h2>
      <label class="label">Issued by (legal name)<input v-model="f.issuer_name" required maxlength="200" placeholder="The entity that bills customers"></label>
      <label class="label">Address<input v-model="f.issuer_address" maxlength="500"></label>
      <label class="label">Billing email<input v-model="f.issuer_email" maxlength="254" placeholder="billing@finvry.com"></label>
      <div class="two"><label class="label">Invoice number prefix<input v-model="f.invoice_prefix" required pattern="[A-Z0-9]{2,8}"></label><label class="label">Payment terms (days)<input v-model.number="f.payment_terms_days" type="number" min="0" max="120"></label></div>
      <label class="label">How to pay<textarea v-model="f.payment_instructions" rows="6" maxlength="3000" placeholder="Bank name, account name, account number, routing / SWIFT, reference to quote" /><span class="hint">Shown on every invoice and invoice email.</span></label>
      <label class="label">Naira per US dollar (for reporting NGN subscriptions in MRR)<input v-model.number="f.ngn_per_usd" type="number" min="1" step="any"></label>
      <div class="row"><button class="btn" type="submit">Save</button><span v-if="ok" class="ok">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <div v-if="pay" class="card frm">
      <h2>Online payments</h2>
      <div class="prov"><b>Stripe</b><span :class="pay.stripe ? 'on' : 'off'">{{ pay.stripe ? (pay.stripeWebhook ? 'Connected' : 'Key set; webhook secret missing') : 'Not connected' }}</span><span class="hint">Cards in USD.</span></div>
      <div class="hk"><code>{{ pay.stripeWebhookUrl }}</code><button type="button" class="link" @click="copy(pay.stripeWebhookUrl)">Copy</button></div>
      <p class="hint">Webhook events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed.</p>
      <div class="prov"><b>Paystack</b><span :class="pay.paystack ? 'on' : 'off'">{{ pay.paystack ? 'Connected' : 'Not connected' }}</span><span class="hint">Cards and bank payments in NGN (USD if your Paystack account allows it).</span></div>
      <div class="hk"><code>{{ pay.paystackWebhookUrl }}</code><button type="button" class="link" @click="copy(pay.paystackWebhookUrl)">Copy</button></div>
      <p class="hint">Keys are set as app secrets, never here: NUXT_STRIPE_SECRET_KEY, NUXT_STRIPE_WEBHOOK_SECRET and NUXT_PAYSTACK_SECRET_KEY.</p>
    </div>
    <div class="card" style="margin-top: 16px"><WalletSettings /></div>
    <div class="card" style="margin-top: 16px"><TaxRates /></div>
  </section>
</template>

<style scoped>
.frm { display: flex; flex-direction: column; gap: 14px; max-width: 680px; margin-top: 16px; } .frm label { display: flex; flex-direction: column; gap: 6px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
input, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); text-transform: none; letter-spacing: normal; } .row { display: flex; gap: 12px; align-items: center; }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.prov { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; } .prov b { font-weight: 500; color: var(--c-navy); } .on { color: var(--c-ok); } .off { color: var(--c-muted); }
.hk { display: flex; gap: 10px; align-items: center; } .hk code { flex: 1; font-size: 12px; background: var(--c-paper); padding: 7px 8px; overflow-x: auto; white-space: nowrap; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
</style>
