<script setup lang="ts">
// Contacts: everyone you send updates and decks to, in lists, with custom properties and subscribe status.
useHead({ title: 'Contacts' })
interface C { id: string; name: string; email: string; firm: string | null; title: string | null; subscribed: boolean; created_at: string; lists: { id: string; name: string }[]; last_activity: string | null }
interface Fd { id: string; key: string; label: string; type: string; options: string[] }
// Search, list and page live in the address, so a refresh or the back button keeps them and clearing them shows everything.
const route = useRoute(), router = useRouter()
const q = ref(String(route.query.q ?? '')); const list = ref(String(route.query.list ?? '')); const page = ref(Number(route.query.page ?? 1) || 1); const size = ref(50)
const qq = ref(q.value); let qt: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => { clearTimeout(qt); qt = setTimeout(() => { qq.value = v; page.value = 1 }, 300) })
watch(list, () => { page.value = 1 })
const { data, refresh } = await useFetch<{ contacts: C[]; total: number; all: number; page: number; pages: number; size: number; lists: { id: string; name: string; n: number }[]; fields: Fd[] }>('/api/crm/contacts', { query: { q: qq, list, page, size } })
function clearSearch() { q.value = ''; qq.value = ''; page.value = 1 }
const { data: meK } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
const isVc = computed(() => !!meK.value?.org && meK.value.org.kind !== 'company')
async function importLps() { msg.value = ''; try { const r = await $fetch<{ total: number; added: number }>('/api/crm/contacts/import-lps', { method: 'POST' }); ok.value = r.total + ' LPs in the "LPs" list (' + r.added + ' new).'; await refresh() } catch (e) { msg.value = err(e) } }
// Ticking the header box selects the contacts on this page (what you can see); a banner then offers every match.
const sel = ref<string[]>([]); const selAll = ref(false)
const all = computed({ get: () => !!data.value?.contacts.length && data.value.contacts.every((c) => sel.value.includes(c.id)), set: (v: boolean) => { selAll.value = false; sel.value = v ? (data.value?.contacts ?? []).map((c) => c.id) : [] } })
const selCount = computed(() => (selAll.value ? data.value?.total ?? 0 : sel.value.length))
watch([qq, list, page, size], () => { sel.value = []; selAll.value = false; router.replace({ query: { ...(qq.value ? { q: qq.value } : {}), ...(list.value ? { list: list.value } : {}), ...(page.value > 1 ? { page: String(page.value) } : {}) } }) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const nc = reactive({ open: false, name: '', email: '', firm: '', title: '', list_ids: [] as string[] })
async function addContact() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/crm/contacts', { method: 'POST', body: nc }); nc.open = false; await navigateTo('/contacts/' + r.id) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const im = reactive({ open: false, lines: '', list_id: '' })
const pz = reactive({ url: '', busy: false, note: '' })
async function parseFile(ev: Event) { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; pz.busy = true; pz.note = ''; msg.value = ''; const fd = new FormData(); fd.append('file', f)
  try { const r = await $fetch<{ lines: string; count: number }>('/api/crm/contacts/parse', { method: 'POST', body: fd }); im.lines = r.lines; pz.note = r.count ? r.count + ' contacts found. Check them, then Import.' : 'No email addresses found in that file.' } catch (e) { msg.value = err(e) } finally { pz.busy = false } }
async function parseSheet() { pz.busy = true; pz.note = ''; msg.value = ''
  try { const r = await $fetch<{ lines: string; count: number }>('/api/crm/contacts/parse', { method: 'POST', body: { url: pz.url } }); im.lines = r.lines; pz.note = r.count ? r.count + ' contacts found in the sheet. Check them, then Import.' : 'No email addresses found in that sheet.' } catch (e) { msg.value = err(e) } finally { pz.busy = false } }
async function doImport() {
  busy.value = true; msg.value = ''
  try {
    const r = await $fetch<{ added: number; updated: number }>('/api/crm/contacts/import', { method: 'POST', body: { lines: im.lines, list_id: im.list_id || undefined } })
    // Show what was imported: the list it went into (or everything), first page, no search.
    const target = im.list_id
    im.open = false; im.lines = ''; im.list_id = ''; pz.note = ''
    clearSearch(); list.value = target; page.value = 1
    ok.value = r.added + ' added' + (r.updated ? ', ' + r.updated + ' already there' : '') + '.'
    await nextTick(); await refresh()
  } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const nl = reactive({ open: false, name: '' })
async function addList() { try { const r = await $fetch<{ id: string }>('/api/crm/lists', { method: 'POST', body: { name: nl.name } }); nl.open = false; nl.name = ''; await refresh(); if (sel.value.length) await bulk('add_list', r.id) } catch (e) { msg.value = err(e) } }
async function bulk(action: string, list_id?: string) {
  msg.value = ''; ok.value = ''
  if (action === 'delete' && !confirm('Delete ' + selCount.value + ' contact' + (selCount.value === 1 ? '' : 's') + '? This cannot be undone.')) return
  try {
    const r = await $fetch<{ count: number }>('/api/crm/contacts/bulk', { method: 'POST', body: selAll.value ? { match: { q: qq.value, list: list.value }, action, list_id } : { ids: sel.value, action, list_id } })
    const names: Record<string, string> = { add_list: 'added to the list', remove_list: 'removed from this list', subscribe: 'subscribed', unsubscribe: 'unsubscribed', delete: 'deleted' }
    ok.value = r.count + ' contact' + (r.count === 1 ? '' : 's') + ' ' + names[action] + '.'
    sel.value = []; selAll.value = false
    await refresh()
  } catch (e) { msg.value = err(e) }
}
// Add the selected contacts (or everything matching) to a fundraising pipeline as investors.
const { data: pipes } = await useLazyFetch<{ id: string; name: string; status: string }[]>('/api/crm/pipelines', { server: false, default: () => [] })
const toPipe = ref('')
watch(toPipe, async (v) => {
  if (!v) return
  msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ added: number; skipped: number }>('/api/crm/deals/from-contacts', { method: 'POST', body: selAll.value ? { pipeline_id: v, match: { q: qq.value, list: list.value } } : { pipeline_id: v, ids: sel.value } })
    ok.value = r.added + ' added to ' + (pipes.value?.find((p) => p.id === v)?.name ?? 'the pipeline') + (r.skipped ? ' (' + r.skipped + ' already there)' : '') + '.'
    sel.value = []; selAll.value = false
  } catch (e) { msg.value = err(e) } finally { nextTick(() => (toPipe.value = '')) }
})
const toList = ref('')
watch(toList, (v) => { if (v === '__new') { nl.open = true } else if (v) bulk('add_list', v); nextTick(() => (toList.value = '')) })
const fl = reactive({ open: false, fields: [] as { label: string; type: string; options: string }[] })
function openFields() { fl.fields = (data.value?.fields ?? []).map((f) => ({ label: f.label, type: f.type, options: f.options.join(', ') })); fl.open = true }
async function saveFields() { try { await $fetch('/api/crm/fields', { method: 'POST', body: { fields: fl.fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label, type: f.type, options: f.type === 'select' ? f.options.split(',').map((s) => s.trim()).filter(Boolean) : [] })) } }); fl.open = false; await refresh() } catch (e) { msg.value = err(e) } }
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><h1>Contacts</h1><div class="row"><span class="sq"><input v-model="q" class="search" placeholder="Search name, email, firm or title" aria-label="Search"><button v-if="q" type="button" class="clr" aria-label="Clear search" @click="clearSearch">×</button></span><button class="btn secondary" @click="openFields">Custom properties</button><button v-if="isVc" class="btn secondary" @click="importLps">Import LPs</button><button class="btn secondary" @click="im.open = true">Import</button><button class="btn" @click="nc.open = true">New contact</button></div></div>
    <div class="lists"><button :class="{ on: !list }" @click="list = ''">All contacts <em>{{ data.all }}</em></button><button v-for="l in data.lists" :key="l.id" :class="{ on: list === l.id }" @click="list = l.id">{{ l.name }} <em>{{ l.n }}</em></button><button class="add" @click="nl.open = true">+ New list</button><DeleteButton v-if="list" type="crm_list" :id="list" :name="'the list ' + (data.lists.find((l) => l.id === list)?.name ?? '') + ' (contacts are kept)'" link @deleted="list = ''; refresh()" /></div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <p v-if="qq || list" class="flt">{{ data.total }} contact{{ data.total === 1 ? '' : 's' }}<template v-if="qq"> matching “{{ qq }}”</template><template v-if="list"> in {{ data.lists.find((l) => l.id === list)?.name ?? 'this list' }}</template>. <button class="lk" @click="clearSearch(); list = ''">Show all contacts</button></p>
    <div v-if="sel.length" class="bulk"><b>{{ selCount }} selected</b><button v-if="all && !selAll && data.total > data.contacts.length" class="lk" @click="selAll = true">Select all {{ data.total }}{{ qq || list ? ' matching' : '' }}</button><button v-else-if="selAll" class="lk" @click="selAll = false; sel = []">Clear selection</button><select v-model="toList"><option value="">Add to list…</option><option v-for="l in data.lists" :key="l.id" :value="l.id">{{ l.name }}</option><option value="__new">+ New list</option></select>
      <select v-if="pipes?.length" v-model="toPipe" aria-label="Add to a fundraising pipeline"><option value="">Add to pipeline…</option><option v-for="p in pipes" :key="p.id" :value="p.id">{{ p.name }}{{ p.status === 'closed' ? ' (closed)' : '' }}</option></select>
      <button v-if="list" class="btn secondary sm" @click="bulk('remove_list', list)">Remove from this list</button><button class="btn secondary sm" @click="bulk('unsubscribe')">Unsubscribe</button><button class="btn secondary sm" @click="bulk('subscribe')">Subscribe</button><button class="btn secondary sm danger" @click="bulk('delete')">Delete</button></div>
    <div class="box"><table v-if="data.contacts.length" data-nosearch><thead><tr><th class="ck"><input v-model="all" type="checkbox" aria-label="Select all"></th><th>Contact</th><th>Firm</th><th>Lists</th><th>Last activity</th><th>Status</th></tr></thead>
      <tbody><tr v-for="c in data.contacts" :key="c.id"><td class="ck"><input v-model="sel" type="checkbox" :value="c.id" aria-label="Select"></td>
        <td><NuxtLink :to="'/contacts/' + c.id" class="ct"><span class="av">{{ initials(c.name) }}</span><span><b>{{ c.name }}</b><em>{{ c.email }}</em></span></NuxtLink></td>
        <td>{{ c.firm ?? '—' }}<span v-if="c.title" class="mut"> · {{ c.title }}</span></td><td><span v-for="l in c.lists" :key="l.id" class="chip">{{ l.name }}</span><span v-if="!c.lists.length" class="mut">—</span></td>
        <td class="mut">{{ c.last_activity ? day(c.last_activity) : '—' }}</td><td><span class="st" :class="{ off: !c.subscribed }">{{ c.subscribed ? 'Subscribed' : 'Unsubscribed' }}</span></td></tr></tbody></table>
      <EmptyState v-else icon="contacts" :title="qq || list ? 'No contacts match' : 'No contacts yet'" :text="qq || list ? 'Try another search or list.' : 'Import your investor list, or add contacts one by one. People who open your data room links are added for you.'"><button v-if="qq || list" class="btn secondary" @click="clearSearch(); list = ''">Show all contacts</button><template v-else><button class="btn" @click="im.open = true">Import contacts</button><button class="btn secondary" @click="nc.open = true">Add a contact</button></template></EmptyState></div>
    <div v-if="data.total > 25" class="pg"><span>{{ (data.page - 1) * data.size + 1 }}–{{ Math.min(data.total, data.page * data.size) }} of {{ data.total }}</span>
      <label>Show <select v-model.number="size" @change="page = 1"><option v-for="n in [25, 50, 100, 200]" :key="n" :value="n">{{ n }}</option></select></label>
      <button :disabled="data.page <= 1" @click="page = data.page - 1">‹ Prev</button><span class="pp">Page {{ data.page }} of {{ data.pages }}</span><button :disabled="data.page >= data.pages" @click="page = data.page + 1">Next ›</button></div>

    <AppModal :open="nc.open" title="New contact" @close="nc.open = false">
      <form id="ncf" class="frm g2" @submit.prevent="addContact"><label class="label">Name<input v-model="nc.name" required maxlength="200"></label><label class="label">Email<input v-model="nc.email" type="email" required maxlength="254"></label>
        <label class="label">Firm<input v-model="nc.firm" maxlength="200"></label><label class="label">Title<input v-model="nc.title" maxlength="120"></label>
        <div class="w"><span class="lb">Lists</span><div class="chips"><label v-for="l in data.lists" :key="l.id" class="cb"><input v-model="nc.list_ids" type="checkbox" :value="l.id"> {{ l.name }}</label></div></div></form>
      <template #foot><button class="btn secondary" @click="nc.open = false">Cancel</button><button class="btn" type="submit" form="ncf" :disabled="busy">Add contact</button></template>
    </AppModal>
    <AppModal :open="im.open" title="Import contacts" @close="im.open = false">
      <div class="frm"><DropZone accept=".csv,.tsv,.txt,.xlsx" :label="pz.busy ? 'Reading…' : 'Drop a CSV or Excel file'" hint="Columns like Name, Email, Company and Title are recognised · or click to choose" @change="parseFile" />
        <div class="gs"><input v-model="pz.url" placeholder="Or paste a Google Sheets link" aria-label="Google Sheets link"><button type="button" class="btn secondary" :disabled="!pz.url.trim() || pz.busy" @click="parseSheet">Load sheet</button></div>
        <p v-if="pz.note" class="ok">{{ pz.note }}</p>
        <p class="mut">Review below, one per line: <code>Name &lt;email&gt;</code>, or <code>Name, email, firm, title</code>. You can also paste straight from a spreadsheet. Existing contacts are kept.</p><textarea v-model="im.lines" rows="8" placeholder="Amara Obi, amara@vc.africa, Ventures Africa, Partner" />
        <label class="label">Add them to a list<select v-model="im.list_id"><option value="">No list</option><option v-for="l in data.lists" :key="l.id" :value="l.id">{{ l.name }}</option></select></label></div>
      <template #foot><button class="btn secondary" @click="im.open = false">Cancel</button><button class="btn" :disabled="busy || !im.lines.trim()" @click="doImport">Import</button></template>
    </AppModal>
    <AppModal :open="nl.open" title="New list" @close="nl.open = false">
      <form id="nlf" class="frm" @submit.prevent="addList"><label class="label">List name<input v-model="nl.name" required maxlength="80" placeholder="e.g. Board, Angels, Series A leads"></label><p v-if="sel.length" class="mut">The {{ sel.length }} selected contact{{ sel.length === 1 ? '' : 's' }} will be added.</p></form>
      <template #foot><button class="btn secondary" @click="nl.open = false">Cancel</button><button class="btn" type="submit" form="nlf">Create list</button></template>
    </AppModal>
    <AppModal :open="fl.open" title="Custom properties" @close="fl.open = false">
      <div class="frm"><p class="mut">Extra details you track for each contact, like cheque size or region.</p>
        <div v-for="(f, i) in fl.fields" :key="i" class="fr"><input v-model="f.label" placeholder="Property name" maxlength="60"><select v-model="f.type"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="url">Link</option><option value="select">Choice</option></select><input v-if="f.type === 'select'" v-model="f.options" placeholder="Choices, comma separated"><button type="button" class="x" aria-label="Remove" @click="fl.fields.splice(i, 1)">×</button></div>
        <button type="button" class="btn secondary sm" @click="fl.fields.push({ label: '', type: 'text', options: '' })">+ Add property</button></div>
      <template #foot><button class="btn secondary" @click="fl.open = false">Cancel</button><button class="btn" @click="saveFields">Save</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .row { display: flex; gap: 8px; flex-wrap: wrap; } .search { min-width: 240px; }
