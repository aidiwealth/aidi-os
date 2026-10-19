<script setup lang="ts">
// AI analyst: a floating button opens a slim chat panel on the right. Closed by default. Conversations are saved:
// "New chat" starts a fresh one, "Chats" lists earlier ones to pick up again; closing the panel keeps the current one.
const brand = useBrand(); const route = useRoute()
const open = ref(false), hint = ref(false), input = ref(''), busy = ref(false), err = ref('')
interface Act { type: string; path?: string; label: string; kind?: string; args?: Record<string, unknown>; summary?: string; done?: boolean }
const msgs = ref<{ role: 'user' | 'assistant'; content: string; actions?: Act[] }[]>([])
const box = ref<HTMLElement | null>(null), ta = ref<HTMLTextAreaElement | null>(null)
const SUGG = computed(() => (brand.key === 'finvry' ? ['How is our runway looking, and what should we do about it?', 'Where do we stand on the raise, and who should we chase?', 'Model a $3M round at $12M pre: how much do we keep?', 'What filings are due soon?'] : ['What needs my attention this week?', 'Which open secondaries fit our thesis best, and why?', 'Which wealth clients hold more risk than their level?', 'Summarise last month across the group']))
const chatId = ref<string | null>(null), view = ref<'chat' | 'list'>('chat')
interface Chat { id: string; title: string; messages: number; updated_at: string }
const chats = ref<Chat[]>([]), listBusy = ref(false)
const remember = (id: string | null) => { try { if (id) localStorage.setItem('analyst_chat', id); else localStorage.removeItem('analyst_chat') } catch { /* storage off */ } }
async function resume(id: string) {
  try { const c = await $fetch<{ id: string; messages: typeof msgs.value }>('/api/ai/chats/' + id); chatId.value = c.id; msgs.value = c.messages; remember(c.id); view.value = 'chat'; err.value = ''; scroll() }
  catch { remember(null) }
}
function newChat() { chatId.value = null; msgs.value = []; err.value = ''; input.value = ''; remember(null); view.value = 'chat'; nextTick(() => ta.value?.focus()) }
async function showList() { view.value = 'list'; listBusy.value = true; try { chats.value = await $fetch<Chat[]>('/api/ai/chats') } catch { chats.value = [] } finally { listBusy.value = false } }
async function delChat(c: Chat) { if (!confirm('Delete "' + c.title + '"?')) return; await $fetch('/api/ai/chats/' + c.id, { method: 'DELETE' }).catch(() => {}); chats.value = chats.value.filter((x) => x.id !== c.id); if (chatId.value === c.id) newChat(); view.value = 'list' }
const when = (s: string) => { const d = new Date(s), n = Date.now() - d.getTime(); return n < 6e4 ? 'just now' : n < 36e5 ? Math.round(n / 6e4) + ' min ago' : n < 864e5 ? Math.round(n / 36e5) + ' h ago' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
// The hint shows once, for a few seconds, then never again: it must not sit over the page.
onMounted(() => { try { if (!localStorage.getItem('analyst_hint')) { setTimeout(() => { hint.value = true; try { localStorage.setItem('analyst_hint', '1') } catch { /* ignore */ } setTimeout(() => (hint.value = false), 7000) }, 1800) } } catch { /* storage off */ } })
function toggle() { open.value = !open.value; hint.value = false; try { localStorage.setItem('analyst_hint', '1') } catch { /* ignore */ } if (open.value) { if (!msgs.value.length) { let id: string | null = null; try { id = localStorage.getItem('analyst_chat') } catch { /* ignore */ } if (id) void resume(id) } nextTick(() => ta.value?.focus()) } }
async function send(q?: string) {
  const text = (q ?? input.value).trim(); if (!text || busy.value) return
  msgs.value.push({ role: 'user', content: text }); input.value = ''; busy.value = true; err.value = ''; scroll()
  try { const r = await $fetch<{ text: string; actions: Act[]; chat_id: string }>('/api/ai/analyst', { method: 'POST', body: { messages: msgs.value.map((m) => ({ role: m.role, content: m.content, actions: m.actions })), path: route.fullPath, chat_id: chatId.value } }); msgs.value.push({ role: 'assistant', content: r.text, actions: r.actions }); chatId.value = r.chat_id; remember(r.chat_id) }
  catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not reach the analyst.' }
  finally { busy.value = false; scroll() }
}
// A proposed action runs only when clicked, and the server checks it again with this person's access.
const actBusy = ref(''), actMsg = ref<Record<string, string>>({})
const akey = (i: number, j: number) => i + ':' + j
async function doAct(i: number, j: number, a: Act) {
  if (!a.kind || a.done || actBusy.value) return
  actBusy.value = akey(i, j)
  try { const r = await $fetch<{ message: string }>('/api/ai/act', { method: 'POST', body: { kind: a.kind, args: a.args ?? {} } }); a.done = true; actMsg.value[akey(i, j)] = r.message }
  catch (e) { actMsg.value[akey(i, j)] = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.' }
  finally { actBusy.value = '' }
}
const inApp = (p?: string) => !!p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\')
function scroll() { nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight }) }
function key(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function md(s: string) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map((l) => (/^\s*#{1,4}\s+/.test(l) ? '<h4>' + l.replace(/^\s*#{1,4}\s+/, '') + '</h4>' : /^\s*([-•]|\d+[.)])\s+/.test(l) ? '<li>' + l.replace(/^\s*([-•]|\d+[.)])\s+/, '') + '</li>' : l ? '<p>' + l + '</p>' : '')).join('').replace(/(<li>.*?<\/li>)+/g, (m) => '<ul>' + m + '</ul>') }
</script>
<template>
  <div class="an" :class="{ open }">
    <transition name="hint"><div v-if="hint && !open" class="hint" @click="toggle"><b>Ask the AI analyst</b><span>{{ brand.key === 'finvry' ? 'Metrics, investors, decks, filings: just ask.' : 'Deals, credit, cash, rentals, meetings: just ask.' }}</span></div></transition>
    <button v-if="!open" type="button" class="fab" aria-label="Open the AI analyst" @click="toggle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" fill="currentColor"/><path d="M18.5 14.5l.8 2.1 2.2.9-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.9z" fill="currentColor" opacity=".7"/></svg></button>
    <aside v-if="open" class="pnl" aria-label="AI analyst">
      <header><span class="ttl"><i />AI analyst</span>
        <span class="hb"><button type="button" class="hbtn" :class="{ on: view === 'list' }" title="Earlier chats" @click="view === 'list' ? (view = 'chat') : showList()"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>Chats</button><button type="button" class="hbtn" title="Start a new chat" @click="newChat"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>New</button><button type="button" class="x" aria-label="Close (the chat is kept)" title="Close (the chat is kept)" @click="toggle">×</button></span></header>
      <div v-if="view === 'list'" class="body lst">
        <p class="lh">Your chats<span>Pick one to continue it.</span></p>
        <p v-if="listBusy" class="muted">Loading…</p>
        <div v-for="c in chats" :key="c.id" class="ci" :class="{ cur: c.id === chatId }"><button type="button" class="cb" @click="resume(c.id)"><b>{{ c.title }}</b><em>{{ when(c.updated_at) }} · {{ Math.ceil(c.messages / 2) }} question{{ Math.ceil(c.messages / 2) === 1 ? '' : 's' }}{{ c.id === chatId ? ' · open now' : '' }}</em></button><button type="button" class="cd" :aria-label="'Delete ' + c.title" title="Delete" @click="delChat(c)">×</button></div>
        <p v-if="!listBusy && !chats.length" class="muted">No saved chats yet. Ask something and it is kept here.</p>
        <button type="button" class="sg nw" @click="newChat">+ Start a new chat</button>
      </div>
      <div v-else ref="box" class="body">
        <div v-if="!msgs.length" class="intro"><p>Ask about your {{ brand.key === 'finvry' ? 'company' : 'group' }}. I look up only what each question needs.</p><button v-for="s in SUGG" :key="s" type="button" class="sg" @click="send(s)">{{ s }}</button></div>
        <div v-for="(m, i) in msgs" :key="i" class="m" :class="m.role"><div v-if="m.role === 'assistant'" class="md" v-html="md(m.content)" /><template v-else>{{ m.content }}</template>
          <div v-if="m.actions?.length" class="acts"><template v-for="(a, j) in m.actions" :key="j"><NuxtLink v-if="a.type === 'open' && inApp(a.path)" :to="a.path!" class="act">{{ a.label }} →</NuxtLink>
            <span v-else-if="a.type === 'do'" class="doa"><button type="button" class="act do" :disabled="a.done || actBusy === akey(i, j)" :title="a.summary" @click="doAct(i, j, a)">{{ a.done ? '✓ ' : '' }}{{ actBusy === akey(i, j) ? 'Working…' : a.label }}</button><em v-if="actMsg[akey(i, j)]">{{ actMsg[akey(i, j)] }}</em><em v-else-if="a.summary && !a.done">{{ a.summary }}. Nothing happens until you click.</em></span></template></div></div>
        <div v-if="busy" class="m assistant typing"><span /><span /><span /></div>
        <p v-if="err" class="err">{{ err }}</p>
      </div>
      <footer v-if="view === 'chat'"><textarea ref="ta" v-model="input" rows="1" placeholder="Ask the analyst…" @keydown="key" /><button type="button" :disabled="busy || !input.trim()" aria-label="Send" @click="send()"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></footer>
      <p class="fine">Looks things up with your access; changes only what you click. Answers can be wrong; check key figures.</p>
    </aside>
  </div>
</template>
<style scoped>
.an { position: fixed; right: 22px; bottom: 22px; z-index: 80; font-family: var(--font-body); }
.fab { width: 52px; height: 52px; border: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 10px 28px rgba(12,26,46,.28); transition: transform .15s; } .fab:hover { transform: translateY(-2px); } .fab svg { width: 24px; height: 24px; }
.hint { position: absolute; right: 64px; bottom: 6px; width: 230px; background: #fff; border: 1px solid var(--c-rule); padding: 10px 12px; box-shadow: 0 10px 28px rgba(12,26,46,.12); cursor: pointer; font-size: 13px; } .hint b { display: block; color: var(--c-ink); } .hint span { color: var(--c-muted); }
.hint-enter-active, .hint-leave-active { transition: opacity .25s, transform .25s; } .hint-enter-from, .hint-leave-to { opacity: 0; transform: translateX(6px); }
.pnl { position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px)); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 20px 60px rgba(12,26,46,.18); display: flex; flex-direction: column; animation: slide .22s ease; }
@keyframes slide { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--c-rule); } .ttl { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--c-ink); } .ttl i { width: 8px; height: 8px; background: #3f85bf; }
.x { background: none; border: 0; font-size: 22px; line-height: 1; color: var(--c-muted); cursor: pointer; margin-left: 4px; }
.hb { display: flex; align-items: center; gap: 4px; } .hbtn { display: flex; align-items: center; gap: 5px; background: none; border: 1px solid transparent; padding: 4px 8px; font: inherit; font-size: 12.5px; color: var(--c-ink-soft); cursor: pointer; } .hbtn:hover, .hbtn.on { border-color: var(--c-rule-strong); color: var(--c-ink); } .hbtn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; }
.lst { gap: 0; } .lh { margin: 0 0 10px; font-weight: 600; color: var(--c-ink); font-size: 14px; display: flex; flex-direction: column; } .lh span { font-weight: 400; font-size: 12.5px; color: var(--c-muted); } .muted { color: var(--c-muted); font-size: 13px; }
.ci { display: flex; align-items: stretch; border-top: 1px solid var(--c-rule); } .ci:last-of-type { border-bottom: 1px solid var(--c-rule); } .ci.cur { background: var(--c-signal-soft); }
.cb { flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 10px 6px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 2px; } .cb b { font-size: 13.5px; font-weight: 500; color: var(--c-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .cb em { font-style: normal; font-size: 12px; color: var(--c-muted); } .cb:hover b { color: var(--c-blue-deep); }
.cd { background: none; border: 0; color: var(--c-muted); font-size: 18px; padding: 0 8px; cursor: pointer; } .cd:hover { color: var(--c-danger); } .nw { margin-top: 12px; }
.body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.intro p { margin: 0 0 10px; color: var(--c-muted); font-size: 13.5px; } .sg { display: block; width: 100%; text-align: left; background: var(--c-paper-2); border: 1px solid transparent; padding: 9px 12px; margin-bottom: 6px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink); } .sg:hover { border-color: var(--c-rule-strong); }
.m { font-size: 14px; line-height: 1.5; max-width: 92%; } .m.user { align-self: flex-end; background: var(--c-navy); color: #fff; padding: 8px 12px; white-space: pre-wrap; } .m.assistant { align-self: flex-start; color: var(--c-ink); }
.md :deep(h4) { margin: 8px 0 4px; font-size: 13.5px; font-weight: 600; } .md :deep(p) { margin: 0 0 6px; } .md :deep(ul) { margin: 4px 0 6px; padding-left: 18px; } .md :deep(li) { margin: 2px 0; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .doa { display: flex; flex-direction: column; gap: 3px; width: 100%; } .doa em { font-style: normal; font-size: 12px; color: var(--c-muted); } .act.do { background: var(--c-navy); color: #fff; border-color: var(--c-navy); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600; align-self: flex-start; } .act.do:disabled { opacity: .7; cursor: default; } .act { font-size: 12.5px; font-weight: 600; text-decoration: none; color: var(--c-blue-deep); border: 1px solid var(--c-rule); padding: 4px 9px; } .act:hover { border-color: var(--c-blue-deep); }
.typing { display: flex; gap: 4px; padding: 6px 0; } .typing span { width: 6px; height: 6px; background: var(--c-muted); animation: dot 1s infinite; } .typing span:nth-child(2) { animation-delay: .15s } .typing span:nth-child(3) { animation-delay: .3s } @keyframes dot { 50% { opacity: .2 } }
.err { color: var(--c-danger); font-size: 13px; margin: 0; }
footer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--c-rule); } textarea { flex: 1; resize: none; font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); max-height: 120px; } footer button { width: 40px; border: 0; background: var(--c-navy); color: #fff; cursor: pointer; display: grid; place-items: center; } footer button:disabled { opacity: .4; } footer svg { width: 18px; height: 18px; }
.fine { margin: 0; padding: 0 12px 10px; font-size: 11px; color: var(--c-muted); }
@media print { .an { display: none; } }
</style>
