<script setup lang="ts">
// Contacts: everyone you send updates and decks to, in lists, with custom properties and subscribe status.
useHead({ title: 'Contacts' })
interface C { id: string; name: string; email: string; firm: string | null; title: string | null; subscribed: boolean; created_at: string; lists: { id: string; name: string }[]; last_activity: string | null }
interface Fd { id: string; key: string; label: string; type: string; options: string[] }
const q = ref(''); const list = ref('')
const qq = ref(''); let qt: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => { clearTimeout(qt); qt = setTimeout(() => (qq.value = v), 300) })
const { data, refresh } = await useFetch<{ contacts: C[]; lists: { id: string; name: string; n: number }[]; fields: Fd[] }>('/api/crm/contacts', { query: { q: qq, list } })
const { data: meK } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
const isVc = computed(() => !!meK.value?.org && meK.value.org.kind !== 'company')
async function importLps() { msg.value = ''; try { const r = await $fetch<{ total: number; added: number }>('/api/crm/contacts/import-lps', { method: 'POST' }); ok.value = r.total + ' LPs in the "LPs" list (' + r.added + ' new).'; await refresh() } catch (e) { msg.value = err(e) } }
const sel = ref<string[]>([]); const all = computed({ get: () => !!data.value?.contacts.length && sel.value.length === data.value.contacts.length, set: (v: boolean) => { sel.value = v ? (data.value?.contacts ?? []).map((c) => c.id) : [] } })
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
async function doImport() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ added: number; updated: number }>('/api/crm/contacts/import', { method: 'POST', body: { lines: im.lines, list_id: im.list_id || undefined } }); im.open = false; im.lines = ''; ok.value = r.added + ' added' + (r.updated ? ', ' + r.updated + ' already there' : '') + '.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const nl = reactive({ open: false, name: '' })
async function addList() { try { const r = await $fetch<{ id: string }>('/api/crm/lists', { method: 'POST', body: { name: nl.name } }); nl.open = false; nl.name = ''; await refresh(); if (sel.value.length) await bulk('add_list', r.id) } catch (e) { msg.value = err(e) } }
async function bulk(action: string, list_id?: string) { msg.value = ''; try { await $fetch('/api/crm/contacts/bulk', { method: 'POST', body: { ids: sel.value, action, list_id } }); if (action === 'delete') sel.value = []; await refresh() } catch (e) { msg.value = err(e) } }
const toList = ref('')
watch(toList, (v) => { if (v === '__new') { nl.open = true } else if (v) bulk('add_list', v); nextTick(() => (toList.value = '')) })
const fl = reactive({ open: false, fields: [] as { label: string; type: string; options: string }[] })
function openFields() { fl.fields = (data.value?.fields ?? []).map((f) => ({ label: f.label, type: f.type, options: f.options.join(', ') })); fl.open = true }
async function saveFields() { try { await $fetch('/api/crm/fields', { method: 'POST', body: { fields: fl.fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label, type: f.type, options: f.type === 'select' ? f.options.split(',').map((s) => s.trim()).filter(Boolean) : [] })) } }); fl.open = false; await refresh() } catch (e) { msg.value = err(e) } }
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><h1>Contacts</h1><div class="row"><input v-model="q" class="search" placeholder="Search name, email or firm" aria-label="Search"><button class="btn secondary" @click="openFields">Custom properties</button><button v-if="isVc" class="btn secondary" @click="importLps">Import LPs</button><button class="btn secondary" @click="im.open = true">Import</button><button class="btn" @click="nc.open = true">New contact</button></div></div>
    <div class="lists"><button :class="{ on: !list }" @click="list = ''">All contacts</button><button v-for="l in data.lists" :key="l.id" :class="{ on: list === l.id }" @click="list = l.id">{{ l.name }} <em>{{ l.n }}</em></button><button class="add" @click="nl.open = true">+ New list</button><DeleteButton v-if="list" type="crm_list" :id="list" :name="'the list ' + (data.lists.find((l) => l.id === list)?.name ?? '') + ' (contacts are kept)'" link @deleted="list = ''; refresh()" /></div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <div v-if="sel.length" class="bulk"><b>{{ sel.length }} selected</b><select v-model="toList"><option value="">Add to list…</option><option v-for="l in data.lists" :key="l.id" :value="l.id">{{ l.name }}</option><option value="__new">+ New list</option></select>
      <button v-if="list" class="btn secondary sm" @click="bulk('remove_list', list)">Remove from this list</button><button class="btn secondary sm" @click="bulk('unsubscribe')">Unsubscribe</button><button class="btn secondary sm" @click="bulk('subscribe')">Subscribe</button><button class="btn secondary sm danger" @click="bulk('delete')">Delete</button></div>
    <div class="box"><table v-if="data.contacts.length"><thead><tr><th class="ck"><input v-model="all" type="checkbox" aria-label="Select all"></th><th>Contact</th><th>Firm</th><th>Lists</th><th>Last activity</th><th>Status</th></tr></thead>
      <tbody><tr v-for="c in data.contacts" :key="c.id"><td class="ck"><input v-model="sel" type="checkbox" :value="c.id" aria-label="Select"></td>
        <td><NuxtLink :to="'/contacts/' + c.id" class="ct"><span class="av">{{ initials(c.name) }}</span><span><b>{{ c.name }}</b><em>{{ c.email }}</em></span></NuxtLink></td>
        <td>{{ c.firm ?? '—' }}<span v-if="c.title" class="mut"> · {{ c.title }}</span></td><td><span v-for="l in c.lists" :key="l.id" class="chip">{{ l.name }}</span><span v-if="!c.lists.length" class="mut">—</span></td>
        <td class="mut">{{ c.last_activity ? day(c.last_activity) : '—' }}</td><td><span class="st" :class="{ off: !c.subscribed }">{{ c.subscribed ? 'Subscribed' : 'Unsubscribed' }}</span></td></tr></tbody></table>
      <EmptyState v-else icon="contacts" :title="q || list ? 'No contacts match' : 'No contacts yet'" :text="q || list ? 'Try another search or list.' : 'Import your investor list, or add contacts one by one. People who open your data room links are added for you.'"><template v-if="!q && !list"><button class="btn" @click="im.open = true">Import contacts</button><button class="btn secondary" @click="nc.open = true">Add a contact</button></template></EmptyState></div>

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
.chip { display: inline-block; font-size: 12px; background: var(--c-paper-2); padding: 2px 8px; margin: 0 4px 2px 0; } .st { font-size: 12px; padding: 3px 9px; background: rgba(31,122,77,.1); color: var(--c-ok); } .st.off { background: var(--c-paper-2); color: var(--c-muted); }
.none { padding: 32px; text-align: center; } .none p { color: var(--c-ink-soft); max-width: 460px; margin: 6px auto 14px; } .mut { color: var(--c-muted); font-size: 13px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; } .lb { font-size: 13px; color: var(--c-ink-soft); }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; } .cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .cb input { width: auto; }
.fr { display: flex; gap: 6px; } .fr input:first-child { flex: 1; } .x { background: none; border: 0; font-size: 20px; color: var(--c-muted); cursor: pointer; } code { font-size: 12px; background: var(--c-paper-2); padding: 1px 5px; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
.gs { display: flex; gap: 8px; } .gs input { flex: 1; }
</style>
