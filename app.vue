<script setup lang="ts">
const fvIcons = useBrand()
useHead(() => ({ link: fvIcons.key === 'finvry' ? [{ rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand/finvry-favicon-32.png' }, { rel: 'apple-touch-icon', href: '/brand/finvry-apple-touch-icon.png' }] : [] }))
const brand = useBrand()
useHead({
  titleTemplate: (t?: string) => (t ? t + ' — ' + brand.name : brand.name),
  link: brand.key === 'finvry'
    ? [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon-finvry.svg' }]
    : [{ rel: 'icon', type: 'image/svg+xml', href: '/aidi-favicon.svg' }, { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/aidi-favicon-32x32.png' },
       { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/aidi-favicon-16x16.png' }, { rel: 'icon', type: 'image/x-icon', href: '/aidi-favicon.ico' },
       { rel: 'apple-touch-icon', sizes: '180x180', href: '/aidi-favicon-180x180.png' }],
  meta: [{ name: 'theme-color', content: '#0c1a2e' }]
})
</script>

<template>
  <NuxtLoadingIndicator color="#5fa8d3" :height="2" :throttle="150" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <CookieConsent v-if="brand.key === 'finvry'" />
</template>