.lists { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0; } .lists button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .lists button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .lists em { font-style: normal; opacity: .65; margin-left: 4px; } .lists .add { border-style: dashed; color: var(--c-blue-deep); }
.bulk { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 8px 12px; margin-bottom: 8px; flex-wrap: wrap; } .btn.sm { padding: 5px 10px; font-size: 12.5px; } .danger { color: var(--c-danger); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: middle; } .ck { width: 34px; }
.ct { display: flex; gap: 10px; align-items: center; text-decoration: none; color: var(--c-ink); } .ct span:last-child { display: flex; flex-direction: column; } .ct em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.av { width: 34px; height: 34px; border-radius: 50%; background: #ece9fb; color: #4b3fb5; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
.chip { display: inline-block; font-size: 12px; background: var(--c-paper-2); padding: 2px 8px; margin: 0 4px 2px 0; } .st { font-size: 12px; padding: 3px 9px; background: var(--c-paper-2); color: var(--c-ink); } .st.off { background: var(--c-paper-2); color: var(--c-muted); }
.none { padding: 32px; text-align: center; } .none p { color: var(--c-ink-soft); max-width: 460px; margin: 6px auto 14px; } .mut { color: var(--c-muted); font-size: 13px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; } .lb { font-size: 13px; color: var(--c-ink-soft); }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; } .cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .cb input { width: auto; }
.fr { display: flex; gap: 6px; } .fr input:first-child { flex: 1; } .x { background: none; border: 0; font-size: 20px; color: var(--c-muted); cursor: pointer; } code { font-size: 12px; background: var(--c-paper-2); padding: 1px 5px; } .error { color: var(--c-danger); } .ok { color: var(--c-ink); }
.gs { display: flex; gap: 8px; } .gs input { flex: 1; }
.sq { position: relative; display: flex; } .sq .search { padding-right: 28px; } .clr { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: 0; font-size: 18px; line-height: 1; color: var(--c-muted); cursor: pointer; padding: 2px 4px; }
.flt { margin: -4px 0 10px; font-size: 13px; color: var(--c-muted); } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .bulk .lk { margin-right: 6px; }
.pg { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--c-muted); } .pg > span:first-child { margin-right: auto; } .pg label { display: flex; gap: 6px; align-items: center; } .pg select { padding: 4px 6px; font-size: 13px; } .pg button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 5px 11px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink); } .pg button:disabled { opacity: .5; cursor: default; } .pp { color: var(--c-ink-soft); }
</style>
