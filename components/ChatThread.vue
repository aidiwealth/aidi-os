<script setup lang="ts">
import { MSG_CATEGORIES } from '~/shared/message-categories'
import { mdRender } from '~/shared/markdown'
// A conversation: messages by day, attachments, a composer with a paperclip (drag a file onto the chat too).
interface Msg { category?: string | null; id: string; from_team: boolean; body: string | null; created_at: string; author: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }
const props = defineProps<{ messages: Msg[]; side: 'team' | 'client'; closed?: boolean; busy?: boolean; uploadUrl: string; downloadBase: string; placeholder?: string; defaultCategory?: string }>()
const emit = defineEmits<{ send: [body: string, documentId: string | null, category: string] }>()
// The team can label a message (state notice, bank notice, mail received…); clients see the label as a tag.
const cat = ref(props.defaultCategory || 'general')
watch(() => props.defaultCategory, (c) => { cat.value = c || 'general' })
const text = ref(''); const att = ref<{ id: string; name: string } | null>(null); const up = ref(false); const msg = ref(''); const box = ref<HTMLElement | null>(null); const over = ref(false)
const scroll = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
watch(() => props.messages.length, scroll); onMounted(scroll)
const mine = (m: Msg) => (props.side === 'team' ? m.from_team : !m.from_team)
async function attach(files: File[]) { const f = files[0]; if (!f) return; up.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', f); try { att.value = await $fetch<{ id: string; name: string }>(props.uploadUrl, { method: 'POST', body: fd }) } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { up.value = false } }
const dragOver = ref(false)
function dropFiles(e: DragEvent) { dragOver.value = false; const fs = Array.from(e.dataTransfer?.files ?? []); if (fs.length) attach(fs) }
function pick(e: Event) { attach(Array.from((e.target as HTMLInputElement).files ?? [])); (e.target as HTMLInputElement).value = '' }
function drop(e: DragEvent) { over.value = false; attach(Array.from(e.dataTransfer?.files ?? [])) }
const hasText = computed(() => text.value.replace(/[\s\u00a0]|&nbsp;|<br\s*\/?>/g, '').length > 0)
function send() { if (!hasText.value && !att.value) return; emit('send', hasText.value ? text.value.trim() : '', att.value?.id ?? null, cat.value); text.value = ''; att.value = null; cat.value = props.defaultCategory || 'general' }
function key(e: KeyboardEvent) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }
// Messages are written in the rich editor (Markdown); older plain-text messages keep their line breaks.
const rich = (s: string) => mdRender(s.includes('\n\n') || /^\s*([-*]|\d+\.|#|>)\s/m.test(s) ? s : s.replace(/\n/g, '  \n'))
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
          <div class="bub"><span v-if="m.category && m.category !== 'general' && m.category !== defaultCategory" class="ctag" :data-c="m.category">{{ MSG_CATEGORIES[m.category] ?? m.category }}</span><span v-if="!mine(m)" class="who">{{ m.author ?? (m.from_team ? 'Aidi team' : 'Client') }}</span><div v-if="m.body" class="mdb" v-html="rich(m.body)" />
            <button v-if="m.doc_id" type="button" class="file" @click="open(m.doc_id)"><FileBadge :name="m.doc_name" /><span class="fx"><b>{{ m.doc_name }}</b><em>{{ size(m.doc_size) }} · Open</em></span></button>
            <span class="tm">{{ time(m.created_at) }}</span></div></div>
      </template>
      <div v-if="over" class="dropov">Drop to attach</div>
    </div>
    <p v-if="closed" class="closed">This conversation is closed. Sending a message starts a new one.</p>
    <div v-if="att" class="att"><FileBadge :name="att.name" size="sm" /> {{ att.name }} <button type="button" aria-label="Remove" @click="att = null">×</button></div>
    <div v-if="side === 'team'" class="cbar"><label>Type<select v-model="cat" aria-label="Message type"><option v-for="(l, k) in MSG_CATEGORIES" :key="k" :value="k">{{ l }}</option></select></label><span v-if="cat !== 'general'" class="ctag" :data-c="cat">{{ MSG_CATEGORIES[cat] }}</span><span v-if="cat !== 'general'" class="hint">Shown to the client and in the email subject</span></div>
    <form class="cmp" :class="{ dragover: dragOver }" @submit.prevent="send" @dragenter.prevent="dragOver = true" @dragover.prevent="dragOver = true" @dragleave.self.prevent="dragOver = false" @drop.prevent="dropFiles"><label class="clip" :title="up ? 'Uploading…' : 'Attach a file'"><input type="file" @change="pick"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14.5 8.5l-5.8 5.8a2.5 2.5 0 0 1-3.5-3.5l6.4-6.4a1.7 1.7 0 0 1 2.4 2.4l-6.2 6.2" /></svg></label>
      <div class="ed" @keydown="key"><ClientOnly><RichEditor v-model="text" compact minimal :min-height="70" :max-length="5000" :placeholder="up ? 'Uploading…' : placeholder ?? 'Write a message or drop files to attach… (⌘/Ctrl + Enter to send)'" /><template #fallback><textarea rows="3" disabled /></template></ClientOnly></div><button class="btn" type="submit" :disabled="busy || up || (!hasText && !att)">Send</button></form>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.ct { display: flex; flex-direction: column; min-height: 0; flex: 1; position: relative; } .th { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: var(--c-paper-2); position: relative; }
.none { color: var(--c-muted); text-align: center; margin: auto; max-width: 360px; } .day { text-align: center; margin: 6px 0; } .day span { font-size: 12px; color: var(--c-muted); background: #fff; padding: 3px 10px; border: 1px solid var(--c-rule); }
.row { display: flex; gap: 8px; align-items: flex-end; max-width: 78%; } .row.me { align-self: flex-end; flex-direction: row-reverse; } .av { width: 32px; height: 32px; display: grid; place-items: center; font-size: 11px; font-weight: 600; flex: none; background: var(--c-navy); color: #fff; }
.bub { background: #fff; border: 1px solid var(--c-rule); padding: 9px 13px; display: flex; flex-direction: column; gap: 4px; } .row.me .bub { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.who { font-size: 12px; font-weight: 600; color: var(--c-blue-deep); } .mdb { font-size: 14.5px; line-height: 1.5; } .mdb :deep(p) { margin: 0 0 6px; } .mdb :deep(p:last-child) { margin: 0; } .mdb :deep(ul), .mdb :deep(ol) { margin: 2px 0 6px; padding-left: 20px; } .mdb :deep(a) { color: var(--c-blue-deep); } .row.me .mdb :deep(a) { color: #cfe0ff; } .mdb :deep(blockquote) { margin: 0 0 6px; padding-left: 10px; border-left: 3px solid currentColor; opacity: .85; } .mdb :deep(h2), .mdb :deep(h3), .mdb :deep(h4) { font-size: 15px; margin: 4px 0; } .tm { font-size: 11px; color: var(--c-muted); align-self: flex-end; } .row.me .tm { color: rgba(255,255,255,.6); }
.file { display: flex; gap: 10px; align-items: center; background: rgba(28,79,156,.07); border: 1px solid var(--c-rule); padding: 8px 10px; cursor: pointer; font: inherit; text-align: left; color: inherit; } .row.me .file { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.25); }
.file svg { width: 22px; height: 22px; flex: none; } .file span:not(.fb) { display: flex; flex-direction: column; min-width: 0; } .file b { font-size: 13.5px; font-weight: 500; } .file em { font-style: normal; font-size: 11.5px; opacity: .75; }
.dropov { position: absolute; inset: 8px; border: 2px dashed var(--c-blue-deep); background: rgba(232,240,250,.85); display: grid; place-items: center; font-weight: 500; color: var(--c-blue-deep); pointer-events: none; }
.closed { margin: 0; padding: 8px 16px; font-size: 13px; background: #fbf3e2; color: #7a5410; border-top: 1px solid var(--c-rule); } .att { padding: 6px 16px; font-size: 13px; border-top: 1px solid var(--c-rule); background: #fff; } .att button { background: none; border: 0; cursor: pointer; font-size: 16px; }
.cmp { display: flex; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--c-rule); align-items: flex-end; background: #fff; } .ed { flex: 1; min-width: 0; } .ed textarea { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--c-rule-strong); }
.clip { position: relative; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); cursor: pointer; color: var(--c-ink-soft); } .clip:hover { color: var(--c-blue-deep); border-color: var(--c-blue-deep); } .clip input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } .clip svg { width: 18px; height: 18px; } .error { color: var(--c-danger); margin: 6px 14px; }
.ctag { display: inline-block; align-self: flex-start; font-size: 11.5px; font-weight: 600; padding: 2px 8px; margin-bottom: 4px; background: #eef4ff; color: #2c5cc5; } .ctag[data-c="state_notice"], .ctag[data-c="tax_notice"], .ctag[data-c="legal"] { background: #fdecef; color: #b4234a; } .ctag[data-c="bank_notice"], .ctag[data-c="billing"] { background: #fff6e6; color: #a5650b; } .ctag[data-c="mail"] { background: #e9f6ee; color: #23784a; }
.cbar + .cmp { border-top: 0; } .cbar { display: flex; gap: 10px; align-items: center; padding: 8px 16px 0; border-top: 1px solid var(--c-rule); background: #fff; flex-wrap: wrap; } .cbar label { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--c-muted); } .cbar select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); background: #fff; } .cbar .ctag { margin: 0; } .cbar .hint { font-size: 12px; color: var(--c-muted); }
.cmp.dragover { outline: 2px dashed var(--c-blue-deep); outline-offset: 2px; }
</style>
