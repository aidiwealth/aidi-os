<script setup lang="ts">
// Live bank balances through Plaid (US banks), with a total in the reporting currency. For a company with accounts
// outside the US (or a group), it says these are part of the cash, not all of it.
const props = withDefaults(defineProps<{ compact?: boolean; entity?: string | null }>(), { compact: false, entity: null })
const emit = defineEmits<{ changed: [] }>()
interface A { id: string; item_id: string; name: string; mask: string | null; subtype: string | null; currency: string; current: string | null; available: string | null; updated_at: string; institution: string | null; error: string | null }
const { data, refresh } = await useFetch<{ ng?: boolean; available?: boolean; manage?: boolean; enabled: boolean; env: string; items: { id: string; institution: string | null; error: string | null }[]; accounts: A[]; total: number; currency: string; coverage?: { reported: number | null; as_of: string | null; share: number | null; partial: boolean; group: boolean } | null }>('/api/plaid/accounts', { query: computed(() => (props.entity ? { entity: props.entity } : {})), key: 'plaid-accounts' + (props.entity ? ':' + props.entity : '') })
const busy = ref(false); const msg = ref('')
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const fmt = (v: string | number | null, c: string) => (v === null ? '—' : (SYM[c] ?? c + ' ') + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
function loadScript(): Promise<void> { return new Promise((res, rej) => { if ((window as unknown as { Plaid?: unknown }).Plaid) return res(); const s = document.createElement('script'); s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load Plaid')); document.head.appendChild(s) }) }
async function connect() {
  busy.value = true; msg.value = ''
  try {
    await loadScript()
    const { link_token } = await $fetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST' })
    const P = (window as unknown as { Plaid: { create: (o: Record<string, unknown>) => { open: () => void } } }).Plaid
    P.create({ token: link_token, onSuccess: async (public_token: string, meta: { institution?: { name?: string } }) => { try { await $fetch('/api/plaid/exchange', { method: 'POST', body: { public_token, institution: meta.institution?.name } }); emit('changed'); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not connect.' } }, onExit: () => { busy.value = false } }).open()
  } catch (e) { const x = e as { data?: { data?: { error?: { message?: string } } }; statusCode?: number }; msg.value = x.data?.data?.error?.message ?? (x.statusCode ? 'Could not start the bank connection (error ' + x.statusCode + '). Please try again in a minute.' : 'Could not load the bank connection window. Check your internet connection or ad blocker and try again.') } finally { busy.value = false }
}
async function disconnect(id: string, name: string | null) { if (!confirm('Disconnect ' + (name ?? 'this bank') + '?')) return; await $fetch('/api/plaid/items/' + id, { method: 'DELETE' }); await refresh() }
const manage = ref(false)
const cash = computed(() => (data.value?.accounts ?? []).filter((a) => !['credit', 'loan'].includes(a.subtype ?? '')))
const newest = computed(() => (data.value?.accounts ?? []).reduce((m, a) => (a.updated_at > m ? a.updated_at : m), ''))
const short = (v: number, c: string) => briefMoney(v, c)
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago' }
</script>
<template>
  <!-- Live bank balances as a slim strip: the total, then one small card per account, scrolling sideways if there are many. -->
  <div v-if="data && data.available !== false && (data.accounts.length || (data.manage && data.enabled))" class="bf" :class="{ cmp: compact }">
    <div class="top">
      <div class="tt"><span class="live"><i />Live</span><b>Bank balances</b>
        <template v-if="data.accounts.length"><span class="tot">{{ fmt(data.total, data.currency) }}</span><span class="mut">{{ data.accounts.length }} account{{ data.accounts.length === 1 ? '' : 's' }}{{ newest ? ' · updated ' + ago(newest) : '' }}{{ data.env === 'sandbox' ? ' · sandbox' : '' }}</span></template>
        <span v-else class="mut">{{ data.enabled ? 'Connect a US bank account to see balances update automatically.' : data.ng ? 'Bank connections for Nigerian banks are coming soon.' : 'Bank connections are not set up yet.' }}</span></div>
      <div class="acts"><button v-if="data.accounts.length" class="ic" type="button" title="Refresh balances" aria-label="Refresh balances" @click="refresh()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button>
        <button v-if="data.items.length && data.manage" class="lk" type="button" @click="manage = !manage">{{ manage ? 'Done' : 'Manage' }}</button>
        <button v-if="data.enabled && data.manage" class="btn sm" :class="{ secondary: data.accounts.length }" :disabled="busy" @click="connect">{{ busy ? 'Opening…' : data.accounts.length ? '+ Add bank' : 'Connect a bank' }}</button></div>
    </div>
    <div v-if="data.accounts.length" class="cards">
      <div v-for="a in data.accounts.slice(0, compact ? 6 : 50)" :key="a.id" class="bc" :class="{ debt: ['credit', 'loan'].includes(a.subtype ?? '') }">
        <div class="r1"><span class="inst">{{ a.institution ?? 'Bank' }}</span><span class="mask">{{ a.mask ? '•• ' + a.mask : '' }}</span></div>
        <div class="nm" :title="a.name">{{ a.name.toLowerCase() }}<em>{{ a.subtype ?? '' }}</em></div>
        <div class="bal">{{ fmt(a.current, a.currency) }}</div>
        <div class="av">{{ a.available !== null && a.available !== a.current ? 'Available ' + fmt(a.available, a.currency) : a.error ? 'Needs attention' : '\u00a0' }}</div>
      </div>
    </div>
    <div v-if="manage" class="mg"><div v-for="it in data.items" :key="it.id" class="mi"><b>{{ it.institution ?? 'Bank' }}</b><span v-if="it.error" class="err">Needs attention: {{ it.error }}</span><button class="lk red" type="button" @click="disconnect(it.id, it.institution)">Disconnect</button></div></div>
    <p v-else-if="data.items.some((i) => i.error)" class="err">{{ data.items.filter((i) => i.error).map((i) => (i.institution ?? 'A bank') + ' needs attention').join(' · ') }}. <button class="lk" type="button" @click="manage = true">Manage</button></p>
    <p v-if="data.coverage?.partial" class="cov"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg><span>US accounts only{{ data.coverage.reported ? ': ' + short(data.total, data.currency) + ' of the ' + short(data.coverage.reported, data.currency) + ' cash in Financials' + (data.coverage.as_of ? ' (' + new Date(data.coverage.as_of + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) + ')' : '') : '' }}. Cash, runway and forecasts use Financials.</span></p>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.bf { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: #fff; border: 1px solid var(--c-line-soft, var(--c-rule)); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tt { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; } .tt b { font-size: 14px; font-weight: 600; color: var(--c-ink); }
.live { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-blue-deep); align-self: center; }
.live i { width: 7px; height: 7px; border-radius: 50%; background: #3b82c4; box-shadow: 0 0 0 0 rgba(59,130,196,.5); animation: pulse 2s infinite; }
@keyframes pulse { 70% { box-shadow: 0 0 0 6px rgba(59,130,196,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,196,0); } }
@media (prefers-reduced-motion: reduce) { .live i { animation: none; } }
.tot { font-size: 18px; font-weight: 600; color: var(--c-navy); font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); font-size: 12.5px; }
.acts { display: flex; align-items: center; gap: 12px; } .btn.sm { height: 30px; padding: 0 12px; font-size: 13px; }
.ic { width: 30px; height: 30px; display: grid; place-items: center; background: none; border: 1px solid var(--c-rule-strong); color: var(--c-ink-soft); cursor: pointer; } .ic:hover { color: var(--c-navy); } .ic svg { width: 15px; height: 15px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); margin-left: auto; }
.cards { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.bc { position: relative; flex: 0 0 216px; height: 104px; padding: 11px 13px; display: flex; flex-direction: column; color: #fff; overflow: hidden;
  background: linear-gradient(135deg, #0c1a2e 0%, #183456 100%); }
.bc::after { content: ''; position: absolute; right: -36px; top: -46px; width: 120px; height: 120px; border-radius: 50%; background: rgba(120,170,230,.16); pointer-events: none; }
.bc.debt { background: linear-gradient(135deg, #2b3340 0%, #444e5e 100%); }
.r1 { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .8; } .inst { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .mask { font-variant-numeric: tabular-nums; white-space: nowrap; }
.nm { margin-top: 3px; font-size: 12px; text-transform: capitalize; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .nm em { font-style: normal; margin-left: 6px; opacity: .8; text-transform: lowercase; }
.bal { margin-top: auto; font-size: 18px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.av { font-size: 11px; opacity: .7; white-space: nowrap; }
.mg { display: flex; flex-direction: column; border-top: 1px solid var(--c-rule); } .mi { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; }
.err { font-size: 12px; color: var(--c-danger); margin: 0; }
.cov { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12px; color: var(--c-muted); } .cov svg { width: 14px; height: 14px; flex: none; margin-top: 1px; }
.error { color: var(--c-danger); font-size: 13px; margin: 0; }
</style>
