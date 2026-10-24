<script setup lang="ts">
// Page through a table: "21–40 of 132" with previous and next.
const props = defineProps<{ total: number; size: number }>()
const page = defineModel<number>({ default: 0 })
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
watch(() => props.total, () => { if (page.value > pages.value - 1) page.value = 0 })
</script>
<template>
  <div v-if="total > size" class="pg"><span>{{ page * size + 1 }}–{{ Math.min(total, (page + 1) * size) }} of {{ total.toLocaleString('en-US') }}</span>
    <button type="button" :disabled="page === 0" aria-label="Previous page" @click="page--">‹</button><button type="button" :disabled="page >= pages - 1" aria-label="Next page" @click="page++">›</button></div>
</template>
<style scoped>
.pg { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 10px 14px; font-size: 12.5px; color: var(--c-muted); } .pg span { margin-right: 6px; }
.pg button { width: 28px; height: 28px; border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 15px; line-height: 1; cursor: pointer; color: var(--c-ink); } .pg button:disabled { opacity: .35; cursor: default; }
</style>
