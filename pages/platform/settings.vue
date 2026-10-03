<script setup lang="ts">
useHead({ title: 'Finvry · Settings' })
const { data, refresh } = await useFetch<{ issuer_name: string; issuer_address: string; issuer_email: string; invoice_prefix: string; payment_terms_days: number; payment_instructions: string }>('/api/platform/settings')
const f = reactive({ issuer_name: '', issuer_address: '', issuer_email: '', invoice_prefix: 'FIN', payment_terms_days: 14, payment_instructions: '' })
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
      <div class="row"><button class="btn" type="submit">Save</button><span v-if="ok" class="ok">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
  </section>
</template>

<style scoped>
.frm { display: flex; flex-direction: column; gap: 14px; max-width: 680px; margin-top: 16px; } .frm label { display: flex; flex-direction: column; gap: 6px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
input, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); text-transform: none; letter-spacing: normal; } .row { display: flex; gap: 12px; align-items: center; }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); }
</style>
