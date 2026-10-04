<script setup lang="ts">
useHead({ title: 'Order a service' })
const preset = String(useRoute().query.service ?? '')
</script>
<template>
  <section><ClientTabs /><h1>Order a service</h1><p class="lead">Done for you by the Aidi team. Listed prices are paid online by card or by bank transfer; quoted services are priced after we review your details.</p>
    <div class="card wrap"><OrderWizard :preset="preset" /></div></section>
</template>
<style scoped>.lead { color: var(--c-ink-soft); max-width: 760px; } .wrap { max-width: 860px; padding: 24px; }</style>
