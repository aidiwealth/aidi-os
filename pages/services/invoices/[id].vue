<script setup lang="ts">
const id = useRoute().params.id as string
const { data, refresh } = await useFetch<{ invoice: any; online: string[]; link: string }>('/api/services/invoices/' + id)
useHead({ title: () => 'Invoice ' + (data.value?.invoice.number ?? '') })
const msg = ref(''); const ok = ref(''); const busy = ref(false); const paidOn = ref(new Date().toISOString().slice(0, 10))
async function act(action: string) {
  if (action === 'void' && !confirm('Void this invoice?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/services/invoices/' + id + '/action', { method: 'POST', body: { action, paid_on: action === 'mark_paid' ? paidOn.value : undefined } }); ok.value = action === 'send' ? 'Sent to ' + data.value?.invoice.bill_to.email + '.' : action === 'mark_paid' ? 'Marked as paid.' : 'Voided.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = false }
}
async function copy() { await navigator.clipboard.writeText(data.value!.link); ok.value = 'Pay link copied.' }
const doPrint = () => data.value && downloadPdf({ kind: 'invoice', invoice: invoiceForPdf(data.value.invoice) })
</script>

<template>
  <section v-if="data" class="wrap">
    <div class="bar noprint">
      <NuxtLink to="/services/invoices" class="btn secondary">← Invoices</NuxtLink>
      <div class="row">
        <button class="btn secondary" @click="doPrint">Download PDF</button>
        <button v-if="data.invoice.status !== 'draft' && data.invoice.status !== 'void'" class="btn secondary" @click="copy">Copy pay link</button>
        <NuxtLink v-if="data.invoice.status === 'draft' || data.invoice.status === 'sent'" :to="{ path: '/services/invoices/new', query: { edit: id } }" class="btn secondary">Edit invoice</NuxtLink>
        <template v-if="data.invoice.status === 'draft' || data.invoice.status === 'sent'"><button class="btn" :disabled="busy" @click="act('send')">{{ data.invoice.status === 'draft' ? 'Send to client' : 'Resend' }}</button></template>
      </div>
    </div>
    <p v-if="data.invoice.job_id || data.invoice.paid_via === 'wallet'" class="lnk noprint"><template v-if="data.invoice.job_id">For job <NuxtLink :to="'/services/' + data.invoice.job_id">{{ data.invoice.job }}</NuxtLink></template><template v-if="data.invoice.paid_via === 'wallet'"> · Paid from the client's wallet</template></p>
    <p v-if="ok" class="ok noprint" role="status">{{ ok }}</p><p v-if="msg" class="error noprint" role="alert">{{ msg }}</p>
    <div v-if="data.invoice.status === 'sent' || data.invoice.status === 'draft'" class="card side noprint">
      <span class="muted sm">{{ data.online.length ? 'The client can pay online by ' + (data.online[0] === 'stripe' ? 'card (Stripe)' : 'card or transfer (Paystack)') + ' or by bank transfer.' : 'Online payment is not set up for this currency; the client pays by bank transfer.' }}</span>
      <div class="row"><input v-model="paidOn" type="date" aria-label="Paid on"><button class="btn secondary" :disabled="busy" @click="act('mark_paid')">Mark as paid</button><button class="btn secondary" :disabled="busy" @click="act('void')">Void</button>
        <DeleteButton v-if="data.invoice.status === 'draft'" type="cs_invoice" :id="id" :name="'invoice ' + data.invoice.number" to="/services/invoices" /></div>
    </div>
    <ClientInvoice :inv="data.invoice" />
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }

.wrap { max-width: 900px; } .bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.side { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; } .sm { font-size: 13px; }
@media print { .noprint { display: none !important; } }
.lnk { font-size: 13.5px; color: var(--c-muted); margin: 8px 0; } .lnk a { color: var(--c-blue-deep); }
</style>
