<script setup lang="ts">
// Support email (support@finvry.com): threads on the left, the conversation and a rich-text reply on the right.
interface T { id: string; subject: string; from_email: string; from_name: string | null; status: string; unread: boolean; last_message_at: string; workspace: string | null; last: string | null; n: number }
interface M { id: string; direction: 'in' | 'out'; from_email: string; subject: string; text_body: string | null; html_body: string | null; body_md: string | null; attachments: { doc_id: string; name: string }[]; created_at: string; sent_by: string | null }
const status = ref<'open' | 'closed'>('open'), q = ref(''), cur = ref('')
const { data: list, refresh: rlist } = await useFetch<T[]>('/api/services/support', { query: { status }, key: 'support-list' })
const shown = computed(() => (list.value ?? []).filter((t) => !q.value || (t.subject + ' ' + t.from_email + ' ' + (t.from_name ?? '')).toLowerCase().includes(q.value.toLowerCase())))
watch(list, (l) => { if (!cur.value && l?.length) cur.value = l[0]!.id }, { immediate: true })
const { data: conv, refresh: rconv } = await useFetch<{ thread: T & { workspace_id: string | null }; messages: M[] }>(() => '/api/services/support/' + (cur.value || '00000000-0000-0000-0000-000000000000'), { immediate: !!cur.value, watch: [cur], key: 'support-conv' })
const reply = ref(''), busy = ref(false), msg = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function send() { busy.value = true; msg.value = ''; try { await $fetch('/api/services/support/' + cur.value, { method: 'POST', body: { action: 'reply', body: reply.value } }); reply.value = ''; await Promise.all([rconv(), rlist()]) } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function setStatus(a: 'open' | 'close') { try { await $fetch('/api/services/support/' + cur.value, { method: 'POST', body: { action: a } }); await Promise.all([rconv(), rlist()]) } catch (e) { msg.value = err(e) } }
// Incoming HTML is shown in a sandboxed frame (no scripts, no forms); plain text otherwise.
const frame = (h: string) => '<base target="_blank"><style>body{font:14px/1.55 -apple-system,Helvetica,Arial,sans-serif;color:#1f1f1f;margin:0}img{max-width:100%;height:auto}</style>' + h
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank', 'noopener') } catch (e) { msg.value = err(e) } }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <div class="ib">
    <aside class="ls"><div class="lt"><button :class="{ on: status === 'open' }" @click="status = 'open'; cur = ''">Open</button><button :class="{ on: status === 'closed' }" @click="status = 'closed'; cur = ''">Closed</button></div>
      <input v-model="q" class="sr" placeholder="Search support email">
      <button v-for="t in shown" :key="t.id" class="it" :class="{ on: cur === t.id, un: t.unread }" @click="cur = t.id"><span class="r1"><b>{{ t.from_name || t.from_email }}</b><em>{{ when(t.last_message_at) }}</em></span><span class="sj">{{ t.subject }}</span><span class="pv">{{ t.last }}</span><span v-if="t.workspace" class="ws">{{ t.workspace }}</span></button>
      <p v-if="!shown.length" class="mut pad">No {{ status }} support emails. Messages to support@finvry.com appear here.</p></aside>
    <section v-if="conv && cur" class="cv">
      <header><div><h2>{{ conv.thread.subject }}</h2><p class="mut">{{ conv.thread.from_name ? conv.thread.from_name + ' · ' : '' }}{{ conv.thread.from_email }}<template v-if="conv.thread.workspace"> · Finvry workspace: <b>{{ conv.thread.workspace }}</b></template></p></div>
        <button class="btn secondary sm" @click="setStatus(conv.thread.status === 'open' ? 'close' : 'open')">{{ conv.thread.status === 'open' ? 'Close' : 'Reopen' }}</button></header>
      <div class="msgs"><article v-for="m in conv.messages" :key="m.id" class="m" :class="m.direction"><div class="mh"><b>{{ m.direction === 'in' ? m.from_email : (m.sent_by || 'Finvry Support') }}</b><em>{{ when(m.created_at) }}</em></div>
        <iframe v-if="m.direction === 'in' && m.html_body" class="hf" sandbox="allow-popups allow-popups-to-escape-sandbox" :srcdoc="frame(m.html_body)" referrerpolicy="no-referrer" />
        <pre v-else-if="m.direction === 'in'" class="tx">{{ m.text_body }}</pre>
        <div v-else class="md" v-html="m.html_body" />
        <div v-if="m.attachments?.length" class="att"><button v-for="a in m.attachments" :key="a.doc_id" type="button" @click="openDoc(a.doc_id)">📎 {{ a.name }}</button></div></article></div>
      <footer><ClientOnly><RichEditor v-model="reply" :min-height="140" compact placeholder="Write your reply…" /></ClientOnly><div class="fr"><span class="mut sm">Sent from Finvry Support · replies come back to support@finvry.com</span><button class="btn" :disabled="busy || !reply.trim()" @click="send">{{ busy ? 'Sending…' : 'Send reply' }}</button></div><p v-if="msg" class="error">{{ msg }}</p></footer>
    </section>
    <section v-else class="cv empty"><p class="mut">Choose a conversation.</p></section>
  </div>
</template>
<style scoped>
.ib { display: grid; grid-template-columns: 340px 1fr; gap: 0; border: 1px solid var(--c-rule); background: #fff; min-height: 70vh; } .ls { border-right: 1px solid var(--c-rule); display: flex; flex-direction: column; max-height: 78vh; overflow-y: auto; }
.lt { display: flex; border-bottom: 1px solid var(--c-rule); } .lt button { flex: 1; background: none; border: 0; padding: 11px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-muted); border-bottom: 2px solid transparent; } .lt button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); }
.sr { margin: 10px; font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); }
.it { text-align: left; background: none; border: 0; border-top: 1px solid var(--c-rule); padding: 12px 14px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 3px; } .it.on { background: var(--c-paper-2); } .it.un b { color: var(--c-ink); } .it.un .sj { font-weight: 600; }
.r1 { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; } .r1 b { font-weight: 600; color: var(--c-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .r1 em { font-style: normal; font-size: 11.5px; color: var(--c-muted); white-space: nowrap; }
.sj { font-size: 13.5px; color: var(--c-ink); } .pv { font-size: 12.5px; color: var(--c-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .ws { font-size: 11px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 1px 6px; width: fit-content; }
.cv { display: flex; flex-direction: column; min-width: 0; } .cv.empty { align-items: center; justify-content: center; }
header { display: flex; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--c-rule); } h2 { margin: 0 0 4px; font-size: 17px; } .mut { color: var(--c-muted); margin: 0; font-size: 13px; } .sm { font-size: 12px; } .pad { padding: 14px; }
.msgs { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; max-height: 52vh; }
.m { border: 1px solid var(--c-rule); padding: 12px 14px; } .m.out { background: var(--c-paper-2); margin-left: 40px; } .m.in { margin-right: 40px; } .mh { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 8px; } .mh em { font-style: normal; color: var(--c-muted); }
.hf { width: 100%; min-height: 220px; border: 0; background: #fff; } .tx { white-space: pre-wrap; font: inherit; font-size: 14px; margin: 0; } .md :deep(p) { margin: 0 0 8px; }
.att { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; } .att button { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); }
footer { border-top: 1px solid var(--c-rule); padding: 12px 18px; display: flex; flex-direction: column; gap: 8px; } .fr { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding-right: 72px; } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
@media (max-width: 900px) { .ib { grid-template-columns: 1fr; } }
</style>
