<script setup lang="ts">
// Pay an Aidi Wealth invoice online: Stripe (USD) or Paystack (NGN).
definePageMeta({ layout: 'public' })
const route = useRoute(); const token = route.params.token as string
const { data, refresh } = await useFetch<Record<string, any>>('/api/public/wpay/' + token, { key: 'wpay-' + token })
const msg = ref(''); const busy = ref(false)
onMounted(async () => { const ref0 = String(route.query.ref ?? route.query.reference ?? ''); if (ref0) { try { await $fetch('/api/public/wpay/' + token, { method: 'POST', body: { ref: ref0 } }); await refresh() } catch { /* webhook will confirm */ } } else if (route.query.paid) { setTimeout(() => refresh(), 3000) } })
async function pay() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ url: string }>('/api/public/wpay/' + token, { method: 'POST', body: {} }); window.location.href = r.url } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the payment page.'; busy.value = false } }
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v)
useHead({ title: 'Pay invoice · Aidi Wealth', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <div class="wrap"><div v-if="data" class="card pc"><p class="label">{{ data.entity ?? 'Aidi Wealth' }}</p><h1>{{ money(data.amount, data.currency) }}</h1><p class="mut">Invoice {{ data.number }} · {{ data.kind === 'subscription' ? 'Aidi Wealth subscription' : data.kind }}{{ data.period ? ' · ' + data.period : '' }}{{ data.client ? ' · ' + data.client : '' }}</p>
      <p v-if="data.status === 'paid'" class="okm">Paid. Thank you — your receipt has been emailed.</p><p v-else-if="route.query.paid" class="mut">Confirming your payment…</p>
      <button v-else-if="data.providers.length" class="btn" :disabled="busy" @click="pay">{{ busy ? 'Opening…' : 'Pay ' + money(data.amount, data.currency) + ' with ' + (data.currency === 'USD' ? 'card (Stripe)' : 'Paystack') }}</button>
      <p v-else class="mut">Online payment isn't available for this invoice. Please contact Aidi Wealth.</p><p v-if="msg" class="error">{{ msg }}</p></div></div>
</template>
<style scoped>
.wrap { max-width: 520px; margin: 0 auto; padding: 48px 18px; } .pc { display: flex; flex-direction: column; gap: 10px; } h1 { margin: 0; font-size: 34px; } .mut { color: var(--c-muted); margin: 0; } .okm { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); }
</style>
