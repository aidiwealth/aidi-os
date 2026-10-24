<script setup lang="ts">
// Private links to a forecast or cap table: one per person or firm, each with its own visits (who opened it, when,
// for how long). Turn a link off at any time.
const props = defineProps<{ open: boolean; kind: 'forecast' | 'captable'; objectId: string; title: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()
interface Visit { email: string | null; name: string | null; started_at: string; last_at: string; seconds: number }
interface L { id: string; label: string; url: string; require_email: boolean; notify: boolean; active: boolean; expires_at: string | null; views: number; last_viewed_at: string | null; created_at: string; visits: Visit[] }
const links = ref<L[]>([]), loading = ref(false), msg = ref(''), copied = ref(''), openId = ref('')
const nf = reactive({ label: '', require_email: true, notify: true, expires_days: 0 })
async function load() { if (!props.objectId) return; loading.value = true; try { links.value = (await $fetch<{ links: L[] }>('/api/shares', { query: { kind: props.kind, id: props.objectId } })).links } catch (e) { msg.value = err(e) } finally { loading.value = false } }
watch(() => [props.open, props.objectId], () => { if (props.open) { msg.value = ''; nf.label = ''; load() } }, { immediate: true })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function post(body: Record<string, unknown>) { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/shares', { method: 'POST', body: { kind: props.kind, object_id: props.objectId, ...body } }); await load(); emit('changed'); return r } catch (e) { msg.value = err(e) } }
async function create() { const r = await post({ action: 'create', label: nf.label || 'Shared link', require_email: nf.require_email, notify: nf.notify, expires_days: nf.expires_days }); if (r) { nf.label = ''; const l = links.value.find((x) => x.id === r.id); if (l) copy(l) } }
async function copy(l: L) { try { await navigator.clipboard.writeText(l.url); copied.value = l.id; setTimeout(() => (copied.value = ''), 1500) } catch {} }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dur = (s: number) => (s < 60 ? (s ? s + 's' : 'under 15s') : Math.round(s / 60) + ' min')
const people = (l: L) => new Set(l.visits.map((v) => v.email ?? '')).size
</script>
<template>
  <AppModal :open="open" :title="'Share ' + title" wide @close="emit('close')">
    <div class="sl">
      <p class="mut">A private link per person, so you see who opened it. Read-only.</p>
      <form class="nl" @submit.prevent="create"><label class="label">Who is it for?<input v-model="nf.label" maxlength="120" placeholder="e.g. Ventures Platform, or Board"></label>
        <label class="label">Expires<select v-model.number="nf.expires_days"><option :value="0">Never</option><option :value="7">In 7 days</option><option :value="30">In 30 days</option><option :value="90">In 90 days</option></select></label>
        <div class="ck"><label><input v-model="nf.require_email" type="checkbox"> Ask for their email first</label><label><input v-model="nf.notify" type="checkbox"> Email me when it is opened</label></div>
        <button class="btn">Create link</button></form>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="links.length" class="ls">
        <div v-for="l in links" :key="l.id" class="li" :class="{ off: !l.active }">
          <div class="lt"><div><b>{{ l.label }}</b><span class="sub">{{ l.active ? (l.expires_at ? 'Expires ' + new Date(l.expires_at).toLocaleDateString('en-GB') : 'No expiry') : 'Turned off' }} · {{ l.require_email ? 'Email asked' : 'Open link' }} · made {{ when(l.created_at) }}</span></div>
            <div class="st"><b>{{ l.views }}</b> view{{ l.views === 1 ? '' : 's' }}<span v-if="l.visits.length" class="sub">{{ people(l) }} {{ people(l) === 1 ? 'person' : 'people' }}{{ l.last_viewed_at ? ' · last ' + when(l.last_viewed_at) : '' }}</span></div></div>
          <div class="lu"><code>{{ l.url }}</code><button class="btn secondary sm" :disabled="!l.active" @click="copy(l)">{{ copied === l.id ? 'Copied' : 'Copy' }}</button></div>
          <div class="la"><button v-if="l.visits.length" class="lk" @click="openId = openId === l.id ? '' : l.id">{{ openId === l.id ? 'Hide visits' : 'Who viewed' }}</button><button class="lk" @click="post({ action: 'update', id: l.id, active: !l.active })">{{ l.active ? 'Turn off' : 'Turn back on' }}</button><button class="lk" @click="post({ action: 'update', id: l.id, require_email: !l.require_email })">{{ l.require_email ? 'Stop asking for email' : 'Ask for email' }}</button><button class="lk red" @click="post({ action: 'delete', id: l.id })">Delete</button></div>
          <table v-if="openId === l.id" class="t" data-nosearch><thead><tr><th>Who</th><th>Opened</th><th class="r">Time spent</th></tr></thead>
            <tbody><tr v-for="(v, i) in l.visits" :key="i"><td>{{ v.name || v.email || 'Anonymous' }}<span v-if="v.name && v.email" class="sub">{{ v.email }}</span></td><td>{{ when(v.started_at) }}</td><td class="r">{{ dur(v.seconds) }}</td></tr></tbody></table>
        </div>
      </div>
      <p v-else-if="!loading" class="mut">No links yet.</p>
    </div>
    <template #foot><span class="sp" /><button class="btn secondary" @click="emit('close')">Done</button></template>
  </AppModal>
</template>
<style scoped>
.sl { display: flex; flex-direction: column; gap: 14px; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
.nl { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto auto; gap: 12px; align-items: end; border: 1px solid var(--c-rule); padding: 12px; } .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.nl input:not([type="checkbox"]), .nl select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .ck { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .ck label { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.ls { display: flex; flex-direction: column; border: 1px solid var(--c-rule); } .li { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 8px; } .li:last-child { border: 0; } .li.off { opacity: .6; }
.lt { display: flex; justify-content: space-between; gap: 12px; } .lt b { font-weight: 600; font-size: 14px; } .st { text-align: right; font-size: 13px; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.lu { display: flex; gap: 8px; align-items: center; background: var(--c-paper-3); padding: 6px 8px; } .lu code { flex: 1; font-size: 12px; word-break: break-all; } .btn.sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.la { display: flex; gap: 16px; flex-wrap: wrap; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.t { width: 100%; border-collapse: collapse; font-size: 12.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 6px 8px; border-bottom: 1px solid var(--c-rule); } .t .r { text-align: right; }
@media (max-width: 760px) { .nl { grid-template-columns: 1fr; } }
</style>
