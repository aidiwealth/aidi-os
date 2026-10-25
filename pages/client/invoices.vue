<script setup lang="ts">
// Invoices: for companies they live in Settings → Plan & billing; old links and emails land there.
useHead({ title: 'Billing' })
const { canPath } = useModuleAccess()
const loaded = !!useNuxtData<unknown[]>('modules').data.value?.length
const route = useRoute()
if (loaded && canPath('/settings')) await navigateTo({ path: '/settings', query: { ...route.query, s: 'plan', b: 'invoices' } }, { replace: true })
</script>
<template>
  <section>
    <ClientTabs />
    <BillingTabs />
    <InvoicesPanel />
  </section>
</template>
