<script setup lang="ts">
const id = useRoute().params.id as string
const { data, refresh } = await useFetch<{ invoice: any; online: string[]; link: string; wallet: { currency: string; balance_minor: number } | null }>('/api/services/invoices/' + id)
useHead({ title: () => 'Invoice ' + (data.value?.invoice.number ?? '') })
const msg = ref(''); const ok = ref(''); const busy = ref(false); const paidOn = ref(new Date().toISOString().slice(0, 10))
async function act(action: string) {
  if (action === 'void' && !await askConfirm('Void this invoice?')) return
  if (action === 'charge_wallet' && !await askConfirm('Charge ' + money(data.value!.invoice.amount, data.value!.invoice.currency) + ' to the client wallet now? The client gets a receipt.')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/services/invoices/' + id + '/action', { method: 'POST', body: { action, paid_on: action === 'mark_paid' ? paidOn.value : undefined } }); ok.value = action === 'send' ? 'Sent to ' + data.value?.invoice.bill_to.email + '.' : action === 'mark_paid' ? 'Marked as paid.' : action === 'charge_wallet' ? 'Paid from the client wallet. Receipt emailed.' : 'Voided.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = false }
}
async function copy() { await navigator.clipboard.writeText(data.value!.link); ok.value = 'Pay link copied.' }
const money = (v: number | string, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const walletOk = computed(() => !!data.value?.wallet && data.value.wallet.currency === data.value.invoice.currency && data.value.wallet.balance_minor >= Math.round(Number(data.value.invoice.amount) * 100))
// Dates: back-date an old invoice (issue, due, and paid date if it is paid).
const dt = reactive({ open: false, issue_date: '', due_date: '', paid_on: '' })
function openDates() { const i = data.value!.invoice; Object.assign(dt, { open: !dt.open, issue_date: i.issue_date, due_date: i.due_date, paid_on: i.paid_at ?? '' }) }
async function saveDates() {
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/services/invoices/' + id + '/dates', { method: 'POST', body: { issue_date: dt.issue_date, due_date: dt.due_date, paid_on: data.value?.invoice.status === 'paid' ? dt.paid_on : undefined } }); ok.value = 'Dates updated.'; dt.open = false; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' } finally { busy.value = false }
}
const today = new Date().toISOString().slice(0, 10)
const doPrint = () => data.value && downloadPdf({ kind: 'invoice', invoice: invoiceForPdf(data.value.invoice) })
</script>

<template>
  <section v-if="data" class="wrap">
    <div class="bar noprint">
      <NuxtLink to="/services/invoices" class="btn secondary">← Invoices</NuxtLink>
      <div class="row">
        <button v-if="data.invoice.status !== 'void'" class="btn secondary" :class="{ on: dt.open }" @click="openDates">Change dates</button>
        <DeleteButton type="cs_invoice" :id="id" :name="'invoice ' + data.invoice.number + (data.invoice.status === 'paid' ? ' (marked paid' + (data.invoice.paid_via === 'wallet' ? ' from the wallet — the amount is not refunded' : '') + ')' : '')" to="/services/invoices" />
        <button class="btn secondary" @click="doPrint">Download PDF</button>
        <button v-if="data.invoice.status !== 'draft' && data.invoice.status !== 'void'" class="btn secondary" @click="copy">Copy pay link</button>
        <NuxtLink v-if="data.invoice.status === 'draft' || data.invoice.status === 'sent'" :to="{ path: '/services/invoices/new', query: { edit: id } }" class="btn secondary">Edit invoice</NuxtLink>
        <template v-if="data.invoice.status === 'draft' || data.invoice.status === 'sent'"><button class="btn" :disabled="busy" @click="act('send')">{{ data.invoice.status === 'draft' ? 'Send to client' : 'Resend' }}</button></template>
      </div>
    </div>
    <p v-if="data.invoice.job_id || data.invoice.paid_via === 'wallet'" class="lnk noprint"><template v-if="data.invoice.job_id">For job <NuxtLink :to="'/services/' + data.invoice.job_id">{{ data.invoice.job }}</NuxtLink></template><template v-if="data.invoice.paid_via === 'wallet'"> · Paid from the client's wallet</template></p>
    <form v-if="dt.open" class="card dates noprint" @submit.prevent="saveDates">
      <div><b>Invoice dates</b><span class="muted sm">For an old invoice you are logging now. The invoice number stays the same.{{ data.invoice.status === 'paid' ? ' Renewals started by this invoice follow the paid date.' : '' }}</span></div>
      <div class="dg"><label>Issued<input v-model="dt.issue_date" type="date" :max="today" required></label><label>Due<input v-model="dt.due_date" type="date" :min="dt.issue_date" required></label>
        <label v-if="data.invoice.status === 'paid'">Paid on<input v-model="dt.paid_on" type="date" :max="today" required></label></div>
      <div class="row"><button type="button" class="btn secondary" @click="dt.open = false">Cancel</button><button class="btn" :disabled="busy">Save dates</button></div>
    </form>
    <p v-if="ok" class="ok noprint" role="status">{{ ok }}</p><p v-if="msg" class="error noprint" role="alert">{{ msg }}</p>
    <div v-if="data.invoice.status === 'sent' || data.invoice.status === 'draft'" class="card side noprint">
      <span class="muted sm">{{ data.online.length ? 'The client can pay online by ' + (data.online[0] === 'stripe' ? 'card (Stripe)' : 'card or transfer (Paystack)') + ' or by bank transfer.' : 'Online payment is not set up for this currency; the client pays by bank transfer.' }}</span>
      <div v-if="data.wallet" class="wrow"><span>Client wallet <b>{{ money(data.wallet.balance_minor / 100, data.wallet.currency) }}</b><em v-if="data.wallet.currency !== data.invoice.currency"> · wallet is in {{ data.wallet.currency }}, invoice in {{ data.invoice.currency }}</em><em v-else-if="!walletOk"> · not enough to cover this invoice</em></span>
        <button class="btn" :disabled="busy || !walletOk" @click="act('charge_wallet')">Charge wallet {{ money(data.invoice.amount, data.invoice.currency) }}</button></div>
      <span v-else class="muted sm">No Finvry wallet for this client — they have no Finvry account yet.</span>
      <div class="row"><input v-model="paidOn" type="date" aria-label="Paid on"><button class="btn secondary" :disabled="busy" @click="act('mark_paid')">Mark as paid</button><button class="btn secondary" :disabled="busy" @click="act('void')">Void</button></div>
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
.wrow { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--c-rule); margin-bottom: 10px; font-size: 14px; } .wrow em { font-style: normal; color: var(--c-muted); font-size: 13px; }
.dates { display: flex; flex-direction: column; gap: 12px; margin: 0 0 16px; } .dates > div:first-child { display: flex; flex-direction: column; gap: 2px; } .dg { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; } .dg label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .dg input { font: inherit; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .btn.on { border-color: var(--c-navy); }
</style>
