<script setup lang="ts">
// Rental & Real Estate (by Aidi Haven): Overview, Properties, Money and Expenses for our Airbnb rentals and leases.
useHead({ title: 'Rental & Real Estate' })
const route = useRoute(), router = useRouter()
const TABS = [['overview', 'Overview'], ['properties', 'Properties'], ['money', 'Money'], ['expenses', 'Expenses']] as const
const tab = computed(() => (TABS.some((t) => t[0] === route.query.t) ? String(route.query.t) : 'overview'))
const go = (t: string) => router.replace({ query: { t } })
</script>
<template>
  <section class="rr">
    <p class="label">Wealth management</p>
    <div class="hd"><h1>Rental &amp; Real Estate</h1><a href="https://aidihaven.com" target="_blank" rel="noopener" class="by">by Aidi Haven ↗</a></div>
    <nav class="tabs" aria-label="Rentals"><button v-for="t in TABS" :key="t[0]" type="button" :class="{ on: tab === t[0] }" @click="go(t[0])">{{ t[1] }}</button></nav>
    <RentalsOverview v-if="tab === 'overview'" />
    <RentalsProperties v-else-if="tab === 'properties'" />
    <RentalsMoney v-else-if="tab === 'money'" />
    <RentalsExpenses v-else />
  </section>
</template>
<style scoped>
.hd { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .by { font-size: 13.5px; color: var(--c-blue-deep); text-decoration: none; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 14px 0 18px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; font-size: 14.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
</style>
