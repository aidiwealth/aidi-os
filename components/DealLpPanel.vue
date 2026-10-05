<script setup lang="ts">
// Deal page: show or hide this deal in LP portals, and see LP interest.
const props = defineProps<{ pitchId: string }>()
const { data, refresh } = await useFetch<{ share: string; visible: boolean; interest: { name: string; email: string | null; note: string | null; at: string }[] }>(() => '/api/deals/' + props.pitchId + '/lp')
async function set(share: string) { await $fetch('/api/deals/' + props.pitchId + '/lp', { method: 'POST', body: { share } }); await refresh() }
</script>
<template>
  <div v-if="data" class="card lpp"><div class="h"><div><h3>LP deal flow</h3><p class="mut">{{ data.visible ? 'Visible to all LPs in their portal (Angel Fund and Fund I).' : 'Not visible to LPs.' }} Automatic shows a deal once it is screened and open.</p></div>
    <div class="seg"><button v-for="[k, l] in [['auto', 'Automatic'], ['show', 'Show'], ['hide', 'Hide']]" :key="k" :class="{ on: data.share === k }" @click="set(k)">{{ l }}</button></div></div>
    <div v-if="data.interest.length" class="int"><b>Interested LPs ({{ data.interest.length }})</b><div v-for="i in data.interest" :key="i.name + i.at" class="row"><span>{{ i.name }}<em v-if="i.email"> · {{ i.email }}</em></span><span class="mut">{{ i.at }}{{ i.note ? ' · ' + i.note : '' }}</span></div></div>
    <p v-else class="mut">No LP interest yet.</p></div>
</template>
<style scoped>
.lpp { margin: 14px 0; display: flex; flex-direction: column; gap: 10px; } .h { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } h3 { margin: 0 0 3px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.int { display: flex; flex-direction: column; gap: 6px; } .row { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; border-top: 1px solid var(--c-rule); padding-top: 6px; } .row em { font-style: normal; color: var(--c-muted); }
</style>
