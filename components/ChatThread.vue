<script setup lang="ts">
// A conversation: messages by day, attachments, a composer with a paperclip (drag a file onto the chat too).
interface Msg { id: string; from_team: boolean; body: string | null; created_at: string; author: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }
const props = defineProps<{ messages: Msg[]; side: 'team' | 'client'; closed?: boolean; busy?: boolean; uploadUrl: string; downloadBase: string; placeholder?: string }>()
const emit = defineEmits<{ send: [body: string, documentId: string | null] }>()
const text = ref(''); const att = ref<{ id: string; name: string } | null>(null); const up = ref(false); const msg = ref(''); const box = ref<HTMLElement | null>(null); const over = ref(false)
const scroll = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
watch(() => props.messages.length, scroll); onMounted(scroll)
const mine = (m: Msg) => (props.side === 'team' ? m.from_team : !m.from_team)
async function attach(files: File[]) { const f = files[0]; if (!f) return; up.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', f); try { att.value = await $fetch<{ id: string; name: string }>(props.uploadUrl, { method: 'POST', body: fd }) } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { up.value = false } }
function pick(e: Event) { attach(Array.from((e.target as HTMLInputElement).files ?? [])); (e.target as HTMLInputElement).value = '' }
function drop(e: DragEvent) { over.value = false; attach(Array.from(e.dataTransfer?.files ?? [])) }
function send() { if (!text.value.trim() && !att.value) return; emit('send', text.value.trim(), att.value?.id ?? null); text.value = ''; att.value = null }
function key(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
async function open(id: string) { try { const r = await $fetch<{ url: string }>(props.downloadBase + id); window.open(r.url, '_blank') } catch { msg.value = 'Could not open the file.' } }
const dayKey = (d: string) => new Date(d).toDateString()
const dayLabel = (d: string) => { const x = new Date(d); return x.toDateString() === new Date().toDateString() ? 'Today' : x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const initials = (s: string | null) => (s ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
const size = (b: number | null) => (b ? (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB') : '')
</script>
<template>
  <div class="ct" :class="{ over }" @dragover.prevent="over = !closed" @dragleave.prevent="over = false" @drop.prevent="drop">
    <div ref="box" class="th"><slot name="empty"><p v-if="!messages.length" class="none">No messages yet.</p></slot>
      <template v-for="(m, i) in messages" :key="m.id">
        <div v-if="i === 0 || dayKey(messages[i - 1]!.created_at) !== dayKey(m.created_at)" class="day"><span>{{ dayLabel(m.created_at) }}</span></div>
        <div class="row" :class="{ me: mine(m) }"><span v-if="!mine(m)" class="av">{{ initials(m.author) }}</span>
          <div class="bub"><span v-if="!mine(m)" class="who">{{ m.author ?? (m.from_team ? 'Aidi team' : 'Client') }}</span><p v-if="m.body">{{ m.body }}</p>
            <button v-if="m.doc_id" type="button" class="file" @click="open(m.doc_id)"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z" /><path d="M12 3v3h3" /></svg><span><b>{{ m.doc_name }}</b><em>{{ size(m.doc_size) }} · Open</em></span></button>
            <span class="tm">{{ time(m.created_at) }}</span></div></div>
      </template>
      <div v-if="over" class="dropov">Drop to attach</div>
    </div>
    <p v-if="closed" class="closed">This conversation is closed. Sending a message starts a new one.</p>
    <div v-if="att" class="att">📎 {{ att.name }} <button type="button" aria-label="Remove" @click="att = null">×</button></div>
    <form class="cmp" @submit.prevent="send"><label class="clip" :title="up ? 'Uploading…' : 'Attach a file'"><input type="file" @change="pick"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14.5 8.5l-5.8 5.8a2.5 2.5 0 0 1-3.5-3.5l6.4-6.4a1.7 1.7 0 0 1 2.4 2.4l-6.2 6.2" /></svg></label>
      <textarea v-model="text" rows="2" maxlength="5000" :placeholder="up ? 'Uploading…' : placeholder ?? 'Write a message… (Enter to send, Shift+Enter for a new line)'" @keydown="key" /><button class="btn" type="submit" :disabled="busy || up || (!text.trim() && !att)">Send</button></form>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.ct { display: flex; flex-direction: column; min-height: 0; flex: 1; position: relative; } .th { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: var(--c-paper-2); position: relative; }
.none { color: var(--c-muted); text-align: center; margin: auto; max-width: 360px; } .day { text-align: center; margin: 6px 0; } .day span { font-size: 12px; color: var(--c-muted); background: #fff; padding: 3px 10px; border: 1px solid var(--c-rule); }
.row { display: flex; gap: 8px; align-items: flex-end; max-width: 78%; } .row.me { align-self: flex-end; flex-direction: row-reverse; } .av { width: 32px; height: 32px; display: grid; place-items: center; font-size: 11px; font-weight: 600; flex: none; background: var(--c-navy); color: #fff; }
.bub { background: #fff; border: 1px solid var(--c-rule); padding: 9px 13px; display: flex; flex-direction: column; gap: 4px; } .row.me .bub { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.who { font-size: 12px; font-weight: 600; color: var(--c-blue-deep); } .bub p { margin: 0; white-space: pre-wrap; font-size: 14.5px; line-height: 1.5; } .tm { font-size: 11px; color: var(--c-muted); align-self: flex-end; } .row.me .tm { color: rgba(255,255,255,.6); }
.file { display: flex; gap: 10px; align-items: center; background: rgba(28,79,156,.07); border: 1px solid var(--c-rule); padding: 8px 10px; cursor: pointer; font: inherit; text-align: left; color: inherit; } .row.me .file { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.25); }
.file svg { width: 22px; height: 22px; flex: none; } .file span { display: flex; flex-direction: column; } .file b { font-size: 13.5px; font-weight: 500; } .file em { font-style: normal; font-size: 11.5px; opacity: .75; }
.dropov { position: absolute; inset: 8px; border: 2px dashed var(--c-blue-deep); background: rgba(232,240,250,.85); display: grid; place-items: center; font-weight: 500; color: var(--c-blue-deep); pointer-events: none; }
.closed { margin: 0; padding: 8px 16px; font-size: 13px; background: #fbf3e2; color: #7a5410; border-top: 1px solid var(--c-rule); } .att { padding: 6px 16px; font-size: 13px; border-top: 1px solid var(--c-rule); background: #fff; } .att button { background: none; border: 0; cursor: pointer; font-size: 16px; }
.cmp { display: flex; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--c-rule); align-items: flex-end; background: #fff; } .cmp textarea { flex: 1; font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); resize: none; }
.clip { position: relative; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); cursor: pointer; color: var(--c-ink-soft); } .clip:hover { color: var(--c-blue-deep); border-color: var(--c-blue-deep); } .clip input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } .clip svg { width: 18px; height: 18px; } .error { color: var(--c-danger); margin: 6px 14px; }
</style>
