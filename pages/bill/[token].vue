<script setup lang="ts">
// A client opens their invoice: pay online (Stripe for USD, Paystack for NGN) or see the bank transfer details.
definePageMeta({ layout: 'public' })
const route = useRoute()
const token = route.params.token as string
const { data, error, refresh } = await useFetch<{ invoice: any; providers: string[]; workspace: { firm: string } }>('/api/public/bill/' + token, { key: 'pub-bill-' + token, query: { ref: route.query.ref } })
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Invoice ' + data.value.invoice.number + ' — ' + data.value.workspace.firm : 'Invoice'), meta: [{ name: 'robots', content: 'noindex' }] })
const busy = ref(false); const msg = ref('')
const justPaid = computed(() => route.query.paid === '1' || !!route.query.ref)
async function pay() {
  if (!data.value?.providers.length) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ url: string }>('/api/public/bill/' + token + '/start', { method: 'POST', body: { provider: data.value.providers[0] } }); window.location.href = r.url }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the payment page.'; busy.value = false }
}
onMounted(() => { if (justPaid.value && data.value?.invoice.status !== 'paid') setTimeout(() => refresh(), 4000) })
const doPrint = () => window.print()
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>This link is not valid</h1><p class="muted">Ask the sender for a new invoice link.</p></div>
    <template v-else-if="data">
      <div class="bar noprint">
        <p v-if="data.invoice.status === 'paid'" class="ok">Paid. Thank you; a receipt has been emailed.</p>
        <p v-else-if="justPaid" class="muted">Payment received by the processor; confirming…</p>
        <span v-else />
        <div class="row"><button class="btn secondary" @click="doPrint">Download PDF</button><button v-if="data.providers.length && data.invoice.status === 'sent'" class="btn" :disabled="busy" @click="pay">{{ busy ? 'Opening…' : 'Pay now' }}</button></div>
      </div>
      <p v-if="msg" class="error noprint" role="alert">{{ msg }}</p>
      <ClientInvoice :inv="data.invoice" :payable="data.providers.length > 0 && data.invoice.status === 'sent'" @pay="pay" />
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 860px; margin: 0 auto; } .bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; } .bar p { margin: 0; }
.row { display: flex; gap: 8px; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); font-weight: 500; } .error { color: var(--c-danger); }
@media print { .noprint { display: none !important; } }
</style>
