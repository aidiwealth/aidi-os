<script setup lang="ts">
// A small "i" beside a term that needs explaining (WACC, beta, margin of safety…): the explanation shows on hover or
// keyboard focus, and screen readers read it as the button's description.
defineProps<{ text: string; label?: string }>()
</script>
<template>
  <button type="button" class="tip" :aria-label="label || 'What does this mean?'" :aria-description="text" :data-tip="text"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 7.2v4M8 4.9v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
</template>
<style scoped>
.tip { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; margin-left: 3px; border: 0; background: none; color: var(--c-muted); cursor: help; position: relative; vertical-align: -3px; font: inherit; }
.tip svg { width: 14px; height: 14px; } .tip:hover, .tip:focus-visible { color: var(--c-blue-deep); }
.tip:hover::after, .tip:focus-visible::after { content: attr(data-tip); position: absolute; left: 50%; top: 22px; transform: translateX(-50%); width: 260px; background: var(--c-navy); color: #fff; font-size: 12px; font-weight: 400; line-height: 1.45; padding: 8px 10px; text-align: left; z-index: 30; white-space: normal; letter-spacing: 0; }
</style>
