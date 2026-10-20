<script setup lang="ts">
// A wealth invoice (Aidi logo, billed by the chosen entity): send, edit, change dates, mark paid, waive, download.
const id = useRoute().params.id as string
const { data, refresh } = await useFetch<{ id: string; kind: string; client_id: string | null; method: string | null; invoice_doc_id: string | null; receipt_doc_id: string | null; raw_status: string; pay_link: string | null; invoice: any }>('/api/wm/invoices/' + id)
useHead({ title: () => 'Invoice ' + (data.value?.invoice.number ?? '') })
const busy = ref(false), msg = ref(''), ok = ref('')
const today = new Date().toISOString().slice(0, 10)
const paid = reactive({ on: today, method: 'transfer' })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function act(action: string, done: string, extra: Record<string, unknown> = {}) {
  if (action === 'waive' && !await askConfirm('Waive this invoice? The client will not be asked to pay it.')) return
  if (action === 'delete' && !await askConfirm('Delete this draft invoice?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/wm/fees/' + id, { method: 'POST', body: { action, ...extra } }); if (action === 'delete') return navigateTo(data.value?.client_id ? '/wealth-mgmt/clients/' + data.value.client_id : '/wealth-mgmt'); ok.value = done; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const dt = reactive({ open: false, issue_date: '', due_date: '', paid_on: '' })
function openDates() { const i = data.value!.invoice; Object.assign(dt, { open: !dt.open, issue_date: i.issue_date, due_date: i.due_date, paid_on: i.paid_at ?? '' }) }
async function saveDates() {
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/wm/invoices/' + id + '/dates', { method: 'POST', body: { issue_date: dt.issue_date, due_date: dt.due_date, paid_on: data.value?.raw_status === 'paid' ? dt.paid_on : undefined } }); ok.value = 'Dates updated.'; dt.open = false; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function copyLink() { if (data.value?.pay_link) { await navigator.clipboard.writeText(data.value.pay_link); ok.value = 'Pay link copied.' } }
const doPrint = () => data.value && downloadPdf({ kind: 'invoice', invoice: invoiceForPdf(data.value.invoice) })
const editable = computed(() => data.value?.kind === 'invoice' && (data.value.raw_status === 'draft' || data.value.raw_status === 'due'))
</script>

<template>
  <section v-if="data" class="wrap">
    <div class="bar noprint">
      <NuxtLink :to="data.client_id ? '/wealth-mgmt/clients/' + data.client_id : '/wealth-mgmt'" class="btn secondary">← Client</NuxtLink>
      <div class="row">
        <button v-if="data.raw_status !== 'waived'" class="btn secondary" :class="{ on: dt.open }" @click="openDates">Change dates</button>
        <button class="btn secondary" @click="doPrint">Download PDF</button>
        <button v-if="data.pay_link" class="btn secondary" @click="copyLink">Copy pay link</button>
        <NuxtLink v-if="editable" :to="{ path: '/wealth-mgmt/invoices/new', query: { edit: id } }" class="btn secondary">Edit invoice</NuxtLink>
        <button v-if="data.raw_status === 'draft' || data.raw_status === 'due'" class="btn" :disabled="busy" @click="act('send', 'Invoice emailed to the client.')">{{ data.raw_status === 'draft' ? 'Send to client' : 'Resend' }}</button>
      </div>
    </div>
    <p class="lnk noprint"><template v-if="data.invoice_doc_id"><a :href="'/api/wm/doc/' + data.invoice_doc_id" target="_blank">Issued invoice PDF</a></template><template v-if="data.receipt_doc_id"> · <a :href="'/api/wm/doc/' + data.receipt_doc_id" target="_blank">Receipt PDF</a></template><template v-if="data.raw_status === 'draft'">Draft — not numbered or visible to the client until you send it.</template></p>
    <form v-if="dt.open" class="card dates noprint" @submit.prevent="saveDates">
      <div><b>Invoice dates</b><span class="muted sm">For an old invoice you are logging now. The invoice number stays the same.{{ data.raw_status === 'paid' ? ' The books follow the paid date.' : '' }}</span></div>
      <div class="dg"><label>Issued<input v-model="dt.issue_date" type="date" :max="today" required></label><label>Due<input v-model="dt.due_date" type="date" :min="dt.issue_date" required></label>
        <label v-if="data.raw_status === 'paid'">Paid on<input v-model="dt.paid_on" type="date" :max="today" required></label></div>
      <div class="row"><button type="button" class="btn secondary" @click="dt.open = false">Cancel</button><button class="btn" :disabled="busy">Save dates</button></div>
    </form>
    <p v-if="ok" class="ok noprint" role="status">{{ ok }}</p><p v-if="msg" class="error noprint" role="alert">{{ msg }}</p>
    <div v-if="data.raw_status === 'due' || data.raw_status === 'draft'" class="card side noprint">
      <span class="muted sm">{{ data.method === 'online' ? 'The client pays online with the pay link in the email.' : 'The client pays by bank transfer to the account in Wealth settings.' }} Record a payment here when it arrives.</span>
      <div class="row"><input v-model="paid.on" type="date" :max="today" aria-label="Paid on"><select v-model="paid.method" aria-label="Paid by"><option value="transfer">Bank transfer</option><option value="cash">Cash</option><option value="stripe">Card (Stripe)</option><option value="paystack">Paystack</option></select>
        <button class="btn secondary" :disabled="busy" @click="act('paid', 'Marked paid. Receipt emailed and booked.', { method: paid.method, paid_on: paid.on })">Mark as paid</button>
        <button v-if="data.raw_status === 'due'" class="btn secondary" :disabled="busy" @click="act('waive', 'Invoice waived.')">Waive</button>
        <button v-if="data.raw_status === 'draft'" class="btn secondary danger" :disabled="busy" @click="act('delete', '')">Delete draft</button></div>
    </div>
    <ClientInvoice :inv="data.invoice" brand="aidi" />
  </section>
</template>

<style scoped>
.wrap { max-width: 980px; margin: 0 auto; } .bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn.on { border-color: var(--c-navy); } .lnk { font-size: 13.5px; color: var(--c-muted); margin: 6px 0 12px; } .lnk a { color: var(--c-blue-deep); }
.side { display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px; } .muted { color: var(--c-muted); } .sm { font-size: 13px; }
input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.dates { display: flex; flex-direction: column; gap: 12px; margin: 0 0 16px; } .dates > div:first-child { display: flex; flex-direction: column; gap: 2px; } .dg { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; } .dg label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); }
.ok { color: var(--c-ok); } .error { color: var(--c-danger); } .danger { color: var(--c-danger); }
@media print { .noprint { display: none !important; } }
</style>
