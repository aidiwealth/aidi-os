<script setup lang="ts">
// "Start from the Finvry template": the same panel as Financials, forecasts and customer revenue use, with the
// download beside it.
defineProps<{ title: string; text: string }>()
const emit = defineEmits<{ download: [] }>()
</script>
<template>
  <div class="tpl"><div><b>{{ title }}</b><span class="mut">{{ text }}</span></div><button type="button" class="btn secondary sm" @click="emit('download')">Download template</button></div>
</template>
<style scoped>
.tpl { display: flex; gap: 14px; align-items: center; justify-content: space-between; border: 1px solid #d9e2ef; background: #f5f7fb; padding: 12px 14px; }
.tpl b { display: block; font-weight: 500; margin-bottom: 2px; color: var(--c-ink); } .mut { font-size: 13px; color: var(--c-muted); line-height: 1.5; } .btn { white-space: nowrap; }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } @media (max-width: 560px) { .tpl { flex-direction: column; align-items: flex-start; } }
</style>
