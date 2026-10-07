<script setup lang="ts">
// Staff: client documents. Start from a template (advisory agreement, investment confirmation, product details) or a
// blank page, edit the text, and send — with or without a request for electronic signature. Tax documents for this
// client are listed too.
const props = defineProps<{ clientId: string }>()
const api = '/api/wm/clients/' + props.clientId + '/docs'
const { data, refresh } = await useFetch<{ docs: Record<string, any>[]; taxDocs: Record<string, any>[]; holdings: { id: string; name: string; category: string }[]; entities: { id: string; name: string }[]; entity_id: string | null }>(api, { key: 'docs-' + props.clientId })
const KINDS: Record<string, string> = { iaa: 'Investment advisory agreement', investment_confirmation: 'Investment confirmation', product_details: 'Product details', other: 'Other document' }
const f = reactive({ open: false, kind: 'iaa', holding_id: '', entity_id: '', title: '', body_md: '', requires_signature: true })
watchEffect(() => { if (data.value && !f.entity_id) f.entity_id = data.value.entity_id ?? '' }); const msg = ref(''); const ok = ref(''); const busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.'
async function draft() { msg.value = ''; if (f.kind === 'other') { Object.assign(f, { title: '', body_md: '', requires_signature: false }); return } busy.value = 'd'; try { const t = await $fetch<{ title: string; md: string; requires_signature: boolean }>(api, { method: 'POST', body: { action: 'draft', kind: f.kind, holding_id: f.holding_id || null, entity_id: f.entity_id || null } }); Object.assign(f, { title: t.title, body_md: t.md, requires_signature: t.requires_signature }) } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function send() { busy.value = 's'; msg.value = ''; try { await $fetch(api, { method: 'POST', body: { action: 'send', kind: f.kind, title: f.title, body_md: f.body_md, requires_signature: f.requires_signature, holding_id: f.holding_id || null, entity_id: f.entity_id || null } }); f.open = false; ok.value = 'Sent to the client' + (f.requires_signature ? ' for signature.' : '.'); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function del(id: string) { if (!confirm('Withdraw this document?')) return; await $fetch(api, { method: 'POST', body: { action: 'delete', doc_id: id } }); await refresh() }
const ST: Record<string, string> = { sent: 'Waiting for signature', signed: 'Signed', declined: 'Declined', info: 'Shared' }
</script>
<template>
  <div v-if="data" class="wd">
    <div class="card"><div class="h"><h3>Client documents</h3><button class="btn secondary sm" @click="f.open = !f.open; if (f.open) draft()">{{ f.open ? 'Close' : 'New document' }}</button></div>
      <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
      <div v-if="f.open" class="nf"><div class="row"><select v-model="f.kind" @change="draft"><option v-for="(l, k) in KINDS" :key="k" :value="k">{{ l }}</option></select><select v-if="f.kind === 'investment_confirmation' || f.kind === 'product_details'" v-model="f.holding_id" @change="draft"><option value="">Choose the holding</option><option v-for="h in data.holdings" :key="h.id" :value="h.id">{{ h.name }}</option></select><label class="ent">Contracting entity <select v-model="f.entity_id" @change="draft"><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label><span v-if="busy === 'd'" class="mut">Preparing…</span></div>
        <input v-model="f.title" placeholder="Title" class="w"><textarea v-model="f.body_md" rows="16" class="w mono" placeholder="Document text. ## Heading, **bold**, | tables | work." />
        <label class="cb"><input v-model="f.requires_signature" type="checkbox"> Ask the client to sign electronically</label>
        <div class="row"><button class="btn" :disabled="busy === 's' || !f.title || !f.body_md" @click="send">{{ busy === 's' ? 'Sending…' : 'Send to client' }}</button><span class="mut">A PDF is created, the client is emailed, and it appears under Documents in their portal.</span></div></div>
      <div v-for="d in data.docs" :key="d.id" class="rw"><span><b>{{ d.title }}</b><em>{{ KINDS[d.kind] ?? d.kind }} · {{ new Date(d.created_at).toLocaleDateString('en-GB') }}{{ d.viewed_at ? ' · opened ' + new Date(d.viewed_at).toLocaleDateString('en-GB') : ' · not opened yet' }}</em></span>
        <span class="ra"><span class="st" :class="d.status">{{ ST[d.status] }}{{ d.signed_at ? ' ' + new Date(d.signed_at).toLocaleDateString('en-GB') : '' }}</span><a :href="'/api/wm/client-docs/' + d.id" target="_blank" class="lk">PDF</a><a v-if="d.signed_doc_id" :href="'/api/wm/client-docs/' + d.id + '?signed=1'" target="_blank" class="lk">Signed copy</a><button v-if="d.status !== 'signed'" class="lk red" @click="del(d.id)">Withdraw</button></span></div>
      <p v-if="!data.docs.length && !f.open" class="mut">No documents yet. Investment confirmations are created automatically when you add a holding with a cost.</p></div>
    <div class="card"><div class="h"><h3>Tax documents</h3><NuxtLink to="/tax-documents" class="btn secondary sm">Upload tax documents</NuxtLink></div>
      <div v-for="t in data.taxDocs" :key="t.id" class="rw"><span><b>{{ t.tax_year }} · {{ t.form_type }}</b><em>{{ t.issuer ?? '' }} · {{ t.first_viewed_at ? 'opened ' + t.downloads + '×' : 'not opened yet' }}</em></span><a :href="'/api/tax-docs/' + t.id" target="_blank" class="lk">Open</a></div><p v-if="!data.taxDocs.length" class="mut">None yet.</p></div>
  </div>
</template>
<style scoped>
.wd { display: flex; flex-direction: column; gap: 12px; } .wd * { box-sizing: border-box; } .h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } h3 { margin: 0; font-size: 15px; } .mut { color: var(--c-muted); font-size: 12.5px; } .okm { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
.ent { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-muted); } .nf { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: var(--c-paper-2); margin-bottom: 8px; } .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .w { width: 100%; } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; line-height: 1.5; } .cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; }
.rw { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .ra { display: flex; gap: 10px; align-items: center; }
.st { font-size: 11.5px; padding: 2px 8px; background: var(--c-paper-2); white-space: nowrap; } .st.sent { background: rgba(181,71,8,.09); color: var(--c-warn); } .st.signed { background: rgba(31,122,77,.1); color: var(--c-ok); } .st.declined { color: var(--c-danger); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-decoration: none; } .lk.red { color: var(--c-danger); }
</style>
