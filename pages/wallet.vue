<script setup lang="ts">
// Wallet: also in Settings → Plan & billing.
useHead({ title: 'Wallet' })
const { data: me } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
</script>
<template>
  <section>
    <template v-if="me?.org?.kind === 'company'"><ClientTabs /><BillingTabs /></template>
    <WalletPanel />
  </section>
</template>
