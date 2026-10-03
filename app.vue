<script setup lang="ts">
const brand = useBrand()
useHead({
  titleTemplate: (t?: string) => (t ? t + ' — ' + brand.name : brand.name),
  link: [{ rel: 'icon', type: 'image/svg+xml', href: brand.key === 'finvry' ? '/favicon-finvry.svg' : '/favicon-aidi.svg' }],
  meta: [{ name: 'theme-color', content: '#0c1a2e' }]
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
