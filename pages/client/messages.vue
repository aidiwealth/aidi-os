<script setup lang="ts">
// Chat with the Aidi team.
useHead({ title: 'Messages' })
const { data, refresh } = await usePortalFetch<{ id: string; from_team: boolean; body: string; created_at: string; author: string | null }[]>('/api/portal/messages')
const thread = computed(() => [...(data.value ?? [])].reverse())
const text = ref(''); const msg = ref(''); const busy = ref(false); const box = ref<HTMLElement | null>(null)
const scroll = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
onMounted(scroll)
async function send() { if (!text.value.trim()) return; busy.value = true; msg.value = ''; try { await $fetch('/api/portal/messages', { method: 'POST', body: { body: text.value } }); text.value = ''; await refresh(); scroll() } catch (e) { msg.value = portalErr(e) } finally { busy.value = false } }
function key(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
const dayKey = (d: string) => new Date(d).toDateString()
const dayLabel = (d: string) => { const t = new Date(); const x = new Date(d); return x.toDateString() === t.toDateString() ? 'Today' : x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const initials = (s: string | null) => (s ?? 'Aidi').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <div class="chat">
      <header><span class="av team">A</span><div><b>Aidi team</b><span>We usually reply within one business day. You also get our replies by email.</span></div></header>
      <div ref="box" class="th">
        <p v-if="!thread.length" class="none">Ask us anything about your company, filings, invoices or an order. We are here to help.</p>
        <template v-for="(m, i) in thread" :key="m.id">
          <div v-if="i === 0 || dayKey(thread[i - 1]!.created_at) !== dayKey(m.created_at)" class="day"><span>{{ dayLabel(m.created_at) }}</span></div>
          <div class="row" :class="{ me: !m.from_team }"><span v-if="m.from_team" class="av team">{{ initials(m.author) }}</span>
            <div class="bub"><span v-if="m.from_team" class="who">{{ m.author ?? 'Aidi team' }}</span><p>{{ m.body }}</p><span class="tm">{{ time(m.created_at) }}</span></div></div>
        </template>
      </div>
      <form class="cmp" @submit.prevent="send"><textarea v-model="text" rows="2" maxlength="5000" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)" @keydown="key" /><button class="btn" type="submit" :disabled="busy || !text.trim()">Send</button></form>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
  </section>
</template>
<style scoped>
.chat { background: #fff; border: 1px solid var(--c-rule); display: flex; flex-direction: column; height: calc(100vh - 230px); min-height: 440px; max-width: 900px; }
header { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--c-rule); } header div { display: flex; flex-direction: column; } header span:not(.av) { font-size: 12.5px; color: var(--c-muted); }
.av { width: 34px; height: 34px; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; } .av.team { background: var(--c-navy); color: #fff; }
.th { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: var(--c-paper-2); } .none { color: var(--c-muted); text-align: center; margin: auto; max-width: 360px; }
.day { text-align: center; margin: 6px 0; } .day span { font-size: 12px; color: var(--c-muted); background: #fff; padding: 3px 10px; border: 1px solid var(--c-rule); }
.row { display: flex; gap: 8px; align-items: flex-end; max-width: 78%; } .row.me { align-self: flex-end; flex-direction: row-reverse; }
.bub { background: #fff; border: 1px solid var(--c-rule); padding: 9px 13px; display: flex; flex-direction: column; } .row.me .bub { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.who { font-size: 12px; font-weight: 600; color: var(--c-blue-deep); } .bub p { margin: 2px 0; white-space: pre-wrap; font-size: 14.5px; line-height: 1.5; } .tm { font-size: 11px; color: var(--c-muted); align-self: flex-end; } .row.me .tm { color: rgba(255,255,255,.65); }
.cmp { display: flex; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--c-rule); align-items: flex-end; } .cmp textarea { flex: 1; font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); resize: none; } .error { color: var(--c-danger); padding: 0 14px; }
</style>
