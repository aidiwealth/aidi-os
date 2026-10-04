<script setup lang="ts">
// Fund vehicles (funds and SPVs): the workspace adds and names its own, and picks them on deals and portfolio companies.
interface V { id: string; name: string; kind: string; status: string; deals: number; companies: number; fund_setup: boolean }
const { data, refresh } = await useFetch<V[]>('/api/vc/vehicles', { key: 'vc-vehicles' })
const f = reactive({ id: '', name: '', kind: 'fund', status: 'active' })
const msg = ref(''); const ok = ref('')
function edit(v?: V) { Object.assign(f, v ? { id: v.id, name: v.name, kind: v.kind, status: v.status } : { id: '', name: '', kind: 'fund', status: 'active' }) }
async function save() {
  msg.value = ''; ok.value = ''
  try { await $fetch('/api/vc/vehicles', { method: 'POST', body: { ...f, id: f.id || undefined } }); ok.value = f.id ? 'Saved.' : 'Added ' + f.name + '.'; edit(); await refresh(); await refreshNuxtData() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
</script>
<template>
  <div>
    <h2>Fund vehicles</h2>
    <p class="muted small">Your funds and SPVs. Pick them on deals and portfolio companies so pipeline, portfolio and analytics can be viewed per fund.</p>
    <ul v-if="data?.length" class="vl"><li v-for="v in data" :key="v.id"><span><b>{{ v.name }}</b><em>{{ v.kind === 'spv' ? 'SPV' : 'Fund' }}{{ v.status === 'closed' ? ' · closed' : '' }} · {{ v.deals }} deal{{ v.deals === 1 ? '' : 's' }} · {{ v.companies }} compan{{ v.companies === 1 ? 'y' : 'ies' }}</em></span>
      <span class="act"><button type="button" class="link" @click="edit(v)">Edit</button><DeleteButton type="vehicle" :id="v.id" :name="v.name" link @deleted="refresh()" /></span></li></ul>
    <p v-else class="muted small">No fund vehicles yet.</p>
    <form class="vf" @submit.prevent="save">
      <input v-model="f.name" required maxlength="200" :placeholder="f.id ? 'Name' : 'e.g. Acme Ventures Fund I'" aria-label="Fund vehicle name">
      <select v-model="f.kind" aria-label="Type"><option value="fund">Fund</option><option value="spv">SPV</option></select>
      <select v-if="f.id" v-model="f.status" aria-label="Status"><option value="active">Active</option><option value="closed">Closed</option></select>
      <button class="btn sm" type="submit">{{ f.id ? 'Save' : 'Add' }}</button><button v-if="f.id" type="button" class="btn secondary sm" @click="edit()">Cancel</button>
    </form>
    <p v-if="ok" class="ok small">{{ ok }}</p><p v-if="msg" class="error small">{{ msg }}</p>
  </div>
</template>
<style scoped>
h2 { margin-bottom: 8px; } .muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0 0 10px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.vl { list-style: none; padding: 0; margin: 0 0 12px; } .vl li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); }
.vl span:first-child { display: flex; flex-direction: column; gap: 2px; } .vl b { font-weight: 500; } .vl em { font-style: normal; font-size: 12px; color: var(--c-muted); } .act { display: flex; gap: 10px; align-items: center; }
.vf { display: flex; gap: 8px; flex-wrap: wrap; } .vf input { flex: 1; min-width: 160px; } input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .btn.sm { padding: 6px 12px; font-size: 13px; }
</style>
