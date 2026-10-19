<script setup lang="ts">
// Put these figures in front of investors: add them to the data room as a PDF (a short report of the sections given),
// or open the investor page or an investor update, where every metric (retention, customers, KPIs, sectors) can be
// picked.
const props = withDefaults(defineProps<{ sections: string[]; what: string }>(), {})
const { data: mods } = useNuxtData<{ code: string; usable?: boolean }[]>('modules')
const can = (c: string) => !!mods.value?.find((m) => m.code === c && m.usable)
const busy = ref(false); const msg = ref(''); const ok = ref('')
async function toRoom() {
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ name: string }>('/api/financials/mgmt-report', { method: 'POST', body: { sections: props.sections, deliver: 'room', format: 'pdf', remember: false } }); ok.value = r.name + ' added to the data room (Financials folder).' }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add it to the data room.' } finally { busy.value = false }
}
</script>

<template>
  <div class="st">
    <span class="t">Share {{ what }} with investors</span>
    <button v-if="can('fin_report') && can('fundraising')" type="button" class="lk" :disabled="busy" @click="toRoom">{{ busy ? 'Adding…' : 'Add to data room' }}</button>
    <NuxtLink v-if="can('updates')" to="/updates" class="lk">Add to an investor update</NuxtLink>
    <NuxtLink to="/investor-page" class="lk">Show on investor page</NuxtLink>
    <span v-if="ok" class="ok">{{ ok }}</span><span v-if="msg" class="er">{{ msg }}</span>
  </div>
</template>

<style scoped>
.st { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; font-size: 13px; padding: 10px 14px; border: 1px solid var(--c-rule); background: #fff; margin: 0 0 14px; }
.t { color: var(--c-muted); margin-right: 4px; }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.ok { color: var(--c-blue-deep); width: 100%; font-size: 12.5px; } .er { color: var(--c-danger); width: 100%; font-size: 12.5px; }
</style>
