<script setup lang="ts">
// A plain-English summary of an investing account agreement, with a link to the brokerage partner's full text.
import { AGREEMENTS } from '~/shared/wm-agreements'
definePageMeta({ layout: false })
const a = computed(() => AGREEMENTS[String(useRoute().params.code ?? '')] ?? null)
useHead({ title: () => (a.value?.title ?? 'Agreement') + ' · Aidi Wealth' })
</script>
<template>
  <div class="dn">
    <header class="top"><b>Aidi Wealth</b><a href="#" class="lk" @click.prevent="$router.back()">← Back</a></header>
    <article v-if="a" class="doc">
      <span class="ey">Summary · what you're agreeing to</span><h1>{{ a.title }}</h1>
      <p class="in">{{ a.intro }}</p>
      <h3>In short</h3><ul><li v-for="(p, i) in a.points" :key="i">{{ p }}</li></ul>
      <p class="note">This summary is to help you read the agreement; it doesn't replace it. The full agreement is what you accept.</p>
      <a :href="a.full" target="_blank" rel="noopener" class="btn">{{ a.fullLabel }}</a>
    </article>
    <p v-else class="pad">We couldn't find that agreement.</p>
  </div>
</template>
<style scoped>
.dn { min-height: 100vh; background: var(--c-paper-2); font-size: 15px; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; background: #fff; border-bottom: 1px solid var(--c-rule); } .top b { color: var(--c-navy); font-size: 16px; }
.lk { color: var(--c-blue-deep); text-decoration: none; font-size: 13px; } .pad { padding: 24px 28px; }
.doc { max-width: 720px; margin: 24px auto; background: #fff; border: 1px solid var(--c-rule); padding: 32px 40px; line-height: 1.6; color: var(--c-ink); display: flex; flex-direction: column; gap: 10px; }
.ey { font-size: 12.5px; color: var(--c-muted); } h1 { font-size: 24px; color: var(--c-navy); margin: 0; font-weight: 600; } .in { margin: 0; }
h3 { font-size: 16px; color: var(--c-navy); margin: 10px 0 0; } ul { margin: 0; padding-left: 20px; } li { margin: 0 0 8px; }
.note { margin: 6px 0; font-size: 13px; color: var(--c-muted); background: var(--c-paper-2); padding: 10px 12px; }
.btn { align-self: flex-start; background: var(--c-navy); color: #fff; padding: 11px 16px; text-decoration: none; font-weight: 600; font-size: 14px; }
@media (max-width: 640px) { .top { padding: 12px 16px; } .doc { margin: 0; border: 0; padding: 20px 16px; } }
</style>
