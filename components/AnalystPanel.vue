<script setup lang="ts">
// AI analyst: a floating button opens a slim chat panel on the right. Closed by default.
const brand = useBrand(); const route = useRoute()
const open = ref(false), hint = ref(false), input = ref(''), busy = ref(false), err = ref('')
const msgs = ref<{ role: 'user' | 'assistant'; content: string; actions?: { type: string; path: string; label: string }[] }[]>([])
const box = ref<HTMLElement | null>(null), ta = ref<HTMLTextAreaElement | null>(null)
const SUGG = computed(() => (brand.key === 'finvry' ? ['How is our runway looking?', 'Summarise last month for investors', 'What filings are due soon?'] : ['Which deals came in this month?', 'What filings are due in the next 30 days?', 'Summarise Aidi Family holdings']))
onMounted(() => { try { if (!localStorage.getItem('analyst_hint')) { setTimeout(() => (hint.value = true), 1800) } } catch { /* storage off */ } })
function toggle() { open.value = !open.value; hint.value = false; try { localStorage.setItem('analyst_hint', '1') } catch { /* ignore */ } if (open.value) nextTick(() => ta.value?.focus()) }
async function send(q?: string) {
  const text = (q ?? input.value).trim(); if (!text || busy.value) return
  msgs.value.push({ role: 'user', content: text }); input.value = ''; busy.value = true; err.value = ''; scroll()
  try { const r = await $fetch<{ text: string; actions: { type: string; path: string; label: string }[] }>('/api/ai/analyst', { method: 'POST', body: { messages: msgs.value.map((m) => ({ role: m.role, content: m.content })), path: route.fullPath } }); msgs.value.push({ role: 'assistant', content: r.text, actions: r.actions }) }
  catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not reach the analyst.' }
  finally { busy.value = false; scroll() }
}
function scroll() { nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight }) }
function key(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function md(s: string) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map((l) => (/^\s*[-•]\s+/.test(l) ? '<li>' + l.replace(/^\s*[-•]\s+/, '') + '</li>' : l ? '<p>' + l + '</p>' : '')).join('').replace(/(<li>.*?<\/li>)+/g, (m) => '<ul>' + m + '</ul>') }
</script>
<template>
  <div class="an" :class="{ open }">
    <transition name="hint"><div v-if="hint && !open" class="hint" @click="toggle"><b>Ask the AI analyst</b><span>{{ brand.key === 'finvry' ? 'Metrics, investors, filings: just ask.' : 'Deals, portfolio, LPs, filings: just ask.' }}</span></div></transition>
    <button v-if="!open" type="button" class="fab" aria-label="Open the AI analyst" @click="toggle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" fill="currentColor"/><path d="M18.5 14.5l.8 2.1 2.2.9-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.9z" fill="currentColor" opacity=".7"/></svg></button>
    <aside v-if="open" class="pnl" aria-label="AI analyst">
      <header><span class="ttl"><i />AI analyst</span><button type="button" class="x" aria-label="Close" @click="toggle">×</button></header>
      <div ref="box" class="body">
        <div v-if="!msgs.length" class="intro"><p>Ask about your {{ brand.key === 'finvry' ? 'company' : 'group' }}. I look up only what each question needs.</p><button v-for="s in SUGG" :key="s" type="button" class="sg" @click="send(s)">{{ s }}</button></div>
        <div v-for="(m, i) in msgs" :key="i" class="m" :class="m.role"><div v-if="m.role === 'assistant'" class="md" v-html="md(m.content)" /><template v-else>{{ m.content }}</template>
          <div v-if="m.actions?.length" class="acts"><NuxtLink v-for="a in m.actions" :key="a.path" :to="a.path" class="act">{{ a.label }} →</NuxtLink></div></div>
        <div v-if="busy" class="m assistant typing"><span /><span /><span /></div>
        <p v-if="err" class="err">{{ err }}</p>
      </div>
      <footer><textarea ref="ta" v-model="input" rows="1" placeholder="Ask the analyst…" @keydown="key" /><button type="button" :disabled="busy || !input.trim()" aria-label="Send" @click="send()"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></footer>
      <p class="fine">Read-only. Answers can be wrong; check key figures.</p>
    </aside>
  </div>
</template>
<style scoped>
.an { position: fixed; right: 22px; bottom: 22px; z-index: 80; font-family: var(--font-body); }
.fab { width: 52px; height: 52px; border: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 10px 28px rgba(12,26,46,.28); transition: transform .15s; } .fab:hover { transform: translateY(-2px); } .fab svg { width: 24px; height: 24px; }
.hint { position: absolute; right: 64px; bottom: 6px; width: 230px; background: #fff; border: 1px solid var(--c-rule); padding: 10px 12px; box-shadow: 0 10px 28px rgba(12,26,46,.12); cursor: pointer; font-size: 13px; } .hint b { display: block; color: var(--c-ink); } .hint span { color: var(--c-muted); }
.hint-enter-active, .hint-leave-active { transition: opacity .25s, transform .25s; } .hint-enter-from, .hint-leave-to { opacity: 0; transform: translateX(6px); }
.pnl { position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(400px, calc(100vw - 24px)); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 20px 60px rgba(12,26,46,.18); display: flex; flex-direction: column; animation: slide .22s ease; }
@keyframes slide { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--c-rule); } .ttl { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--c-ink); } .ttl i { width: 8px; height: 8px; background: #3fbf7f; }
.x { background: none; border: 0; font-size: 22px; line-height: 1; color: var(--c-muted); cursor: pointer; }
.body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.intro p { margin: 0 0 10px; color: var(--c-muted); font-size: 13.5px; } .sg { display: block; width: 100%; text-align: left; background: var(--c-paper-2); border: 1px solid transparent; padding: 9px 12px; margin-bottom: 6px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink); } .sg:hover { border-color: var(--c-rule-strong); }
.m { font-size: 14px; line-height: 1.5; max-width: 92%; } .m.user { align-self: flex-end; background: var(--c-navy); color: #fff; padding: 8px 12px; white-space: pre-wrap; } .m.assistant { align-self: flex-start; color: var(--c-ink); }
.md :deep(p) { margin: 0 0 6px; } .md :deep(ul) { margin: 4px 0 6px; padding-left: 18px; } .md :deep(li) { margin: 2px 0; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .act { font-size: 12.5px; font-weight: 600; text-decoration: none; color: var(--c-blue-deep); border: 1px solid var(--c-rule); padding: 4px 9px; } .act:hover { border-color: var(--c-blue-deep); }
.typing { display: flex; gap: 4px; padding: 6px 0; } .typing span { width: 6px; height: 6px; background: var(--c-muted); animation: dot 1s infinite; } .typing span:nth-child(2) { animation-delay: .15s } .typing span:nth-child(3) { animation-delay: .3s } @keyframes dot { 50% { opacity: .2 } }
.err { color: var(--c-danger); font-size: 13px; margin: 0; }
footer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--c-rule); } textarea { flex: 1; resize: none; font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); max-height: 120px; } footer button { width: 40px; border: 0; background: var(--c-navy); color: #fff; cursor: pointer; display: grid; place-items: center; } footer button:disabled { opacity: .4; } footer svg { width: 18px; height: 18px; }
.fine { margin: 0; padding: 0 12px 10px; font-size: 11px; color: var(--c-muted); }
@media print { .an { display: none; } }
</style>
