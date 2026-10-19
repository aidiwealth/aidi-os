<script setup lang="ts">
import { MSG_CATEGORIES } from '~/shared/message-categories'
// Services desk conversations with clients: a list of threads (each with a subject and a type) and the open thread.
// The team can start a new conversation with any client — or, with clientId, with that client — and tag it with a type.
const props = defineProps<{ clientId?: string; clientName?: string; initial?: string }>()
const emit = defineEmits<{ changed: [] }>()
interface T { id: string; subject: string; status: string; category: string; started_by: string; last_message_at: string; client_id: string; client: string; last: string | null; n: number; unread: number }
interface D { thread: { id: string; subject: string; status: string; category: string; client_id: string; client: string; client_email: string | null; closed_at: string | null; closed_by: string | null }; messages: { id: string; category: string; from_team: boolean; body: string | null; created_at: string; author: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }[] }
const status = ref<'open' | 'closed' | 'all'>(props.clientId ? 'all' : 'open'); const cat = ref(''); const q = ref('')
const cur = ref(props.initial ?? ''); const composing = ref(false)
const { data: list, refresh: rlist } = await useFetch<T[]>('/api/services/inbox', { query: computed(() => ({ status: status.value, category: cat.value || undefined, client: props.clientId || undefined })) })
const shown = computed(() => (list.value ?? []).filter((t) => !q.value || (t.client + ' ' + t.subject + ' ' + (t.last ?? '')).toLowerCase().includes(q.value.toLowerCase())))
watch(list, (l) => { if (!cur.value && !composing.value && l?.length) cur.value = l[0]!.id }, { immediate: true })
const { data: conv, refresh: rconv } = await useFetch<D>(() => '/api/services/inbox/' + (cur.value || '00000000-0000-0000-0000-000000000000'), { immediate: !!cur.value, watch: [cur] })
const busy = ref(false); const msg = ref(''); const ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const done = async () => { await Promise.all([rlist(), cur.value ? rconv() : null]); emit('changed') }
function pick(id: string) { composing.value = false; cur.value = id; msg.value = ''; ok.value = '' }

