<script setup lang="ts">
// Console: the investors and grants founders search under Fundraising → Find investors and grants.
useHead({ title: 'Finvry · Investors & grants' })
interface P { id: string; kind: 'investor' | 'grant'; name: string; type: string; regions: string[]; stages: string[]; sectors: string[]; min_usd: number | null; max_usd: number | null; website: string | null; description: string | null; how_to_apply: string | null; deadline: string | null; active: boolean; updated_at: string }
const { data, refresh } = await useFetch<{ items: P[]; stages: Record<string, string>; sectors: Record<string, string>; types: Record<string, string> }>('/api/platform/prospects')
const kind = ref<'' | 'investor' | 'grant'>('')
const list = computed(() => (data.value?.items ?? []).filter((p) => !kind.value || p.kind === kind.value))
const blank = () => ({ id: '', kind: 'investor' as 'investor' | 'grant', name: '', type: 'vc', regions: 'Global', stages: [] as string[], sectors: [] as string[], min_usd: '' as string | number, max_usd: '' as string | number, website: '', description: '', how_to_apply: '', deadline: '', active: true })
const f = reactive({ open: false, ...blank() }); const msg = ref(''); const busy = ref(false)
function edit(p?: P) { Object.assign(f, blank(), p ? { ...p, regions: p.regions.join(', '), min_usd: p.min_usd ?? '', max_usd: p.max_usd ?? '', website: p.website ?? '', description: p.description ?? '', how_to_apply: p.how_to_apply ?? '', deadline: p.deadline ?? '', stages: [...p.stages], sectors: [...p.sectors] } : {}, { open: true }); msg.value = '' }
const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.splice(arr.indexOf(v), 1) : arr.push(v))
async function save(del = false) {
  if (del && !window.confirm('Remove ' + f.name + ' from the list?')) return
  busy.value = true; msg.value = ''
  try { const { open, ...b } = f; void open; await $fetch('/api/platform/prospects', { method: 'POST', body: del ? { id: f.id, delete: true } : { ...b, id: b.id || undefined, regions: b.regions.split(',').map((x) => x.trim()).filter(Boolean) } }); f.open = false; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const money = (n: number | null) => (n == null ? '' : '$' + n.toLocaleString('en-US'))
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><p class="label">Finvry console</p><h1>Investors &amp; grants</h1><p class="lead">The list founders search under Fundraising → Find investors and grants. They are ranked by location, stage, sector and amount, so tag each entry carefully. Keep descriptions factual and link the official site.</p></div><button class="btn" @click="edit()">+ Add</button></div>
    <div class="fx-stats"><StatTile icon="users" tone="b" label="Investors" :value="data.items.filter((p) => p.kind === 'investor').length" clickable :on="kind === 'investor'" @click="kind = kind === 'investor' ? '' : 'investor'" /><StatTile icon="money" tone="g" label="Grants & programs" :value="data.items.filter((p) => p.kind === 'grant').length" clickable :on="kind === 'grant'" @click="kind = kind === 'grant' ? '' : 'grant'" /><StatTile icon="alert" tone="a" label="Hidden" :value="data.items.filter((p) => !p.active).length" note="not shown to founders" /></div>
    <div class="box"><table><thead><tr><th>Name</th><th>Type</th><th>Where</th><th>Stages</th><th>Cheque / award</th><th /></tr></thead>
      <tbody><tr v-for="p in list" :key="p.id" :class="{ off: !p.active }"><td><b>{{ p.name }}</b><span class="sub">{{ p.kind === 'grant' ? 'Grant' : 'Investor' }}<template v-if="p.website"> · <a :href="p.website" target="_blank" rel="noopener">{{ p.website.replace(/^https?:\/\//, '') }}</a></template></span></td>
        <td>{{ data.types[p.type] ?? p.type }}</td><td>{{ p.regions.join(', ') }}</td><td>{{ p.stages.map((s) => data!.stages[s] ?? s).join(', ') || 'Any' }}</td><td>{{ p.min_usd || p.max_usd ? money(p.min_usd) + (p.max_usd && p.max_usd !== p.min_usd ? ' – ' + money(p.max_usd) : '') : '—' }}</td>
        <td class="r"><button type="button" class="lk" @click="edit(p)">Edit</button></td></tr></tbody></table></div>
    <AppModal :open="f.open" :title="f.id ? 'Edit ' + f.name : 'Add an investor or grant'" wide @close="f.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Kind<select v-model="f.kind"><option value="investor">Investor</option><option value="grant">Grant or program</option></select></label><label class="label">Name<input v-model="f.name" maxlength="200"></label><label class="label">Type<select v-model="f.type"><option v-for="(l, k) in data.types" :key="k" :value="k">{{ l }}</option></select></label></div>
        <label class="label">Where they invest or who can apply<input v-model="f.regions" maxlength="500" placeholder="Countries or regions, comma-separated: Nigeria, Africa, United States, Global"></label>
        <div class="label">Stages<div class="chips"><button v-for="(l, k) in data.stages" :key="k" type="button" :class="{ on: f.stages.includes(String(k)) }" @click="tog(f.stages, String(k))">{{ l }}</button></div></div>
        <div class="label">Sectors (none = any)<div class="chips"><button v-for="(l, k) in data.sectors" :key="k" type="button" :class="{ on: f.sectors.includes(String(k)) }" @click="tog(f.sectors, String(k))">{{ l }}</button></div></div>
        <div class="g3"><label class="label">Smallest cheque or award (USD)<input v-model="f.min_usd" inputmode="decimal"></label><label class="label">Largest (USD)<input v-model="f.max_usd" inputmode="decimal"></label><label class="label">Deadline<input v-model="f.deadline" maxlength="120" placeholder="e.g. Opens each January"></label></div>
        <label class="label">Website<input v-model="f.website" maxlength="300" placeholder="https://"></label>
        <label class="label">Description<textarea v-model="f.description" rows="3" maxlength="2000" /></label>
        <label class="label">How to apply<input v-model="f.how_to_apply" maxlength="1000"></label>
        <label class="cb"><input v-model="f.active" type="checkbox"> Show to founders</label>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="f.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Remove</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" :disabled="busy || !f.name.trim()" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 820px; }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tr.off { opacity: .5; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .sub a { color: var(--c-blue-deep); text-decoration: none; } .r { text-align: right; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input, .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 5px 11px; font: inherit; font-size: 12.5px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.cb { display: flex; gap: 8px; align-items: center; font-size: 14px; } .cb input { width: auto; } .sp { flex: 1; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
</style>
