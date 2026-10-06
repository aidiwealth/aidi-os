<script setup lang="ts">
// Founder: who reacted to the update, and their notes.
const props = defineProps<{ updateId: string }>()
const E: Record<string, string> = { up: '👍', love: '❤️', party: '🎉', rocket: '🚀', clap: '👏', think: '🤔' }
const { data } = await useFetch<{ reactions: { emoji: string; name: string; email: string; created_at: string }[]; notes: { body: string; name: string; email: string; created_at: string }[] }>(() => '/api/updates/' + props.updateId + '/reactions')
const counts = computed(() => Object.entries(E).map(([k, e]) => ({ k, e, n: data.value?.reactions.filter((r) => r.emoji === k).length ?? 0, who: data.value?.reactions.filter((r) => r.emoji === k).map((r) => r.name).join(', ') ?? '' })).filter((x) => x.n))
</script>
<template>
  <div v-if="data && (data.reactions.length || data.notes.length)" class="card rx"><h3>Reactions</h3>
    <div class="cn"><span v-for="c in counts" :key="c.k" :title="c.who">{{ c.e }} {{ c.n }}</span></div>
    <div v-for="(n, i) in data.notes" :key="i" class="nt"><b>{{ n.name }}</b><em>{{ new Date(n.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</em><p>{{ n.body }}</p></div></div>
</template>
<style scoped>
.rx h3 { margin: 0 0 8px; } .cn { display: flex; gap: 8px; flex-wrap: wrap; } .cn span { background: var(--c-paper-2); padding: 4px 10px; border-radius: 14px; font-size: 14px; cursor: default; }
.nt { border-top: 1px solid var(--c-rule); margin-top: 10px; padding-top: 8px; font-size: 13.5px; } .nt em { font-style: normal; color: var(--c-muted); font-size: 12px; margin-left: 6px; } .nt p { margin: 4px 0 0; white-space: pre-wrap; }
</style>
