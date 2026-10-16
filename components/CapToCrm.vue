<script setup lang="ts">
// Bring cap table holders into Fundraising: a pipeline (closed if they invested) and Contacts, on a list that gets
// investor updates. Founders and employees start unticked.
const props = defineProps<{ open: boolean; ct: string }>()
const emit = defineEmits<{ close: []; done: [] }>()
interface H { id: string; name: string; email: string | null; kind: string; invested: number; contact_id: string | null; in_pipelines: string | null }
interface O { holders: H[]; pipelines: { id: string; name: string; currency: string }[]; lists: { id: string; name: string }[] }
const o = ref<O | null>(null), busy = ref(false), msg = ref(''), res = ref<{ to_pipeline: number; closed: number; contacts: number; skipped: { name: string; reason: string }[]; pipeline_id: string | null } | null>(null)
const pick = ref<Record<string, boolean>>({}), email = ref<Record<string, string>>({})
const f = reactive({ toPipe: true, pipe: '', pipeName: 'Existing investors', closed: true, toContacts: true, list: '', listName: 'Shareholders' })
watch(() => props.open, async (v) => {
  if (!v) return
  res.value = null; msg.value = ''; o.value = null
  try {
    o.value = await $fetch<O>('/api/equity/to-crm', { query: { ct: props.ct } })
    pick.value = Object.fromEntries(o.value.holders.map((h) => [h.id, h.kind === 'investor' || h.kind === 'advisor' || h.kind === 'other']))
    email.value = Object.fromEntries(o.value.holders.map((h) => [h.id, h.email ?? '']))
    f.pipe = o.value.pipelines[0]?.id ?? 'new'; f.list = o.value.lists.find((l) => /share|investor/i.test(l.name))?.id ?? 'new'
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not load the holders.' }
}, { immediate: true })
const chosen = computed(() => o.value?.holders.filter((h) => pick.value[h.id]) ?? [])
const noEmail = computed(() => chosen.value.filter((h) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value[h.id] ?? '')).length)
const usd = (v: number) => (v ? '$' + Math.round(v).toLocaleString('en-US') : '—')
function all(v: boolean) { for (const h of o.value?.holders ?? []) pick.value[h.id] = v }
async function go() {
  busy.value = true; msg.value = ''
  try {
    res.value = await $fetch('/api/equity/to-crm', { method: 'POST', body: { ct: props.ct, holders: chosen.value.map((h) => ({ id: h.id, email: email.value[h.id] || undefined })),
      pipeline: f.toPipe ? { id: f.pipe, new_name: f.pipe === 'new' ? f.pipeName : undefined, closed: f.closed } : undefined,
      contacts: f.toContacts ? { list_id: f.list, new_list: f.list === 'new' ? f.listName : undefined } : undefined } })
    emit('done')
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add them.' } finally { busy.value = false }
}
</script>
<template>
  <AppModal :open="open" title="Add holders to Fundraising" wide @close="emit('close')">
    <div v-if="res" class="cc">
      <p class="ok">{{ [res.to_pipeline ? res.to_pipeline + ' added to the pipeline' + (res.closed ? ' (' + res.closed + ' marked closed)' : '') : '', res.contacts ? res.contacts + ' in Contacts' + (f.list ? ', on the updates list' : '') : ''].filter(Boolean).join(' · ') || 'Nothing new to add.' }}</p>
      <ul v-if="res.skipped.length" class="sk"><li v-for="s in res.skipped" :key="s.name + s.reason">{{ s.name }}: {{ s.reason }}</li></ul>
      <p class="mut"><NuxtLink v-if="res.pipeline_id" :to="'/fundraising/pipelines/' + res.pipeline_id">Open the pipeline</NuxtLink><template v-if="res.pipeline_id && res.contacts"> · </template><NuxtLink v-if="res.contacts" to="/contacts">Open Contacts</NuxtLink></p>
    </div>
    <div v-else-if="o" class="cc">
      <div class="hd"><b>Holders</b><span><button class="lk" type="button" @click="all(true)">All</button> · <button class="lk" type="button" @click="all(false)">None</button></span></div>
      <table class="t" data-nosearch><thead><tr><th /><th>Holder</th><th class="r">Invested</th><th>Email (for Contacts and updates)</th></tr></thead>
        <tbody><tr v-for="h in o.holders" :key="h.id"><td><input v-model="pick[h.id]" type="checkbox" :aria-label="'Include ' + h.name"></td>
          <td><b>{{ h.name }}</b><span class="sub">{{ h.kind[0]!.toUpperCase() + h.kind.slice(1) }}{{ h.contact_id ? ' · in Contacts' : '' }}{{ h.in_pipelines ? ' · in ' + h.in_pipelines : '' }}</span></td>
          <td class="r">{{ usd(h.invested) }}</td><td><input v-model="email[h.id]" type="email" maxlength="254" placeholder="name@fund.com" :aria-label="'Email for ' + h.name"></td></tr></tbody></table>
      <div class="opt"><label class="cb"><input v-model="f.toPipe" type="checkbox"> Add to a fundraising pipeline</label>
        <div v-if="f.toPipe" class="g2"><label class="label">Pipeline<select v-model="f.pipe"><option v-for="p in o.pipelines" :key="p.id" :value="p.id">{{ p.name }}</option><option value="new">+ New pipeline</option></select></label>
          <label v-if="f.pipe === 'new'" class="label">New pipeline name<input v-model="f.pipeName" maxlength="120"></label>
          <label class="cb w"><input v-model="f.closed" type="checkbox"> Mark those who invested as closed, with their amount and SAFE / note terms (they stay linked to the cap table, so they are not added twice)</label></div></div>
      <div class="opt"><label class="cb"><input v-model="f.toContacts" type="checkbox"> Add to Contacts so they receive investor updates</label>
        <div v-if="f.toContacts" class="g2"><label class="label">Updates list<select v-model="f.list"><option value="">No list</option><option v-for="l in o.lists" :key="l.id" :value="l.id">{{ l.name }}</option><option value="new">+ New list</option></select></label>
          <label v-if="f.list === 'new'" class="label">List name<input v-model="f.listName" maxlength="80"></label>
          <p v-if="noEmail" class="mut w">{{ noEmail }} chosen holder{{ noEmail === 1 ? ' has' : 's have' }} no email; add one above or they go into the pipeline only.</p></div></div>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <template #foot><button class="btn secondary" @click="emit('close')">{{ res ? 'Close' : 'Cancel' }}</button><button v-if="!res" class="btn" :disabled="busy || !chosen.length || (!f.toPipe && !f.toContacts)" @click="go">{{ busy ? 'Adding…' : 'Add ' + chosen.length + ' holder' + (chosen.length === 1 ? '' : 's') }}</button></template>
  </AppModal>
</template>
<style scoped>
.cc { display: flex; flex-direction: column; gap: 12px; } .hd { display: flex; justify-content: space-between; font-size: 13.5px; }
.t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12.5px; padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 7px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; } .t .r { text-align: right; }
.t input[type=email] { width: 100%; font: inherit; font-size: 13px; padding: 5px 7px; border: 1px solid var(--c-rule-strong); background: #fff; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.g2 .label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted) } .g2 select, .g2 input { height: 36px; padding: 0 10px; border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 14px; color: var(--c-ink) }
.opt { border-top: 1px solid var(--c-rule); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .w { grid-column: 1 / -1; }
.cb { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; } .cb input { margin-top: 3px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .ok { margin: 0; font-weight: 500; } .error { color: var(--c-danger); font-size: 13px; }
.sk { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
</style>
