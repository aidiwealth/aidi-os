<script setup lang="ts">
// Services desk inbox: client conversations as tickets. Reply, attach files, close or reopen.
useHead({ title: 'Inbox' })
const route = useRoute()
interface T { id: string; subject: string; status: string; last_message_at: string; client_id: string; client: string; last: string | null; unread: number }
const status = ref<'open' | 'closed'>('open'); const q = ref(''); const cur = ref(String(route.query.t ?? ''))
const { data: list, refresh: rlist } = await useFetch<T[]>('/api/services/inbox', { query: { status } })
const shown = computed(() => (list.value ?? []).filter((t) => !q.value || (t.client + ' ' + t.subject).toLowerCase().includes(q.value.toLowerCase())))
watch(list, (l) => { if (!cur.value && l?.length) cur.value = l[0]!.id }, { immediate: true })
interface D { thread: { id: string; subject: string; status: string; client_id: string; client: string; client_email: string | null; closed_at: string | null; closed_by: string | null }; messages: { id: string; from_team: boolean; body: string | null; created_at: string; author: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }[]; others: { id: string; subject: string; status: string; last_message_at: string }[] }
const { data: conv, refresh: rconv } = await useFetch<D>(() => '/api/services/inbox/' + (cur.value || '00000000-0000-0000-0000-000000000000'), { immediate: !!cur.value, watch: [cur] })
const busy = ref(false); const msg = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function send(body: string, documentId: string | null) { busy.value = true; msg.value = ''; try { await $fetch('/api/services/inbox/' + cur.value, { method: 'POST', body: { body, document_id: documentId ?? undefined } }); await Promise.all([rconv(), rlist()]) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function setStatus(s: 'open' | 'closed') { msg.value = ''; try { await $fetch('/api/services/inbox/' + cur.value + '/status', { method: 'POST', body: { status: s } }); await Promise.all([rconv(), rlist()]) } catch (e) { msg.value = err(e) } }
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd' }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { rlist(); if (cur.value) rconv() }, 30000) }); onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section>
    <p class="label">Services desk</p><h1>Inbox</h1>
    <div class="ib">
      <aside class="ls"><div class="lt"><button :class="{ on: status === 'open' }" @click="status = 'open'; cur = ''">Open</button><button :class="{ on: status === 'closed' }" @click="status = 'closed'; cur = ''">Closed</button></div>
        <input v-model="q" placeholder="Search client or subject" aria-label="Search">
        <button v-for="t in shown" :key="t.id" class="it" :class="{ on: cur === t.id, un: t.unread }" @click="cur = t.id"><span class="r1"><b>{{ t.client }}</b><em>{{ ago(t.last_message_at) }}</em></span><span class="sj">{{ t.subject }}</span><span class="lm">{{ t.last }}</span><i v-if="t.unread" class="dot">{{ t.unread }}</i></button>
        <p v-if="!shown.length" class="mut">{{ status === 'open' ? 'No open conversations. You are all caught up.' : 'No closed conversations.' }}</p></aside>
      <div v-if="conv && cur" class="cv">
        <header><div><b>{{ conv.thread.subject }}</b><span>{{ conv.thread.client }}{{ conv.thread.client_email ? ' · ' + conv.thread.client_email : '' }} · <NuxtLink :to="'/services/clients/' + conv.thread.client_id">Client file</NuxtLink></span></div>
          <button v-if="conv.thread.status === 'open'" class="btn secondary" @click="setStatus('closed')">Close conversation</button><button v-else class="btn secondary" @click="setStatus('open')">Reopen</button></header>
        <ChatThread :messages="conv.messages" side="team" :closed="conv.thread.status === 'closed'" :busy="busy" :upload-url="'/api/services/inbox/file?client=' + conv.thread.client_id" download-base="/api/services/inbox/doc/" placeholder="Reply… the client also gets it by email" @send="send" />
        <p v-if="msg" class="error">{{ msg }}</p>
        <div v-if="conv.others.length" class="oth"><span>Earlier conversations:</span><button v-for="o in conv.others" :key="o.id" class="lk" @click="status = o.status as 'open'; cur = o.id">{{ o.subject }} ({{ o.status }})</button></div>
      </div>
      <div v-else class="cv empty"><p>Select a conversation.</p></div>
    </div>
  </section>
</template>
<style scoped>
h1 { margin: 0 0 14px; } .ib { display: grid; grid-template-columns: 320px 1fr; gap: 0; border: 1px solid var(--c-rule); background: #fff; height: calc(100vh - 210px); min-height: 520px; }
.ls { border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; overflow-y: auto; } .lt { display: flex; border-bottom: 1px solid var(--c-rule); } .lt button { flex: 1; background: none; border: 0; padding: 11px; font: inherit; cursor: pointer; color: var(--c-muted); border-bottom: 2px solid transparent; } .lt .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ls input { margin: 10px; font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .it { position: relative; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 12px 14px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 3px; } .it.on { background: var(--c-signal-soft); } .it:hover { background: #fafaf8; }
.r1 { display: flex; justify-content: space-between; gap: 8px; } .r1 b { font-size: 14px; font-weight: 500; } .it.un .r1 b, .it.un .sj { font-weight: 700; } .r1 em { font-style: normal; font-size: 12px; color: var(--c-muted); } .sj { font-size: 13px; } .lm { font-size: 12.5px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 26px; }
.dot { position: absolute; right: 12px; bottom: 12px; min-width: 18px; height: 18px; border-radius: 9px; background: #d93a3a; color: #fff; font-style: normal; font-size: 11px; font-weight: 600; display: grid; place-items: center; padding: 0 5px; }
.cv { display: flex; flex-direction: column; min-width: 0; min-height: 0; } .cv header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } .cv header div { display: flex; flex-direction: column; } .cv header span { font-size: 12.5px; color: var(--c-muted); }
.empty { display: grid; place-items: center; color: var(--c-muted); } .oth { padding: 8px 16px; border-top: 1px solid var(--c-rule); font-size: 12.5px; display: flex; gap: 10px; flex-wrap: wrap; color: var(--c-muted); } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.mut { color: var(--c-muted); font-size: 13px; padding: 14px; } .error { color: var(--c-danger); padding: 0 16px; }
@media (max-width: 900px) { .ib { grid-template-columns: 1fr; height: auto; } }
</style>
