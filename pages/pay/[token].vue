<script setup lang="ts">
definePageMeta({ layout: 'public' })
const route = useRoute()
const token = route.params.token as string
interface D { number: string; customer: string; amount: string; currency: string; issue_date: string; due_date: string; lines: { description: string; amount: number }[]; status: string; issuer: string; providers: ('stripe' | 'paystack')[]; workspace: { name: string } }
const q = route.query.ref ? '?ref=' + encodeURIComponent(String(route.query.ref)) : ''
const { data, error, refresh } = await useFetch<D>('/api/public/pay/' + token + q, { key: 'pub-pay-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value ? 'Pay invoice ' + data.value.number : 'Pay invoice'), meta: [{ name: 'robots', content: 'noindex' }] })
const returned = route.query.paid === '1' || !!route.query.ref
const busy = ref(''); const msg = ref('')
onMounted(() => { if (returned && data.value?.status !== 'paid') { let n = 0; const t = setInterval(async () => { await refresh(); if (data.value?.status === 'paid' || ++n > 10) clearInterval(t) }, 3000) } })
async function pay(provider: 'stripe' | 'paystack') {
  busy.value = provider; msg.value = ''
  try { const r = await $fetch<{ url: string }>('/api/public/pay/' + token + '/start', { method: 'POST', body: { provider } }); window.location.href = r.url }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not start the payment. Try again.'; busy.value = '' }
}
const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.currency ?? 'USD' }).format(Number(v))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card center"><h1>This payment link is not valid</h1><p>Check you opened the full link from the email, or ask the team that sent it.</p></div>
    <template v-else-if="data">
      <p class="label">Invoice {{ data.number }} · {{ data.customer }}</p>
      <h1>{{ money(data.amount) }}</h1>
      <div v-if="data.status === 'paid'" class="card done" role="status"><h2>Paid. Thank you.</h2><p>A receipt has been emailed to you.</p></div>
      <div v-else-if="data.status === 'void'" class="card"><p>This invoice has been cancelled. There is nothing to pay.</p></div>
      <template v-else>
        <p class="due" :class="{ late: data.status === 'overdue' }">{{ data.status === 'overdue' ? 'Overdue since' : 'Due' }} {{ day(data.due_date) }}</p>
        <p v-if="returned" class="muted" role="status">Checking your payment…</p>
        <div class="card">
          <ul class="lines"><li v-for="(l, i) in data.lines" :key="i"><span>{{ l.description }}</span><b>{{ money(l.amount) }}</b></li><li class="tot"><span>Total</span><b>{{ money(data.amount) }}</b></li></ul>
          <div v-if="data.providers.length" class="pay">
            <button v-if="data.providers.includes('stripe')" class="btn" type="button" :disabled="!!busy" @click="pay('stripe')">{{ busy === 'stripe' ? 'Opening…' : 'Pay by card' }}</button>
            <button v-if="data.providers.includes('paystack')" class="btn" :class="{ secondary: data.providers.includes('stripe') }" type="button" :disabled="!!busy" @click="pay('paystack')">{{ busy === 'paystack' ? 'Opening…' : data.currency === 'NGN' ? 'Pay with card or bank (Paystack)' : 'Pay with Paystack' }}</button>
            <p class="muted small">You will pay on {{ data.providers.length > 1 ? 'Stripe or Paystack' : data.providers[0] === 'stripe' ? 'Stripe' : 'Paystack' }}'s secure page. Your card can be saved there for future renewals.</p>
          </div>
          <p v-else class="muted">Online payment is not available for this invoice. Please pay using the instructions on the invoice email.</p>
          <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        </div>
        <p class="muted small">Issued by {{ data.issuer }} on {{ day(data.issue_date) }}.</p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 560px; margin: 0 auto; } h1 { font-size: 44px; margin: 4px 0 6px; }
.due { color: var(--c-muted); margin: 0 0 16px; } .due.late { color: var(--c-danger); }
.lines { list-style: none; padding: 0; margin: 0 0 18px; } .lines li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .lines b { font-weight: 500; } .lines .tot { border-bottom: 0; font-weight: 600; color: var(--c-navy); }
.pay { display: flex; flex-direction: column; gap: 10px; } .pay .btn { justify-content: center; }
.done { border-left: 4px solid var(--c-ok); } .done h2 { margin-bottom: 4px; } .center { text-align: center; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 8px 0 0; } .error { color: var(--c-danger); margin-top: 10px; }
</style>
