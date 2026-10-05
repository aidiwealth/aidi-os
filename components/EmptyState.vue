<script setup lang="ts">
// A calm empty state: a soft icon in a circle, a title, a line of guidance and optional actions.
withDefaults(defineProps<{ icon?: string; title: string; text?: string; card?: boolean; compact?: boolean }>(), { icon: 'empty', text: '', card: false, compact: false })
</script>
<template>
  <div class="es" :class="{ card, compact }"><span class="ic"><AppIcon :name="icon" /></span><b>{{ title }}</b><p v-if="text">{{ text }}</p><div v-if="$slots.default" class="ac"><slot /></div></div>
</template>
<style scoped>
.es { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 24px; gap: 6px; } .es.card { background: #fff; border: 1px solid var(--c-rule); }
.ic { width: 64px; height: 64px; border-radius: 50%; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; margin-bottom: 10px; opacity: .9; } .ic :deep(svg) { width: 28px; height: 28px; }
b { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-ink); } p { color: var(--c-ink-soft); font-size: 14px; max-width: 460px; margin: 2px 0 0; line-height: 1.55; } .ac { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; justify-content: center; }
.ac :deep(a) { text-decoration: none; }
.compact { padding: 22px 16px; gap: 4px; } .compact .ic { width: 44px; height: 44px; margin-bottom: 6px; } .compact .ic :deep(svg) { width: 20px; height: 20px; } .compact b { font-size: 15px; font-weight: 600; font-family: var(--font-body); } .compact p { font-size: 13px; }
</style>
