<script setup lang="ts">
// Invoices: also in Settings → Plan & billing.
useHead({ title: 'Billing' })
</script>
<template>
  <section>
    <ClientTabs />
    <BillingTabs />
    <InvoicesPanel />
  </section>
</template>
