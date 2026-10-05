<script setup lang="ts">
// Live bank balances through Plaid (US banks), with a total in the reporting currency.
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
interface A { id: string; item_id: string; name: string; mask: string | null; subtype: string | null; currency: string; current: string | null; available: string | null; updated_at: string; institution: string | null; error: string | null }
const { data, refresh } = await useFetch<{ enabled: boolean; env: string; items: { id: string; institution: string | null; error: string | null }[]; accounts: A[]; total: number; currency: string }>('/api/plaid/accounts', { key: 'plaid-accounts' })
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
    P.create({ token: link_token, onSuccess: async (public_token: string, meta: { institution?: { name?: string } }) => { try { await $fetch('/api/plaid/exchange', { method: 'POST', body: { public_token, institution: meta.institution?.name } }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not connect.' } }, onExit: () => { busy.value = false } }).open()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? (e as Error).message } finally { busy.value = false }
}
async function disconnect(id: string, name: string | null) { if (!confirm('Disconnect ' + (name ?? 'this bank') + '?')) return; await $fetch('/api/plaid/items/' + id, { method: 'DELETE' }); await refresh() }
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago' }
</script>
<template>
  <div v-if="data" class="card bf">
    <div class="bh"><div><h3>Live bank balances</h3><p class="mut">{{ data.accounts.length ? 'Total ' + fmt(data.total, data.currency) + ' across ' + data.accounts.length + ' account' + (data.accounts.length === 1 ? '' : 's') + (data.env === 'sandbox' ? ' · sandbox' : '') : data.enabled ? 'Connect a US bank account to see balances update automatically.' : 'Bank connections are not set up yet.' }}</p></div>
      <div class="row"><button v-if="data.accounts.length" class="btn secondary sm" @click="refresh()">Refresh</button><button v-if="data.enabled" class="btn sm" :disabled="busy" @click="connect">{{ busy ? 'Opening…' : 'Connect a bank' }}</button></div></div>
    <div v-for="it in data.items" :key="it.id" class="it">
      <div class="ih"><b>{{ it.institution ?? 'Bank' }}</b><span v-if="it.error" class="err">Needs attention: {{ it.error }}</span><button class="lk" @click="disconnect(it.id, it.institution)">Disconnect</button></div>
      <div v-for="a in data.accounts.filter((x) => x.item_id === it.id).slice(0, compact ? 3 : 50)" :key="a.id" class="ac"><span>{{ a.name }}<em>{{ a.subtype ?? '' }}{{ a.mask ? ' ••' + a.mask : '' }} · updated {{ ago(a.updated_at) }}</em></span><b>{{ fmt(a.current, a.currency) }}<em v-if="a.available !== null && a.available !== a.current">available {{ fmt(a.available, a.currency) }}</em></b></div>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.bf { display: flex; flex-direction: column; gap: 10px; } .bh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .bh h3 { margin: 0 0 3px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.row { display: flex; gap: 8px; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .it { border-top: 1px solid var(--c-rule); padding-top: 8px; } .ih { display: flex; gap: 10px; align-items: center; } .ih b { font-size: 14px; } .err { font-size: 12px; color: var(--c-danger); } .lk { margin-left: auto; background: none; border: 0; font: inherit; font-size: 12.5px; color: var(--c-muted); cursor: pointer; }
.ac { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .ac:last-child { border-bottom: 0; } .ac span, .ac b { display: flex; flex-direction: column; } .ac b { text-align: right; font-weight: 600; } .ac em { font-style: normal; font-size: 12px; color: var(--c-muted); font-weight: 400; } .error { color: var(--c-danger); margin: 0; }
</style>
