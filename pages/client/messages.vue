<script setup lang="ts">
// Messages with the Aidi team: the current conversation, past ones, attachments both ways.
import { MSG_CATEGORIES } from '~/shared/message-categories'
useHead({ title: 'Messages' })
interface T { id: string; subject: string; status: string; category: string; opened_at: string; closed_at: string | null; closed_by: string | null; last_message_at: string; n: number }
const sel = ref(String(useRoute().query.thread ?? ''))
const { data, refresh } = await useFetch<{ thread: T | null; threads: T[]; messages: { id: string; from_team: boolean; body: string | null; created_at: string; author: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }[] }>('/api/portal/messages', { query: { thread: sel } })
const busy = ref(false); const msg = ref('')
async function send(body: string, documentId: string | null) { busy.value = true; msg.value = ''; try { const r = await $fetch<{ thread: string }>('/api/portal/messages', { method: 'POST', body: { body, document_id: documentId ?? undefined, thread_id: data.value?.thread?.status === 'open' ? data.value.thread.id : undefined } }); sel.value = r.thread; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { busy.value = false } }
async function resolve() { if (!data.value?.thread || !confirm('Mark this conversation as resolved?')) return; await $fetch('/api/portal/threads/' + data.value.thread.id + '/close', { method: 'POST' }); await refresh() }
function fresh() { sel.value = ''; if (data.value) { data.value.thread = null; data.value.messages = [] } }
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/(\*\*|__|\*|`)/g, '').replace(/^\s*(#{1,6}|>)\s+/gm, '').replace(/\s+/g, ' ').trim()
const when = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <div class="wrap">
      <aside class="hist"><button class="btn sm" @click="fresh">+ New conversation</button><p class="hl">Conversations</p>
        <button v-for="t in data.threads" :key="t.id" class="ti" :class="{ on: data.thread?.id === t.id }" @click="sel = t.id"><b>{{ plain(t.subject) }}</b><span v-if="t.category && t.category !== 'general'" class="ctag" :data-c="t.category">{{ MSG_CATEGORIES[t.category] ?? t.category }}</span><span><i :class="t.status">{{ t.status === 'open' ? 'Open' : 'Closed' }}</i> · {{ when(t.last_message_at) }}</span></button>
        <p v-if="!data.threads.length" class="mut">Your conversations with us appear here.</p></aside>
      <div class="chat">
        <header><span class="av">A</span><div><b>{{ data.thread ? plain(data.thread.subject) : 'New conversation' }} <span v-if="data.thread?.category && data.thread.category !== 'general'" class="ctag" :data-c="data.thread.category">{{ MSG_CATEGORIES[data.thread.category] }}</span></b><span>{{ data.thread ? (data.thread.status === 'open' ? 'Open · we usually reply within one business day, and by email' : 'Closed ' + (data.thread.closed_at ? when(data.thread.closed_at) : '')) : 'Ask us anything about your company, filings, invoices or an order.' }}</span></div>
          <button v-if="data.thread?.status === 'open'" class="btn secondary sm" @click="resolve">Mark resolved</button></header>
        <ChatThread :messages="data.messages" side="client" :closed="data.thread?.status === 'closed'" :busy="busy" :default-category="data.thread?.category" upload-url="/api/portal/messages/file" download-base="/api/portal/documents/" @send="send">
          <template #empty><p v-if="!data.messages.length" class="none">Write your message below. You can attach documents with the paperclip or by dragging them here.</p></template></ChatThread>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
    </div>
  </section>
</template>
<style scoped>
.wrap { display: grid; grid-template-columns: 260px 1fr; gap: 14px; max-width: 1100px; } .hist { display: flex; flex-direction: column; gap: 6px; } .hl { font-size: 12px; color: var(--c-muted); margin: 10px 0 2px; text-transform: uppercase; letter-spacing: .06em; }
.ti { text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 10px 12px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 3px; } .ti.on { border-color: var(--c-navy); box-shadow: inset 3px 0 0 var(--c-navy); } .ti b { font-size: 13.5px; font-weight: 500; } .ti span { font-size: 12px; color: var(--c-muted); } .ti i { font-style: normal; } .ti i.open { color: var(--c-ok); }
.chat { background: #fff; border: 1px solid var(--c-rule); display: flex; flex-direction: column; height: calc(var(--vh100) - 230px); min-height: 460px; } header { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } header div { display: flex; flex-direction: column; flex: 1; } header span:not(.av) { font-size: 12.5px; color: var(--c-muted); }
.ti .ctag, header span.ctag { display: inline-block; align-self: flex-start; font-size: 11px; font-weight: 600; padding: 2px 7px; background: #eef4ff; color: #2c5cc5; } header span.ctag { margin-left: 6px; vertical-align: 1px; } .ctag[data-c="state_notice"], .ctag[data-c="tax_notice"], .ctag[data-c="legal"] { background: #fdecef; color: #b4234a; } .ctag[data-c="bank_notice"], .ctag[data-c="billing"] { background: #fff6e6; color: #a5650b; } .ctag[data-c="mail"] { background: #e8f0f8; color: #235278; } .ctag[data-c="compliance"] { background: #f2ecfd; color: #6b3fc4; }
.av { width: 34px; height: 34px; display: grid; place-items: center; background: var(--c-navy); color: #fff; font-weight: 600; flex: none; } .none { color: var(--c-muted); text-align: center; margin: auto; max-width: 380px; } .btn.sm { padding: 6px 12px; font-size: 13px; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); padding: 0 14px; }
@media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } }
</style>
