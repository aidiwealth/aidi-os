<script setup lang="ts">
// Small calendar block (month band + day), as on the Finvry client home. Overdue shows a soft red band.
const props = defineProps<{ date: string | null | undefined; tone?: string }>()
const d = computed(() => (props.date ? new Date(props.date.length === 10 ? props.date + 'T12:00:00' : props.date) : null))
</script>
<template>
  <span class="dbk" :class="tone"><em>{{ d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '—' }}</em><b>{{ d ? d.getDate() : '' }}</b></span>
</template>
<style scoped>
.dbk { width: 44px; flex: none; border: 1px solid var(--c-rule-strong); background: #fff; text-align: center; display: flex; flex-direction: column; line-height: 1.2; }
.dbk em { font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; padding: 3px 0; background: var(--c-paper-2); color: var(--c-muted); }
.dbk b { font-size: 16px; font-weight: 600; color: var(--c-ink); padding: 3px 0 4px; }
.dbk.red { border-color: #f0c4cc; } .dbk.red em { background: #fdecef; color: #b4234a; }
</style>