// Start a new conversation
const { data: clients } = await useFetch<{ id: string; name: string; contact_name: string | null; email: string | null }[]>('/api/services/clients', { immediate: !props.clientId, default: () => [] })
const nw = reactive({ client: props.clientId ?? '', find: '', subject: '', category: 'general' })
const matches = computed(() => { const s = nw.find.trim().toLowerCase(); return (clients.value ?? []).filter((c) => !s || (c.name + ' ' + (c.contact_name ?? '') + ' ' + (c.email ?? '')).toLowerCase().includes(s)).slice(0, 8) })
const chosen = computed(() => (props.clientId ? { id: props.clientId, name: props.clientName ?? 'this client' } : (clients.value ?? []).find((c) => c.id === nw.client)))
function compose() { Object.assign(nw, { client: props.clientId ?? '', find: '', subject: '', category: 'general' }); composing.value = true; msg.value = ''; ok.value = '' }
async function start(body: string, documentId: string | null, category: string) {
  if (!nw.client) { msg.value = 'Choose a client.'; return } if (!nw.subject.trim()) { msg.value = 'Write a subject.'; return }
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ thread: string; emailed: number; muted: boolean }>('/api/services/inbox/new', { method: 'POST', body: { client_id: nw.client, subject: nw.subject, category: category || nw.category, body, document_id: documentId ?? undefined } })
    composing.value = false; status.value = props.clientId ? 'all' : 'open'; cur.value = r.thread; ok.value = r.muted ? 'Sent. Emails to this client are off, so they see it next time they sign in.' : r.emailed ? 'Sent — the client also got it by email.' : 'Sent.'; await done() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function send(body: string, documentId: string | null, category = 'general') { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/services/inbox/' + cur.value, { method: 'POST', body: { body, document_id: documentId ?? undefined, category } }); await done() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function setStatus(s: 'open' | 'closed') { msg.value = ''; try { await $fetch('/api/services/inbox/' + cur.value + '/status', { method: 'POST', body: { status: s } }); await done() } catch (e) { msg.value = err(e) } }
async function setMeta(m: { subject?: string; category?: string }) { msg.value = ''; try { await $fetch('/api/services/inbox/' + cur.value + '/meta', { method: 'POST', body: m }); await done() } catch (e) { msg.value = err(e) } }
function rename() { const s = window.prompt('Conversation subject', conv.value?.thread.subject ?? ''); if (s && s.trim()) setMeta({ subject: s.trim() }) }
async function del() { if (!conv.value || !window.confirm('Delete "' + conv.value.thread.subject + '" with ' + conv.value.thread.client + '? Its messages and files are removed for you and the client. This cannot be undone.')) return; msg.value = ''; try { await $fetch('/api/services/inbox/' + cur.value, { method: 'DELETE' }); cur.value = ''; await rlist(); emit('changed') } catch (e) { msg.value = err(e) } }
// Previews and subjects as plain text: no Markdown marks (**, #, >, links) or HTML.
const plain = (s: string | null | undefined) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|\*|_|~~|`)/g, '').replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '').replace(/\s+/g, ' ').trim()
const initials = (n: string) => n.split(/\s+/).filter((w) => !/^(llc|inc|ltd|limited|corp)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : s < 86400 * 30 ? Math.round(s / 86400) + 'd' : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { rlist(); if (cur.value && !composing.value) rconv() }, 30000) }); onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <div class="dt" :class="{ one: clientId }" data-nosearch>
    <aside class="ls">
      <div class="top"><button class="btn sm" type="button" @click="compose">+ New message</button></div>
      <div class="lt"><button v-for="s in (['open', 'closed', 'all'] as const)" :key="s" type="button" :class="{ on: status === s }" @click="status = s; cur = ''">{{ s === 'open' ? 'Open' : s === 'closed' ? 'Closed' : 'All' }}</button></div>
      <div class="fl"><input v-model="q" :placeholder="clientId ? 'Search conversations' : 'Search client or subject'" aria-label="Search"><select v-model="cat" aria-label="Type"><option value="">All types</option><option v-for="(l, k) in MSG_CATEGORIES" :key="k" :value="k">{{ l }}</option></select></div>
      <div class="items">
        <button v-for="t in shown" :key="t.id" type="button" class="it" :class="{ on: !composing && cur === t.id, un: t.unread }" @click="pick(t.id)">
          <span v-if="!clientId" class="av" aria-hidden="true">{{ initials(t.client) }}</span>
          <span class="bd">
            <span class="r1"><b>{{ clientId ? plain(t.subject) : t.client }}</b><em>{{ ago(t.last_message_at) }}</em></span>
            <span v-if="!clientId" class="sj">{{ plain(t.subject) }}</span>
            <span class="lm"><span v-if="t.category !== 'general'" class="ctag" :data-c="t.category">{{ MSG_CATEGORIES[t.category] ?? t.category }}</span><span v-if="t.status === 'closed'" class="cl">Closed</span><span class="pv">{{ plain(t.last) || 'Shared a document' }}</span></span>
          </span><i v-if="t.unread" class="dot">{{ t.unread }}</i></button>
        <EmptyState v-if="!shown.length" icon="cs_inbox" :title="status === 'open' ? 'All caught up' : 'No conversations'" :text="clientId ? 'Start one with + New message.' : status === 'open' ? 'New client messages land here.' : ''" />
      </div>
    </aside>

    <div v-if="composing" class="cv">
      <header class="nh"><b>New message</b><button type="button" class="x" aria-label="Cancel" @click="composing = false">×</button></header>
      <div class="nf">
        <div v-if="!clientId" class="row"><span class="k">To</span>
          <div v-if="chosen" class="pickd"><b>{{ chosen.name }}</b><button type="button" class="lk" @click="nw.client = ''">Change</button></div>
          <div v-else class="cp"><input v-model="nw.find" placeholder="Search clients by name, contact or email" aria-label="Client"><div v-if="matches.length" class="opts"><button v-for="c in matches" :key="c.id" type="button" @click="nw.client = c.id"><b>{{ c.name }}</b><span>{{ [c.contact_name, c.email].filter(Boolean).join(' · ') }}</span></button></div><p v-else class="mut">No clients match.</p></div></div>
        <div v-else class="row"><span class="k">To</span><b>{{ clientName }}</b></div>
        <div class="row"><span class="k">Subject</span><input v-model="nw.subject" maxlength="120" placeholder="e.g. Delaware franchise tax notice"></div>
        <div class="row"><span class="k">Type</span><select v-model="nw.category"><option v-for="(l, k) in MSG_CATEGORIES" :key="k" :value="k">{{ l }}</option></select><span v-if="nw.category !== 'general'" class="ctag" :data-c="nw.category">{{ MSG_CATEGORIES[nw.category] }}</span></div>
      </div>
      <ChatThread :messages="[]" side="team" :busy="busy" :upload-url="'/api/services/inbox/file?client=' + (nw.client || 'none')" download-base="/api/services/inbox/doc/" :default-category="nw.category" :placeholder="'Write to ' + (chosen?.name ?? 'the client') + '… they also get it by email'" @send="start">
        <template #empty><p class="none">Write the first message below. Attach files with the paperclip or by dragging them in.</p></template></ChatThread>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>

    <div v-else-if="conv && cur" class="cv">
      <header><div class="hi"><b>{{ plain(conv.thread.subject) }} <button type="button" class="lk sm" @click="rename">Rename</button></b>
        <span>{{ clientId ? (conv.thread.status === 'open' ? 'Open' : 'Closed') : conv.thread.client + (conv.thread.client_email ? ' · ' + conv.thread.client_email : '') }}<template v-if="!clientId"> · <NuxtLink :to="'/services/clients/' + conv.thread.client_id">Client file</NuxtLink></template></span></div>
        <label class="ty">Type<select :value="conv.thread.category" aria-label="Conversation type" @change="setMeta({ category: ($event.target as HTMLSelectElement).value })"><option v-for="(l, k) in MSG_CATEGORIES" :key="k" :value="k">{{ l }}</option></select></label>
        <button v-if="conv.thread.status === 'open'" type="button" class="btn secondary sm" @click="setStatus('closed')">Close</button><button v-else type="button" class="btn secondary sm" @click="setStatus('open')">Reopen</button><button type="button" class="btn secondary sm danger" @click="del">Delete</button></header>
      <ChatThread :messages="conv.messages" side="team" :closed="conv.thread.status === 'closed'" :busy="busy" :upload-url="'/api/services/inbox/file?client=' + conv.thread.client_id" download-base="/api/services/inbox/doc/" :default-category="conv.thread.category" placeholder="Reply… the client also gets it by email" @send="send" />
      <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <div v-else class="cv empty"><EmptyState icon="cs_inbox" title="Select a conversation" text="Or start a new one." /></div>
  </div>
</template>
<style scoped>
.dt { display: grid; grid-template-columns: 330px 1fr; border: 1px solid var(--c-rule); background: #fff; height: calc(var(--vh100) - 210px); min-height: 540px; } .dt.one { height: calc(var(--vh100) - 300px); min-height: 520px; }
.ls { border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; min-height: 0; } .top { padding: 10px; border-bottom: 1px solid var(--c-rule); } .top .btn { width: 100%; }
.lt { display: flex; border-bottom: 1px solid var(--c-rule); } .lt button { flex: 1; background: none; border: 0; padding: 10px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-muted); border-bottom: 2px solid transparent; } .lt .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.fl { display: grid; grid-template-columns: 1fr 120px; gap: 6px; padding: 10px; border-bottom: 1px solid var(--c-rule); } .fl input, .fl select { font: inherit; font-size: 13px; padding: 7px 8px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.items { overflow-y: auto; flex: 1; } .it { position: relative; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 12px 14px; cursor: pointer; font: inherit; display: flex; gap: 11px; align-items: flex-start; }
.av { width: 32px; height: 32px; flex: none; background: var(--c-paper-2); color: var(--c-navy); font-size: 12px; font-weight: 600; display: grid; place-items: center; letter-spacing: .02em; } .it.on .av { background: var(--c-navy); color: #fff; }
.bd { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .it.on { background: var(--c-signal-soft); box-shadow: inset 3px 0 0 var(--c-navy); } .it:hover { background: #fafaf8; }
.r1 { display: flex; justify-content: space-between; gap: 8px; } .r1 b { font-size: 13.5px; font-weight: 600; color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .r1 em { font-style: normal; font-size: 11.5px; color: var(--c-muted); flex: none; } .sj { font-size: 13px; color: var(--c-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .it.un .sj { font-weight: 600; color: var(--c-ink); } .it.un .r1 em { color: var(--c-navy); font-weight: 600; }
.lm { display: flex; gap: 6px; align-items: center; min-width: 0; font-size: 12.5px; color: var(--c-muted); padding-right: 24px; margin-top: 2px; } .lm .ctag { flex: none; font-size: 10.5px; padding: 1px 6px; } .cl { flex: none; font-size: 10.5px; font-weight: 600; background: var(--c-paper-2); color: var(--c-muted); padding: 1px 6px; } .pv { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { position: absolute; right: 14px; bottom: 13px; min-width: 18px; height: 18px; background: #d93a3a; color: #fff; font-style: normal; font-size: 11px; font-weight: 600; display: grid; place-items: center; padding: 0 5px; }
.cv { display: flex; flex-direction: column; min-width: 0; min-height: 0; } .cv header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); flex-wrap: wrap; } .hi { flex: 1; min-width: 200px; display: flex; flex-direction: column; } .hi span { font-size: 12.5px; color: var(--c-muted); } .hi a { color: var(--c-blue-deep); }
.ty { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-muted); } .ty select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); background: #fff; }
.nh { justify-content: space-between; } .x { background: none; border: 0; font-size: 22px; line-height: 1; cursor: pointer; color: var(--c-muted); }
.nf { display: flex; flex-direction: column; border-bottom: 1px solid var(--c-rule); } .row { display: flex; gap: 10px; align-items: flex-start; padding: 9px 16px; border-bottom: 1px solid var(--c-rule); } .row:last-child { border-bottom: 0; } .k { width: 64px; flex: none; font-size: 13px; color: var(--c-muted); padding-top: 7px; }
.row > input, .row > select { flex: 1; font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .row > select { flex: 0 1 240px; } .row .ctag { margin: 6px 0 0; }
.pickd { display: flex; gap: 10px; align-items: center; padding-top: 6px; } .cp { flex: 1; display: flex; flex-direction: column; gap: 4px; } .cp input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); }
.opts { border: 1px solid var(--c-rule); max-height: 220px; overflow-y: auto; } .opts button { display: flex; flex-direction: column; width: 100%; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--c-rule); padding: 8px 10px; font: inherit; cursor: pointer; } .opts button:hover { background: var(--c-signal-soft); } .opts b { font-size: 13.5px; font-weight: 500; } .opts span { font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .lk.sm { font-size: 12px; font-weight: 400; margin-left: 6px; }
.btn.sm { padding: 6px 12px; font-size: 13px; } .empty { display: grid; place-items: center; } .none { color: var(--c-muted); text-align: center; margin: auto; max-width: 380px; } .mut { color: var(--c-muted); font-size: 13px; margin: 4px 0; }
.ctag { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 2px 8px; background: #eef4ff; color: #2c5cc5; } .ctag[data-c="state_notice"], .ctag[data-c="tax_notice"], .ctag[data-c="legal"] { background: #fdecef; color: #b4234a; } .ctag[data-c="bank_notice"], .ctag[data-c="billing"] { background: #fff4e0; color: #9a5b00; } .ctag[data-c="mail"] { background: #eaf1f7; color: #1e5079; } .ctag[data-c="compliance"] { background: #f2ecfd; color: #6b3fc4; }
.error { color: var(--c-danger); padding: 0 16px; margin: 6px 0; } .okm { color: var(--c-ok); padding: 0 16px; margin: 6px 0; font-size: 13px; }
@media (max-width: 900px) { .dt, .dt.one { grid-template-columns: 1fr; height: auto; } .ls { max-height: 420px; } }
</style>
