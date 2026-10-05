<script setup lang="ts">
// How long services take. Nigerian companies also see the timing for business filings.
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { data } = await useFetch<{ country?: string; currency?: string }>('/api/company/profile', { key: 'company-profile' })
const ng = computed(() => /nigeria/i.test(data.value?.country ?? '') || data.value?.currency === 'NGN')
</script>
<template>
  <div class="sn" :class="{ compact }" role="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    <p><b>How long it takes:</b> setup takes 48 to 72 hours<template v-if="ng">, and business filings for Nigerian companies take about a week</template>. Our team will be in touch with every update.</p></div>
</template>
<style scoped>
.sn { display: flex; gap: 10px; align-items: flex-start; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 11px 14px; margin: 0 0 14px; } .sn svg { width: 18px; height: 18px; flex: none; margin-top: 1px; }
.sn p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--c-ink-soft); } .sn b { color: var(--c-blue-deep); font-weight: 600; } .compact { padding: 9px 12px; } .compact p { font-size: 12.5px; }
</style>
