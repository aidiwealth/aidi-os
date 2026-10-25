<script setup lang="ts">
// Wallet: for companies it lives in Settings → Plan & billing (old links, card top-up returns and emails land there).
useHead({ title: 'Wallet' })
const { data: me } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
const { canPath } = useModuleAccess()
const loaded = !!useNuxtData<unknown[]>('modules').data.value?.length
const route = useRoute()
if (loaded && me.value?.org?.kind === 'company' && canPath('/settings')) await navigateTo({ path: '/settings', query: { ...route.query, s: 'plan', b: 'wallet' } }, { replace: true })
</script>
<template>
  <section>
    <WalletPanel />
  </section>
</template>
