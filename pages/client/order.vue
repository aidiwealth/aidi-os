<script setup lang="ts">
useHead({ title: 'Order a service' })
const preset = String(useRoute().query.service ?? '')
</script>
<template>
  <section><ClientTabs /><div class="oh"><div><h1>Order a service</h1><p class="lead">Done for you by the Aidi team. Listed prices are paid online; quoted services are priced after we review your details.</p></div></div><ServiceNotice />
    <div class="card wrap"><OrderWizard :preset="preset" /></div></section>
</template>
<style scoped>.oh h1 { margin: 0 0 4px; } .lead { color: var(--c-ink-soft); max-width: 760px; margin: 0 0 14px; } .wrap { max-width: 1040px; padding: 26px 28px; }</style>
