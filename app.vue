<script setup lang="ts">
const brand = useBrand()
useHead({ titleTemplate: (t?: string) => (t ? t + ' — ' + brand.name : brand.name) })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
