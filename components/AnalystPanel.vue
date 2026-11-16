<script setup lang="ts">
// AI analyst: a floating button opens a slim chat panel on the right. Closed by default. Conversations are saved:
// "New chat" starts a fresh one, "Chats" lists earlier ones to pick up again; closing the panel keeps the current one.
const brand = useBrand(); const route = useRoute()
const aj = useAiJob<{ text: string; actions: Act[]; chat_id: string }>()
const open = ref(false), hint = ref(false), input = ref(''), busy = ref(false), err = ref('')
interface Act { type: string; path?: string; label: string; kind?: string; args?: Record<string, unknown>; summary?: string; done?: boolean }
const msgs = ref<{ role: 'user' | 'assistant'; content: string; actions?: Act[] }[]>([])
const box = ref<HTMLElement | null>(null), ta = ref<HTMLTextAreaElement | null>(null)
const SUGG = computed(() => (brand.key === 'finvry' ? ['How is our runway looking, and what should we do about it?', 'Where do we stand on the raise, and who should we chase?', 'Model a $3M round at $12M pre: how much do we keep?', 'What filings are due soon?'] : ['What needs my attention this week?', 'Which open secondaries fit our thesis best, and why?', 'Which wealth clients hold more risk than their level?', 'Summarise last month across the group']))
const chatId = ref<string | null>(null), view = ref<'home' | 'chat' | 'list'>('home')
interface Chat { id: string; title: string; messages: number; updated_at: string }
const chats = ref<Chat[]>([]), listBusy = ref(false)
const remember = (id: string | null) => { try { if (id) localStorage.setItem('analyst_chat', id); else localStorage.removeItem('analyst_chat') } catch { /* storage off */ } }
async function resume(id: string) {
  try { const c = await $fetch<{ id: string; messages: typeof msgs.value }>('/api/ai/chats/' + id); chatId.value = c.id; msgs.value = c.messages; remember(c.id); view.value = 'chat'; err.value = ''; scroll() }
  catch { remember(null) }
}
function newChat() { chatId.value = null; msgs.value = []; err.value = ''; input.value = ''; remember(null); view.value = 'chat'; nextTick(() => ta.value?.focus()) }
// Home: the latest chat to pick up, loaded when home opens.
const recent = ref<Chat | null>(null)
async function showHome() { view.value = 'home'; try { recent.value = (await $fetch<Chat[]>('/api/ai/chats'))[0] ?? null } catch { recent.value = null } }
function ask(q: string) { newChat(); void send(q) }
async function showList() { view.value = 'list'; listBusy.value = true; try { chats.value = await $fetch<Chat[]>('/api/ai/chats') } catch { chats.value = [] } finally { listBusy.value = false } }
async function delChat(c: Chat) { if (!await askConfirm('Delete "' + c.title + '"?')) return; await $fetch('/api/ai/chats/' + c.id, { method: 'DELETE' }).catch(() => {}); chats.value = chats.value.filter((x) => x.id !== c.id); if (chatId.value === c.id) newChat(); view.value = 'list' }
const when = (s: string) => { const d = new Date(s), n = Date.now() - d.getTime(); return n < 6e4 ? 'just now' : n < 36e5 ? Math.round(n / 6e4) + ' min ago' : n < 864e5 ? Math.round(n / 36e5) + ' h ago' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
// The greeting card introduces the AI (the same design as on finvry.com): it appears above the button shortly after
// each page load, with a "1" on the button, and stays until the chat is opened. Its × hides it for this browser tab.
const aiName = computed(() => (brand.key === 'finvry' ? 'Finvry AI' : 'Aidi AI'))
const HINT = 'analyst_hint_s'
onMounted(() => { let seen = false; try { seen = !!sessionStorage.getItem(HINT) } catch { /* storage off */ } if (!seen) setTimeout(() => { if (!open.value) hint.value = true }, 1500) })
function dismissHint() { hint.value = false; try { sessionStorage.setItem(HINT, '1') } catch { /* ignore */ } }
function toggle() { open.value = !open.value; hint.value = false; if (open.value) { if (msgs.value.length) { view.value = 'chat'; nextTick(() => ta.value?.focus()) } else void showHome() } }
async function send(q?: string) {
  const text = (q ?? input.value).trim(); if (!text || busy.value) return
  msgs.value.push({ role: 'user', content: text }); input.value = ''; busy.value = true; err.value = ''; scroll()
  try { const { job } = await $fetch<{ job: string }>('/api/ai/analyst', { method: 'POST', body: { messages: msgs.value.map((m) => ({ role: m.role, content: m.content, actions: m.actions })), path: route.fullPath, chat_id: chatId.value } })
    const r = await aj.follow(job); if (!r) throw { data: { data: { error: { message: aj.fail.value?.message ?? 'The analyst could not answer. Try again.' } } } }; msgs.value.push({ role: 'assistant', content: r.text, actions: r.actions }); chatId.value = r.chat_id; remember(r.chat_id) }
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
// Full Markdown, as everywhere else in the app: headings, lists, links and tables (an answer comparing months or
// options can come back as a table).
function md(s: string) { return renderMarkdown(s) }
</script>
<template>
  <div class="an" :class="{ open }">
    <transition name="hint"><div v-if="hint && !open" class="hint" role="button" tabindex="0" @click="toggle" @keydown.enter="toggle">
      <button type="button" class="hx" aria-label="Dismiss" @click.stop="dismissHint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" /></svg></button>
      <span class="hav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg></span>
      <span class="htx"><b>Hi there 👋</b><span>You are speaking with {{ aiName }}. How can I help?</span><em>{{ aiName }} · Just now</em></span>
    </div></transition>
    <button v-if="!open" type="button" class="fab" :aria-label="'Open ' + aiName" @click="toggle"><i v-if="hint" class="badge">1</i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 10.5c1.9 1.6 5.1 1.6 7 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    <aside v-if="open" class="pnl" :aria-label="aiName">
      <!-- Home: greeting, ask, the latest chat, suggested questions -->
      <div v-if="view === 'home'" class="home">
        <div class="hero"><div class="top"><BrandMark light /><button type="button" class="ix" aria-label="Close" @click="toggle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" /></svg></button></div><h2><span>Hello there.</span>What can I help with?</h2></div>
        <div class="cards">
          <button type="button" class="card ask" @click="newChat"><span><b>Ask a question</b><em>{{ aiName }} looks up only what each question needs</em></span><i>→</i></button>
          <div v-if="recent" class="card col"><p class="k">Pick up where you left off</p><button type="button" class="row" @click="resume(recent.id)"><span class="av"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg></span><span class="rt"><b>{{ recent.title }}</b><em>{{ when(recent.updated_at) }} · {{ Math.ceil(recent.messages / 2) }} question{{ Math.ceil(recent.messages / 2) === 1 ? '' : 's' }}</em></span><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" /></svg></i></button></div>
          <div class="card col"><p class="k">Try asking</p><button v-for="q in SUGG" :key="q" type="button" class="li" @click="ask(q)"><span>{{ q }}</span><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" /></svg></i></button></div>
        </div>
      </div>
      <!-- Chats: every saved conversation -->
      <div v-else-if="view === 'list'" class="body lst">
        <p class="lh">Your chats<span>Pick one to continue it.</span></p>
        <p v-if="listBusy" class="muted">Loading…</p>
        <div v-for="c in chats" :key="c.id" class="ci" :class="{ cur: c.id === chatId }"><button type="button" class="cb" @click="resume(c.id)"><b>{{ c.title }}</b><em>{{ when(c.updated_at) }} · {{ Math.ceil(c.messages / 2) }} question{{ Math.ceil(c.messages / 2) === 1 ? '' : 's' }}{{ c.id === chatId ? ' · open now' : '' }}</em></button><button type="button" class="cd" :aria-label="'Delete ' + c.title" title="Delete" @click="delChat(c)">×</button></div>
        <p v-if="!listBusy && !chats.length" class="muted">No saved chats yet. Ask something and it is kept here.</p>
        <button type="button" class="sg nw" @click="newChat">+ Start a new chat</button>
      </div>
      <!-- A conversation -->
      <template v-else>
        <header class="ch"><button type="button" class="ib" aria-label="Back" @click="showHome"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" /></svg></button><span class="av"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg></span><span class="tt"><b>{{ aiName }}</b><em>Uses your access · changes only what you click</em></span><button type="button" class="ib" title="Start a new chat" aria-label="Start a new chat" @click="newChat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" /></svg></button><button type="button" class="ib" aria-label="Close (the chat is kept)" title="Close (the chat is kept)" @click="toggle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" /></svg></button></header>
        <div ref="box" class="body">
          <div class="m assistant greet"><div class="md"><p>Hi. Ask me about your {{ brand.key === 'finvry' ? 'company' : 'group' }}: numbers, investors, filings or what to do next.</p></div><em class="who">{{ aiName }}</em></div>
          <div v-if="!msgs.length" class="intro"><button v-for="q in SUGG" :key="q" type="button" class="sg" @click="send(q)">{{ q }}</button></div>
        <div v-for="(m, i) in msgs" :key="i" class="m" :class="m.role"><div v-if="m.role === 'assistant'" class="md" v-html="md(m.content)" /><template v-else>{{ m.content }}</template>
          <div v-if="m.actions?.length" class="acts"><template v-for="(a, j) in m.actions" :key="j"><NuxtLink v-if="a.type === 'open' && inApp(a.path)" :to="a.path!" class="act">{{ a.label }} →</NuxtLink>
            <span v-else-if="a.type === 'do'" class="doa"><button type="button" class="act do" :disabled="a.done || actBusy === akey(i, j)" :title="a.summary" @click="doAct(i, j, a)">{{ a.done ? '✓ ' : '' }}{{ actBusy === akey(i, j) ? 'Working…' : a.label }}</button><em v-if="actMsg[akey(i, j)]">{{ actMsg[akey(i, j)] }}</em><em v-else-if="a.summary && !a.done">{{ a.summary }}. Nothing happens until you click.</em></span></template></div></div>
        <div v-if="busy" class="m assistant thinking"><AiThinking compact :steps="['Thinking…', 'Looking at your data…', 'Checking the numbers…', 'Writing the answer…']" /></div>
        <p v-if="err" class="err">{{ err }}</p>
        </div>
        <footer><div class="inbox"><textarea ref="ta" v-model="input" rows="1" :placeholder="'Ask ' + aiName + '…'" @keydown="key" /><button type="button" :disabled="busy || !input.trim()" aria-label="Send" @click="send()"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div></footer>
        <p class="fine">Answers can be wrong; check key figures before you act.</p>
      </template>
      <nav v-if="view !== 'chat'" class="tabs"><button type="button" :class="{ on: view === 'home' }" @click="showHome"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Home</span></button><button type="button" :class="{ on: view === 'list' }" @click="showList"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" stroke="currentColor" stroke-width="1.8"/></svg><span>Chats</span></button></nav>
    </aside>
  </div>
</template>
<style scoped>
.an { position: fixed; right: 22px; bottom: 22px; z-index: 80; font-family: var(--font-body); }
.fab { width: 58px; height: 58px; border: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 14px 34px rgba(12,26,46,.3); transition: transform .15s; } .fab:hover { transform: translateY(-2px); } .fab svg { width: 26px; height: 26px; }
/* Greeting card above the button, the same design as on finvry.com */
.hint { position: absolute; right: 0; bottom: 72px; width: 330px; max-width: calc(100vw - 44px); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 18px 44px rgba(12,26,46,.16); padding: 18px 18px 16px; display: flex; gap: 14px; cursor: pointer; }
.hav { width: 38px; height: 38px; flex: none; background: var(--c-navy); color: #a1bdd4; display: grid; place-items: center; } .hav svg { width: 18px; height: 18px; }
.htx { display: flex; flex-direction: column; gap: 5px; font-size: 15px; line-height: 1.45; color: var(--c-ink); } .htx b { font-weight: 600; } .htx em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.fab { position: relative; } .badge { position: absolute; top: -7px; right: -7px; min-width: 22px; height: 22px; background: #c0392b; color: #fff; font-style: normal; font-size: 12px; font-weight: 700; display: grid; place-items: center; border: 2px solid #fff; }
.hx { position: absolute; top: -12px; right: -12px; width: 26px; height: 26px; background: #fff; border: 1px solid var(--c-rule); color: var(--c-muted); display: grid; place-items: center; cursor: pointer; padding: 0; } .hx svg { width: 12px; height: 12px; }
.hint-enter-active, .hint-leave-active { transition: opacity .25s, transform .25s; } .hint-enter-from, .hint-leave-to { opacity: 0; transform: translateY(6px); }
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
.md :deep(h2), .md :deep(h3), .md :deep(h4) { margin: 8px 0 4px; font-size: 13.5px; font-weight: 600; } .md :deep(table) { font-size: 12.5px !important; margin: 6px 0 10px !important; display: block; overflow-x: auto; max-width: 100%; } .md :deep(th), .md :deep(td) { padding: 5px 8px !important; white-space: nowrap; } .md :deep(ol) { margin: 4px 0 6px; padding-left: 18px; } .md :deep(a) { color: var(--c-blue-deep); } .md :deep(p) { margin: 0 0 6px; } .md :deep(ul) { margin: 4px 0 6px; padding-left: 18px; } .md :deep(li) { margin: 2px 0; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .doa { display: flex; flex-direction: column; gap: 3px; width: 100%; } .doa em { font-style: normal; font-size: 12px; color: var(--c-muted); } .act.do { background: var(--c-navy); color: #fff; border-color: var(--c-navy); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600; align-self: flex-start; } .act.do:disabled { opacity: .7; cursor: default; } .act { font-size: 12.5px; font-weight: 600; text-decoration: none; color: var(--c-blue-deep); border: 1px solid var(--c-rule); padding: 4px 9px; } .act:hover { border-color: var(--c-blue-deep); }
.typing { display: flex; gap: 4px; padding: 6px 0; } .typing span { width: 6px; height: 6px; background: var(--c-muted); animation: dot 1s infinite; } .typing span:nth-child(2) { animation-delay: .15s } .typing span:nth-child(3) { animation-delay: .3s } @keyframes dot { 50% { opacity: .2 } }
.err { color: var(--c-danger); font-size: 13px; margin: 0; }
footer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--c-rule); } textarea { flex: 1; resize: none; font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); max-height: 120px; } footer button { width: 40px; border: 0; background: var(--c-navy); color: #fff; cursor: pointer; display: grid; place-items: center; } footer button:disabled { opacity: .4; } footer svg { width: 18px; height: 18px; }
.fine { margin: 0; padding: 0 12px 10px; font-size: 11px; color: var(--c-muted); }
/* Panel, in the style of the finvry.com messenger: a home view, chats, and the conversation */
.pnl { overflow: hidden; }
.home { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.hero { background: linear-gradient(180deg, var(--c-navy) 0%, #13243b 70%, #1c3352 100%); color: #fff; padding: 20px 22px 70px; }
.hero .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
.hero h2 { margin: 0; font-family: var(--font-body); font-size: 28px; line-height: 1.15; letter-spacing: -.02em; font-weight: 600; display: flex; flex-direction: column; color: #fff; } .hero h2 span { color: #a1bdd4; }
.ix, .ib { background: none; border: 0; color: inherit; width: 32px; height: 32px; display: grid; place-items: center; cursor: pointer; padding: 0; } .ix svg, .ib svg { width: 18px; height: 18px; }
.cards { margin-top: -48px; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.card { background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 4px 14px rgba(12,26,46,.06); padding: 15px 16px; text-align: left; font: inherit; color: var(--c-ink); display: flex; align-items: center; gap: 12px; }
.card.ask { cursor: pointer; } .card.ask:hover { border-color: var(--c-rule-strong); } .card.ask > span { flex: 1; display: flex; flex-direction: column; gap: 2px; } .card b { font-size: 15px; font-weight: 600; color: var(--c-navy); } .card em { font-style: normal; font-size: 13px; color: var(--c-muted); } .card.ask i { font-style: normal; font-size: 18px; color: var(--c-navy); }
.card.col { flex-direction: column; align-items: stretch; padding: 12px 6px 6px; gap: 0; } .k { margin: 0 10px 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.row, .li { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: 0; padding: 9px 10px; font: inherit; text-align: left; cursor: pointer; color: var(--c-ink); } .row:hover, .li:hover { background: var(--c-paper-2); }
.row i, .li i { color: var(--c-muted); display: flex; } .row i svg, .li i svg { width: 15px; height: 15px; } .li { justify-content: space-between; font-size: 14px; line-height: 1.4; }
.rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .rt b { font-size: 14px; font-weight: 600; color: var(--c-navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .rt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.av { width: 34px; height: 34px; flex: none; background: var(--c-navy); color: #a1bdd4; display: grid; place-items: center; } .av svg { width: 16px; height: 16px; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--c-rule); background: #fff; } .tabs button { background: none; border: 0; padding: 10px 0 9px; font: inherit; font-size: 12.5px; color: var(--c-muted); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; } .tabs button.on { color: var(--c-navy); font-weight: 600; } .tabs svg { width: 21px; height: 21px; }
.ch { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 6px; border-bottom: 1px solid var(--c-rule); } .ch .ib { color: var(--c-navy); }
.tt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tt b { font-size: 15px; color: var(--c-navy); } .tt em { font-style: normal; font-size: 12px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m.assistant { background: var(--c-paper-2); padding: 10px 13px; } .m.assistant.thinking { background: none; padding: 0; } .greet { display: flex; flex-direction: column; gap: 4px; } .greet .md p { margin: 0; } .who { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
.inbox { flex: 1; display: flex; gap: 8px; align-items: flex-end; border: 1.5px solid var(--c-rule-strong); padding: 6px 6px 6px 12px; background: #fff; transition: border-color .15s, box-shadow .15s; } .inbox:focus-within { border-color: var(--c-navy); box-shadow: 0 0 0 3px var(--c-signal-soft); }
.inbox textarea, .inbox textarea:focus { border: 0 !important; box-shadow: none !important; outline: none; padding: 7px 0; background: none; border-radius: 0; } .inbox button { width: 38px; height: 38px; flex: none; background: var(--c-navy); } .inbox button:disabled { opacity: .5; }
@media print { .an { display: none; } }
.thinking :deep(.ait) { margin: 0; }
</style>
