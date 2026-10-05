<script setup lang="ts">
// Data API keys and a short guide.
interface K { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }
const { data, refresh } = await useFetch<K[]>('/api/api-keys')
const f = reactive({ name: '', write: false }); const fresh = ref(''); const msg = ref(''); const copied = ref(false)
const base = useRequestURL().origin + '/api/v1'
async function create() { msg.value = ''; try { const r = await $fetch<{ key: string }>('/api/api-keys', { method: 'POST', body: f }); fresh.value = r.key; f.name = ''; f.write = false; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the key.' } }
async function revoke(k: K) { if (!confirm('Revoke ' + k.name + '? Anything using it stops working.')) return; await $fetch('/api/api-keys', { method: 'POST', body: { revoke: k.id } }); await refresh() }
async function copy() { await navigator.clipboard.writeText(fresh.value); copied.value = true; setTimeout(() => (copied.value = false), 1500) }
const day = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never')
</script>
<template>
  <div class="ak">
    <div class="card"><h2>Data API</h2><p class="mut">Connect your own systems: push figures and contacts in as they change, and pull your data out. Keys belong to this workspace; read keys can only read.</p>
      <form class="row" @submit.prevent="create"><input v-model="f.name" placeholder="Key name, e.g. Accounting sync" maxlength="80" required><label class="cb"><input v-model="f.write" type="checkbox"> Allow writing</label><button class="btn" type="submit">Create key</button></form>
      <div v-if="fresh" class="new"><b>Copy your key now. It won't be shown again.</b><code>{{ fresh }}</code><button class="btn secondary sm" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button></div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <table v-if="data?.length"><thead><tr><th>Name</th><th>Key</th><th>Access</th><th>Last used</th><th /></tr></thead><tbody><tr v-for="k in data" :key="k.id" :class="{ off: k.revoked_at }"><td>{{ k.name }}</td><td><code>{{ k.prefix }}…</code></td><td>{{ k.scopes.includes('write') ? 'Read and write' : 'Read' }}</td><td class="mut">{{ k.revoked_at ? 'Revoked' : day(k.last_used_at) }}</td><td class="n"><button v-if="!k.revoked_at" class="link" @click="revoke(k)">Revoke</button></td></tr></tbody></table></div>
    <div class="card doc"><h3>Endpoints</h3><p class="mut">Send <code>Authorization: Bearer fv_live_…</code>. Base URL <code>{{ base }}</code></p>
      <table><tbody>
        <tr><td><code>GET /financials?period_type=month</code></td><td>Your statements (original currency) with derived metrics</td></tr>
        <tr><td><code>POST /financials</code></td><td>Add or replace a period: <code>{ "period_type": "month", "period_end": "2026-09-30", "currency": "USD", "lines": { "revenue": 120000, "cogs": 40000, "cash": 900000 } }</code></td></tr>
        <tr><td><code>GET /metrics</code></td><td>Latest key metrics in your reporting currency</td></tr>
        <tr><td><code>GET /contacts</code> · <code>POST /contacts</code></td><td>List contacts, or add/update up to 1,000: <code>{ "contacts": [{ "name": "Amara Obi", "email": "amara@vc.africa", "lists": ["Investors"] }] }</code></td></tr>
        <tr><td><code>GET /compliance</code></td><td>Filing and renewal deadlines</td></tr>
        <tr><td><code>GET /pipelines</code></td><td>Fundraising pipelines with investors and amounts</td></tr></tbody></table>
      <pre>curl -X POST {{ base }}/financials \
  -H "Authorization: Bearer fv_live_…" -H "Content-Type: application/json" \
  -d '{"period_type":"month","period_end":"2026-09-30","currency":"USD","lines":{"revenue":120000}}'</pre>
      <p class="mut">Works with Zapier and Make (Webhooks / HTTP request), or any script. Limit: 600 requests a minute per key.</p></div>
  </div>
</template>
<style scoped>
.ak { display: flex; flex-direction: column; gap: 12px; } h2, h3 { margin: 0 0 6px; } .mut { color: var(--c-muted); font-size: 13px; } .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 12px 0; } .row input[type=text], .row input:not([type]) { flex: 1; min-width: 220px; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: var(--c-signal-soft); padding: 12px; margin-bottom: 10px; } .new code { font-size: 13px; word-break: break-all; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 8px; border-bottom: 1px solid var(--c-rule); } td { padding: 9px 8px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tr.off { opacity: .55; } .n { text-align: right; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: var(--c-paper-2); padding: 1px 5px; } pre { background: #0c1a2e; color: #e6edf6; padding: 14px; font-size: 12.5px; overflow-x: auto; } .btn.sm { height: 30px; padding: 0 10px; font-size: 12.5px; } .link { background: none; border: 0; color: var(--c-danger); cursor: pointer; font: inherit; } .error { color: var(--c-danger); }
</style>
