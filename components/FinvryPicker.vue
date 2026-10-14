<script setup lang="ts">
// Search Finvry workspaces (companies using Finvry) and pick one.
interface W { id: string; name: string; updates: number; owner_name: string | null; owner_email: string | null }
const emit = defineEmits<{ pick: [w: W] }>()
const q = ref(''); const list = ref<W[]>([]); const busy = ref(false); const fail = ref('')
let t: ReturnType<typeof setTimeout> | undefined
async function load() { busy.value = true; fail.value = ''; try { list.value = await $fetch<W[]>('/api/portfolio/finvry-workspaces', { query: { q: q.value } }) } catch (e) { list.value = []; fail.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not search Finvry. Try again.' } finally { busy.value = false } }
watch(q, () => { clearTimeout(t); t = setTimeout(load, 250) }); onMounted(load)
</script>
<template>
  <div class="fp"><input v-model="q" placeholder="Search Finvry companies by name" aria-label="Search Finvry companies">
    <div class="ol"><button v-for="w in list" :key="w.id" type="button" @click="emit('pick', w)"><b>{{ w.name }}</b><span>{{ [w.owner_name, w.owner_email].filter(Boolean).join(' · ') }}{{ w.updates ? ' · ' + w.updates + ' update' + (w.updates === 1 ? '' : 's') + ' sent' : '' }}</span></button>
      <p v-if="!list.length" class="mut">{{ busy ? 'Searching…' : fail || (q ? 'No Finvry companies match.' : 'No Finvry companies yet.') }}</p></div></div>
</template>
<style scoped>
.fp { display: flex; flex-direction: column; gap: 6px; } .fp input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.ol { border: 1px solid var(--c-rule); max-height: 220px; overflow-y: auto; } .ol button { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--c-rule); padding: 8px 10px; font: inherit; cursor: pointer; } .ol button:hover { background: var(--c-signal-soft); }
.ol b { font-size: 13.5px; font-weight: 500; } .ol span { font-size: 12px; color: var(--c-muted); } .mut { color: var(--c-muted); font-size: 13px; margin: 8px 10px; }
</style>
