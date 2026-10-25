<script setup lang="ts">
// Perks: a tab on Banking for people who can open Banking; the page stays for everyone else.
useHead({ title: 'Perks' })
const { canPath } = useModuleAccess()
const loaded = !!useNuxtData<unknown[]>('modules').data.value?.length
if (loaded && canPath('/treasury')) await navigateTo({ path: '/treasury', query: { t: 'perks' } }, { replace: true })
</script>
<template>
  <PerksPanel />
</template>
