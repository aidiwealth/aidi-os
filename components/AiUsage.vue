<script setup lang="ts">
// Settings → AI usage: session and weekly meters (like Claude), credits, packs and usage history.
interface U { limited: boolean; session: { used: number; limit: number | null; resets_at: string | null }; weekly: { used: number; limit: number | null; resets_at: string }; credits: number; over: boolean; blocked: boolean
  plan: string; currency: string; wallet_minor: number; packs: { key: string; tokens: number; usd: number; ngn: number; label: string }[]; days: { day: string; tokens: number }[]; tasks: { task: string; runs: number; tokens: number }[]; purchases: { pack: string; tokens: number; amount_minor: number; currency: string; created_at: string }[] }
const usageUrl: string = '/api/ai/usage'
const { data, refresh } = await useFetch<U>(usageUrl)
const pct = (u: number, l: number | null) => (l ? Math.min(100, Math.round((u / l) * 100)) : 0)
const left = (iso: string | null) => { if (!iso) return 'Starts with your next AI action'; const m = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000)); return 'Resets in ' + (m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m + ' min') }
const wkday = (iso: string) => 'Resets ' + new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
const tok = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n)))
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const price = (p: { usd: number; ngn: number }) => (data.value?.currency === 'NGN' ? '₦' + p.ngn.toLocaleString() : '$' + p.usd)
const TASK: Record<string, string> = { investor_update: 'Investor updates', deal_memo: 'Deal memo', financials_extract: 'Reading spreadsheets', pitch_screen: 'Pitch screening' }
const tname = (t: string) => TASK[t] ?? (t.startsWith('docgen_') ? 'Documents' : t.replace(/_/g, ' '))
const slots = computed(() => { const m = new Map((data.value?.days ?? []).map((d) => [d.day, d.tokens])); return Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10); return { day: d, tokens: m.get(d) ?? 0 } }) })
const max = computed(() => Math.max(1, ...slots.value.map((d) => d.tokens)))
const msg = ref(''); const ok = ref(''); const busy = ref('')
async function buy(k: string) { busy.value = k; msg.value = ''; ok.value = ''; try { await $fetch('/api/ai/credits', { method: 'POST', body: { pack: k } }); ok.value = 'Credits added.'; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not buy credits.' } finally { busy.value = '' } }
</script>
<template>
  <div v-if="data" class="au">
    <div class="card"><h2>AI usage</h2><p class="mut">AI drafts your investor updates, memos and documents and reads your spreadsheets. Your plan includes an allowance per 5-hour session and per week. When you reach either, AI credits keep you going; without credits, AI pauses until the reset.</p>
      <template v-if="data.limited">
        <div class="meter"><div class="mh"><b>Current session</b><span>{{ left(data.session.resets_at) }}</span></div><div class="bar"><i :class="{ hot: pct(data.session.used, data.session.limit) >= 90 }" :style="{ width: pct(data.session.used, data.session.limit) + '%' }" /></div><span class="pc">{{ pct(data.session.used, data.session.limit) }}% used</span></div>
        <div class="meter"><div class="mh"><b>Weekly limit</b><span>{{ wkday(data.weekly.resets_at) }}</span></div><div class="bar"><i :class="{ hot: pct(data.weekly.used, data.weekly.limit) >= 90 }" :style="{ width: pct(data.weekly.used, data.weekly.limit) + '%' }" /></div><span class="pc">{{ pct(data.weekly.used, data.weekly.limit) }}% used</span></div>
        <p v-if="data.blocked" class="warn">AI is paused until your allowance resets. Buy credits below to continue now.</p><p v-else-if="data.over" class="note">You are over your plan allowance; AI is now using your credits.</p>
      </template>
      <p v-else class="okm">Unlimited AI on your plan.</p></div>
    <div v-if="data.limited" class="card"><div class="ch"><h3>AI credits</h3><b class="cr">{{ tok(data.credits) }} tokens</b></div><p class="mut">Used only after your plan allowance runs out. Credits don't expire. Paid from your wallet ({{ SYM[data.currency] ?? '' }}{{ (data.wallet_minor / 100).toLocaleString('en-US') }} available · <NuxtLink to="/wallet">top up</NuxtLink>).</p>
      <div class="packs"><div v-for="p in data.packs" :key="p.key" class="pk"><b>{{ p.label }}</b><span class="pr">{{ price(p) }}</span><span class="mut">≈ {{ Math.round(p.tokens / 8000) }} drafts</span><button class="btn" :disabled="!!busy" @click="buy(p.key)">{{ busy === p.key ? 'Buying…' : 'Buy' }}</button></div></div>
      <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p></div>
    <div class="card"><h3>Last 30 days</h3><div v-if="data.days.length" class="bars"><div v-for="d in slots" :key="d.day" class="bc" :title="d.day + ': ' + tok(d.tokens) + ' tokens'"><i :style="{ height: (d.tokens / max) * 100 + '%' }" /></div></div><p v-else class="mut">No AI used yet.</p>
      <div v-for="t in data.tasks" :key="t.task" class="row"><span>{{ tname(t.task) }}</span><span class="mut">{{ t.runs }} run{{ t.runs === 1 ? '' : 's' }}</span><b>{{ tok(t.tokens) }}</b></div></div>
  </div>
</template>
<style scoped>
.au { display: flex; flex-direction: column; gap: 12px; } h2, h3 { margin: 0 0 6px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.meter { margin-top: 16px; } .mh { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; } .mh span { color: var(--c-muted); font-size: 13px; } .bar { height: 10px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-navy); } .bar i.hot { background: var(--c-warn); } .pc { font-size: 12.5px; color: var(--c-ink-soft); }
.warn { background: rgba(183,121,31,.1); border-left: 3px solid var(--c-warn); padding: 9px 12px; font-size: 13.5px; margin: 14px 0 0; } .note { background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 9px 12px; font-size: 13.5px; margin: 14px 0 0; } .okm { color: var(--c-ok); font-size: 13.5px; margin: 10px 0 0; }
.ch { display: flex; justify-content: space-between; align-items: baseline; } .cr { font-size: 20px; } .packs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; } .pk { border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 4px; } .pk b { font-size: 16px; } .pr { font-size: 22px; font-weight: 600; } .pk .btn { margin-top: 6px; align-self: flex-start; }
.bars { display: flex; gap: 3px; height: 120px; align-items: flex-end; margin: 10px 0 12px; } .bc { flex: 1; height: 100%; display: flex; align-items: flex-end; } .bc i { width: 100%; background: linear-gradient(180deg, #1c3d63, #5b8fd1); min-height: 2px; }
.row { display: grid; grid-template-columns: 1fr auto 70px; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; text-transform: capitalize; } .row b { text-align: right; font-weight: 500; } .error { color: var(--c-danger); margin: 8px 0 0; }
@media (max-width: 760px) { .packs { grid-template-columns: 1fr; } }
</style>
