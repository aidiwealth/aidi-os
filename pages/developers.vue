<script setup lang="ts">
// Public API reference for the Finvry Data API.
definePageMeta({ layout: false })
useHead({ title: 'API reference — Finvry' })
const base = useRequestURL().origin + '/api/v1'
const lang = ref<'curl' | 'js' | 'python'>('curl')
interface P { name: string; type: string; req?: boolean; desc: string }
interface E { id: string; method: 'GET' | 'POST'; path: string; title: string; desc: string; scope: 'read' | 'write'; query?: P[]; body?: P[]; example?: string; response: string }
const EPS: E[] = [
  { id: 'financials-list', method: 'GET', path: '/financials', title: 'List statements', scope: 'read', desc: 'Your monthly, quarterly or yearly statements in their original currency, with derived metrics (gross margin, EBITDA, burn, runway).', query: [{ name: 'period_type', type: 'string', desc: 'month (default), quarter or year' }],
    response: '{\n  "data": [\n    {\n      "period_end": "2026-09-30",\n      "period_type": "month",\n      "currency": "USD",\n      "lines": { "revenue": 120000, "cogs": 40000, "cash": 900000 },\n      "kpis": { "customers": 412 },\n      "metrics": { "gross_margin": 0.667, "burn": 35000, "runway_months": 25.7 },\n      "source": "api"\n    }\n  ]\n}' },
  { id: 'financials-push', method: 'POST', path: '/financials', title: 'Add or replace a period', scope: 'write', desc: 'Creates the statement for a period, or replaces it if it exists. Send only the lines you have.',
    body: [{ name: 'period_type', type: 'string', req: true, desc: 'month, quarter or year' }, { name: 'period_end', type: 'date', req: true, desc: 'Last day of the period, YYYY-MM-DD' }, { name: 'currency', type: 'string', req: true, desc: 'ISO code, e.g. USD or NGN' }, { name: 'lines', type: 'object', desc: 'revenue, cogs, opex_payroll, opex_marketing, opex_rnd, opex_ga, opex_other, depreciation, interest, tax, net_income, cash, receivables, inventory, other_assets, total_assets, payables, debt, other_liabilities, equity …' }, { name: 'kpis', type: 'object', desc: 'Any numeric KPIs, e.g. { "customers": 412 }' }, { name: 'notes', type: 'string', desc: 'Optional note (max 1,000 characters)' }],
    example: '{\n  "period_type": "month",\n  "period_end": "2026-09-30",\n  "currency": "USD",\n  "lines": { "revenue": 120000, "cogs": 40000, "cash": 900000 }\n}', response: '{ "ok": true, "id": "…", "replaced": false }' },
  { id: 'metrics', method: 'GET', path: '/metrics', title: 'Latest metrics', scope: 'read', desc: 'Key metrics for the latest month, in your reporting currency.', response: '{\n  "data": {\n    "period_end": "2026-09-30",\n    "currency": "USD",\n    "metrics": { "revenue": 120000, "gross_margin": 0.667, "burn": 35000, "runway_months": 25.7 }\n  }\n}' },
  { id: 'contacts-list', method: 'GET', path: '/contacts', title: 'List contacts', scope: 'read', desc: 'Your investor and partner contacts with their lists.', query: [{ name: 'updated_since', type: 'date', desc: 'Only contacts created on or after this date' }], response: '{\n  "data": [\n    { "id": "…", "name": "Amara Obi", "email": "amara@vc.africa", "firm": "Ventures Africa", "lists": ["Investors"], "subscribed": true }\n  ]\n}' },
  { id: 'contacts-push', method: 'POST', path: '/contacts', title: 'Add or update contacts', scope: 'write', desc: 'Matched by email. Up to 1,000 per request. Lists are created if they do not exist.',
    body: [{ name: 'contacts', type: 'array', req: true, desc: '[{ name, email, firm?, title?, lists? }]' }], example: '{\n  "contacts": [\n    { "name": "Amara Obi", "email": "amara@vc.africa", "firm": "Ventures Africa", "lists": ["Investors"] }\n  ]\n}', response: '{ "ok": true, "added": 1, "updated": 0 }' },
  { id: 'compliance', method: 'GET', path: '/compliance', title: 'Compliance deadlines', scope: 'read', desc: 'Your filing and renewal deadlines, soonest first.', response: '{\n  "data": [\n    { "title": "Delaware franchise tax", "category": "franchise_tax", "next_due": "2027-03-01", "days_left": 147 }\n  ]\n}' },
  { id: 'pipelines', method: 'GET', path: '/pipelines', title: 'Fundraising pipelines', scope: 'read', desc: 'Each pipeline with its investors, stages and amounts.', response: '{\n  "data": [\n    { "name": "Seed", "currency": "USD", "target": 1500000, "investors": [{ "investor": "Partech Africa", "stage": "Diligence", "amount": 500000 }] }\n  ]\n}' }]
const code = (e: E) => {
  const url = base + e.path + (e.query?.length ? '?' + e.query[0]!.name + '=…' : '')
  if (lang.value === 'curl') return 'curl ' + (e.method === 'POST' ? '-X POST ' : '') + url + ' \\\n  -H "Authorization: Bearer fv_live_…"' + (e.method === 'POST' ? ' \\\n  -H "Content-Type: application/json" \\\n  -d \'' + (e.example ?? '{}').replace(/\n\s*/g, ' ') + "'" : '')
  if (lang.value === 'js') return 'const res = await fetch("' + url + '", {\n  method: "' + e.method + '",\n  headers: { Authorization: "Bearer " + process.env.FINVRY_KEY' + (e.method === 'POST' ? ', "Content-Type": "application/json" },\n  body: JSON.stringify(' + (e.example ?? '{}').replace(/\n/g, '\n  ') + ')\n})' : ' }\n})') + '\nconst data = await res.json()'
  return 'import os, requests\nres = requests.' + e.method.toLowerCase() + '(\n    "' + url + '",\n    headers={"Authorization": "Bearer " + os.environ["FINVRY_KEY"]}' + (e.method === 'POST' ? ',\n    json=' + (e.example ?? '{}').replace(/\n/g, '\n    ').replace(/true/g, 'True').replace(/false/g, 'False') : '') + ',\n)\nprint(res.json())'
}
const copied = ref('')
// Quickstart: one request in every language.
const QS_BODY = '{\n  "period_type": "month",\n  "period_end": "2026-09-30",\n  "currency": "USD",\n  "lines": { "revenue": 120000, "cash": 900000 }\n}'
type QL = 'json' | 'js' | 'node' | 'curl' | 'ts' | 'python'
const qsLang = ref<QL>('js')
const QS_TABS: { k: QL; l: string }[] = [{ k: 'json', l: 'JSON' }, { k: 'js', l: 'JavaScript' }, { k: 'node', l: 'Node.js' }, { k: 'curl', l: 'cURL' }, { k: 'ts', l: 'TypeScript' }, { k: 'python', l: 'Python' }]
const qsCode = computed(() => {
  const u = base + '/financials', b = QS_BODY.replace(/\n/g, '\n  ')
  switch (qsLang.value) {
    case 'json': return QS_BODY
    case 'curl': return 'curl -X POST ' + u + ' \\\n  -H "Authorization: Bearer fv_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d \'' + QS_BODY.replace(/\n\s*/g, ' ') + "'"
    case 'node': return 'const res = await fetch("' + u + '", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.FINVRY_KEY}`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(' + b + ')\n})\nconsole.log(await res.json())'
    case 'ts': return 'type Result = { ok: boolean; id: string; replaced: boolean }\n\nconst res = await fetch("' + u + '", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.FINVRY_KEY}`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(' + b + ')\n})\nconst data: Result = await res.json()'
    case 'python': return 'import os, requests\n\nres = requests.post(\n    "' + u + '",\n    headers={"Authorization": "Bearer " + os.environ["FINVRY_KEY"]},\n    json=' + QS_BODY.replace(/\n/g, '\n    ') + ',\n)\nprint(res.json())'
    default: return 'fetch("' + u + '", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer fv_live_xxx",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(' + b + ')\n})\n  .then((res) => res.json())\n  .then((data) => console.log(data));'
  }
})
const CAPS = [
  { id: 'financials-push', tag: 'Financials', title: 'Statements & metrics', text: 'Push monthly, quarterly or yearly figures from your books and read back gross margin, burn and runway.', g: 'g1' },
  { id: 'contacts-push', tag: 'Contacts', title: 'Investor contacts', text: 'Keep investors and partners in sync with your CRM, matched by email, with lists.', g: 'g2' },
  { id: 'pipelines', tag: 'Fundraising', title: 'Pipelines', text: 'Read every round with its investors, stages and amounts.', g: 'g3' },
  { id: 'mcp', tag: 'MCP', title: 'AI tools', text: 'Connect Claude, ChatGPT or Cursor to live company data, read-only.', g: 'g4' }]
// Search across guides and endpoints.
const SEARCH = [
  { id: 'intro', t: 'Introduction', s: 'Overview, base URL, quickstart' }, { id: 'capabilities', t: 'Capabilities', s: 'What you can build' }, { id: 'auth', t: 'Authentication', s: 'API keys, bearer token, read and write keys' },
  { id: 'limits', t: 'Rate limits', s: '600 requests per minute, 429' }, { id: 'errors', t: 'Errors', s: '401 403 422 429 status codes' }, { id: 'mcp', t: 'MCP server for AI tools', s: 'Claude, ChatGPT, Cursor, model context protocol' },
  ...EPS.map((e) => ({ id: e.id, t: e.title, s: e.method + ' ' + e.path + ' · ' + e.desc, m: e.method }))]
const q = ref(''), qOpen = ref(false), qi = ref(0), qEl = ref<HTMLInputElement | null>(null)
const hits = computed(() => { const s = q.value.trim().toLowerCase(); if (!s) return SEARCH.slice(0, 8); return SEARCH.filter((x) => (x.t + ' ' + x.s).toLowerCase().includes(s)).slice(0, 10) })
watch(q, () => { qi.value = 0; qOpen.value = true })
function qBlur() { setTimeout(() => (qOpen.value = false), 150) }
function go(id: string) { qOpen.value = false; q.value = ''; qEl.value?.blur(); if (import.meta.client) { history.replaceState(null, '', '#' + id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }
function qKey(e: KeyboardEvent) { if (e.key === 'ArrowDown') { qi.value = Math.min(qi.value + 1, hits.value.length - 1); e.preventDefault() } else if (e.key === 'ArrowUp') { qi.value = Math.max(qi.value - 1, 0); e.preventDefault() } else if (e.key === 'Enter' && hits.value[qi.value]) go(hits.value[qi.value]!.id); else if (e.key === 'Escape') { qOpen.value = false; qEl.value?.blur() } }
function hotkey(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' || (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))) { e.preventDefault(); qEl.value?.focus(); qOpen.value = true } }
onMounted(() => window.addEventListener('keydown', hotkey)); onBeforeUnmount(() => window.removeEventListener('keydown', hotkey))
async function copy(id: string, s: string) { await navigator.clipboard.writeText(s); copied.value = id; setTimeout(() => (copied.value = ''), 1500) }
</script>
<template>
  <div class="dv">
    <header><a href="https://finvry.com" class="brand" aria-label="Finvry home"><img src="/brand/finvry-logo.svg" alt="Finvry"></a><span class="tag">API reference</span>
      <div class="srch" :class="{ open: qOpen }"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" /></svg>
        <input ref="qEl" v-model="q" type="search" placeholder="Search the docs" aria-label="Search the docs" @focus="qOpen = true" @blur="qBlur" @keydown="qKey"><kbd>⌘K</kbd>
        <div v-if="qOpen" class="hits"><button v-for="(h, i) in hits" :key="h.id" type="button" :class="{ on: i === qi }" @mousedown.prevent="go(h.id)" @mouseenter="qi = i"><span v-if="'m' in h" :class="'m ' + h.m">{{ h.m }}</span><b>{{ h.t }}</b><em>{{ h.s }}</em></button><p v-if="!hits.length" class="none">No results for “{{ q }}”</p></div></div>
      <nav><a href="/status">Status</a><a href="/settings?s=api" class="key">Get an API key</a></nav></header>
    <div class="grid">
      <aside><p class="sg">Getting started</p><a href="#intro">Introduction</a><a href="#capabilities">Capabilities</a><a href="#auth">Authentication</a><a href="#limits">Rate limits</a><a href="#errors">Errors</a><a href="#mcp">MCP server (AI tools)</a>
        <p class="sg">Endpoints</p><a v-for="e in EPS" :key="e.id" :href="'#' + e.id"><span :class="'m ' + e.method">{{ e.method }}</span>{{ e.title }}</a></aside>
      <main>
        <section id="intro"><h1 class="big">Finvry API</h1><p class="lede">Build financial reporting, investor relations and compliance into your own tools. One REST API over the same data that powers your Finvry workspace: push statements as your books close, read metrics, keep investor contacts in sync, follow fundraising and compliance deadlines, and connect AI tools.</p>
          <div class="qs"><div class="qsl"><h2>Developer quickstart</h2><p>Make your first API request in minutes. Send a month of figures with a single call.</p><div class="qsb"><a href="/start" class="b1">Get started</a><a href="/settings?s=api" class="b2">Create API key</a></div></div>
            <div class="qsc"><div class="qst"><div class="qtabs"><button v-for="x in QS_TABS" :key="x.k" type="button" :class="{ on: qsLang === x.k }" @click="qsLang = x.k">{{ x.l }}</button></div><button type="button" class="cp" @click="copy('qs', qsCode)">{{ copied === 'qs' ? 'Copied' : 'Copy' }}</button></div><pre>{{ qsCode }}</pre></div></div>
          <div class="bu"><b>Base URL</b><code>{{ base }}</code><span class="v">v1</span></div></section>
        <section id="capabilities"><h2 class="h2b">Capabilities</h2><p>Everything your workspace knows, over one API.</p>
          <div class="caps"><a v-for="c in CAPS" :key="c.id" :href="'#' + c.id" class="cap"><span class="cv" :class="c.g">{{ c.tag }}</span><b>{{ c.title }}</b><span class="cx">{{ c.text }}</span></a></div></section>
        <section id="auth"><h2>Authentication</h2><p>Create a key in <b>Settings → Data API</b>. Read keys can only read; write keys can also add data. Send the key as a bearer token. Keys belong to one workspace and are shown once; revoke a key at any time.</p><pre>Authorization: Bearer fv_live_…</pre></section>
        <section id="mcp"><h2>MCP server for AI tools</h2><p>Connect Claude, ChatGPT, Cursor or any MCP client to your Finvry data, read-only. Your AI tool can then answer questions like "what is our runway?" or "which investors are in due diligence?" from live figures.</p>
          <div class="kv"><span>Server URL</span><code>{{ base.replace('/api/v1', '') }}/api/mcp</code></div><div class="kv"><span>Auth</span><code>Authorization: Bearer fv_live_… (a read key)</code></div>
          <p>Tools: <code>company_metrics</code>, <code>statements</code>, <code>fundraising</code>, <code>contacts</code>, <code>compliance_deadlines</code>.</p>
          <p><b>Claude Desktop</b> (Settings → Developer → Edit config):</p><pre>{ "mcpServers": { "finvry": { "command": "npx", "args": ["mcp-remote", "{{ base.replace('/api/v1', '') }}/api/mcp", "--header", "Authorization: Bearer YOUR_KEY"] } } }</pre>
          <p><b>Cursor, Windsurf and other clients</b> that accept remote servers with headers: add the server URL above with the Authorization header.</p></section>
        <section id="limits"><h2>Rate limits</h2><p>600 requests per minute per key. Above that you get <code>429</code>; wait a minute and retry.</p></section>
        <section id="errors"><h2>Errors</h2><p>Errors return a status code and a JSON body with a code and a human-readable message.</p>
          <table><tbody><tr><td><code>401</code></td><td>Missing, wrong or revoked key</td></tr><tr><td><code>403</code></td><td>The key lacks write access, or API access is switched off</td></tr><tr><td><code>422</code></td><td>The request body failed validation (the message says which field)</td></tr><tr><td><code>429</code></td><td>Rate limit reached</td></tr></tbody></table>
          <pre>{ "statusCode": 422, "data": { "error": { "code": "invalid", "message": "Check period_type, period_end (YYYY-MM-DD), currency and the figures." } } }</pre></section>
        <div class="langs"><button v-for="l in (['curl', 'js', 'python'] as const)" :key="l" :class="{ on: lang === l }" @click="lang = l">{{ l === 'js' ? 'JavaScript' : l === 'python' ? 'Python' : 'cURL' }}</button></div>
        <section v-for="e in EPS" :id="e.id" :key="e.id" class="ep"><div class="eh"><span :class="'m ' + e.method">{{ e.method }}</span><code>{{ e.path }}</code><span class="scope">{{ e.scope }} key</span></div><h2>{{ e.title }}</h2><p>{{ e.desc }}</p>
          <table v-if="e.query?.length || e.body?.length"><thead><tr><th>{{ e.query ? 'Query parameter' : 'Body field' }}</th><th>Type</th><th>Description</th></tr></thead><tbody><tr v-for="p in (e.query ?? e.body)" :key="p.name"><td><code>{{ p.name }}</code><em v-if="p.req">required</em></td><td>{{ p.type }}</td><td>{{ p.desc }}</td></tr></tbody></table>
          <div class="code"><div class="ct"><span>Request</span><button @click="copy(e.id, code(e))">{{ copied === e.id ? 'Copied' : 'Copy' }}</button></div><pre>{{ code(e) }}</pre></div>
          <div class="code"><div class="ct"><span>Response</span></div><pre>{{ e.response }}</pre></div></section>
      </main>
    </div>
  </div>
</template>
<style scoped>
.dv { min-height: 100vh; background: #fff; font-family: var(--font-body); color: var(--c-ink); } header { display: flex; align-items: center; gap: 12px; padding: 16px 28px; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; z-index: 2; } .brand img { height: 26px; width: auto; display: block; } .brand { display: inline-flex; font-weight: 700; font-size: 19px; color: var(--c-ink); text-decoration: none; letter-spacing: -.02em; } .tag { color: var(--c-muted); font-size: 13px; border-left: 1px solid var(--c-rule-strong); padding-left: 12px; } header nav { margin-left: auto; display: flex; align-items: center; gap: 18px; font-size: 13.5px; } header nav a { color: var(--c-ink-soft); text-decoration: none; }
.grid { display: grid; grid-template-columns: 250px 1fr; max-width: 1240px; margin: 0 auto; } aside { position: sticky; top: 60px; align-self: start; padding: 24px 16px; display: flex; flex-direction: column; gap: 2px; height: calc(100vh - 60px); overflow-y: auto; border-right: 1px solid var(--c-rule); } aside a { font-size: 13.5px; color: var(--c-ink-soft); text-decoration: none; padding: 6px 8px; display: flex; align-items: center; gap: 8px; } aside a:hover { background: var(--c-paper-2); } .sg { font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--c-muted); margin: 14px 8px 6px; }
main { padding: 28px 40px 80px; min-width: 0; } section { margin-bottom: 36px; scroll-margin-top: 80px; } h1 { font-size: 32px; margin: 0 0 10px; } h2 { font-size: 20px; margin: 6px 0 8px; } p { color: var(--c-ink-soft); line-height: 1.6; max-width: 760px; }
.kv { display: flex; gap: 12px; align-items: center; font-size: 13.5px; } code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: var(--c-paper-2); padding: 2px 6px; } pre { background: #0c1a2e; color: #e6edf6; padding: 14px 16px; font-size: 12.5px; overflow-x: auto; margin: 0; line-height: 1.55; }
table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 13.5px; } th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12.5px; padding: 8px; border-bottom: 1px solid var(--c-rule); } td { padding: 9px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } td em { font-style: normal; font-size: 11px; color: var(--c-warn); margin-left: 6px; }
.m { font-size: 11px; font-weight: 700; padding: 2px 6px; font-family: ui-monospace, Menlo, monospace; } .m.GET { background: rgba(28,79,156,.1); color: #1c4f9c; } .m.POST { background: rgba(31,122,77,.12); color: #1f7a4d; } .eh { display: flex; gap: 10px; align-items: center; } .eh code { background: none; font-size: 15px; padding: 0; } .scope { font-size: 12px; color: var(--c-muted); margin-left: auto; }
.ep { border-top: 1px solid var(--c-rule); padding-top: 26px; } .code { margin: 10px 0; border: 1px solid #0c1a2e; } .ct { display: flex; justify-content: space-between; background: #13243c; color: #9fb3cc; font-size: 12px; padding: 6px 12px; } .ct button { background: none; border: 0; color: #cfe0f5; cursor: pointer; font: inherit; font-size: 12px; }
.langs { position: sticky; top: 64px; z-index: 1; display: flex; gap: 4px; background: #fff; padding: 8px 0; margin-bottom: 8px; } .langs button { background: var(--c-paper-2); border: 0; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .langs button.on { background: var(--c-navy); color: #fff; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } aside { display: none; } main { padding: 20px; } }
.big { font-size: clamp(38px, 5vw, 56px); letter-spacing: -.035em; line-height: 1.02; margin: 8px 0 16px; } .lede { font-size: 17px; max-width: 880px; }
.qs { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 32px; align-items: center; border: 1px solid var(--c-rule); background: #fff; padding: 36px; margin: 28px 0 18px; box-shadow: 0 1px 2px rgba(12,26,46,.04); }
.qsl h2 { font-size: 28px; letter-spacing: -.02em; margin: 0 0 10px; } .qsl p { margin: 0 0 22px; font-size: 16px; } .qsb { display: flex; gap: 10px; flex-wrap: wrap; } .qsb a { padding: 12px 20px; font-weight: 600; font-size: 15px; text-decoration: none; } .b1 { background: var(--c-navy); color: #fff; } .b1:hover { background: #1c547d; } .b2 { border: 1px solid var(--c-rule-strong); color: var(--c-ink); background: #fff; } .b2:hover { border-color: var(--c-ink); }
.qsc { background: #0d1117; border: 1px solid #0d1117; box-shadow: 0 24px 50px -24px rgba(12,26,46,.55); min-width: 0; } .qst { display: flex; align-items: center; gap: 8px; padding: 0 10px 0 8px; border-bottom: 1px solid rgba(255,255,255,.08); } .qtabs { display: flex; gap: 2px; overflow-x: auto; min-width: 0; flex: 1; scrollbar-width: none; }
.qst button { background: none; border: 0; border-bottom: 2px solid transparent; color: #8b98a8; font: inherit; font-size: 13px; padding: 12px 9px 10px; cursor: pointer; white-space: nowrap; } .qst button.on { color: #fff; border-bottom-color: #5fa8d3; } .qst .cp { flex: none; border: 0; background: rgba(255,255,255,.08); color: #c9d4e2; padding: 5px 10px; font-size: 12.5px; }
.qsc pre { background: none; padding: 20px 22px 24px; font-size: 13px; line-height: 1.75; min-height: 300px; color: #e6edf3; }
.bu { display: flex; align-items: center; gap: 14px; border: 1px solid var(--c-rule); background: #fff; padding: 14px 18px; } .bu b { font-size: 15px; } .bu code { font-size: 14px; padding: 5px 10px; } .bu .v { margin-left: auto; font-size: 12px; font-weight: 700; color: #1c547d; background: rgba(28,84,125,.1); padding: 3px 9px; font-family: ui-monospace, Menlo, monospace; }
.h2b { font-size: 30px; letter-spacing: -.025em; margin: 10px 0 6px; }
.caps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 18px; } .cap { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 6px; } .cap:hover .cv { transform: translateY(-2px); box-shadow: 0 14px 28px -14px rgba(12,26,46,.5); }
.cv { height: 150px; display: grid; place-items: center; color: #fff; font-size: 26px; font-weight: 700; letter-spacing: -.02em; text-shadow: 0 2px 12px rgba(0,0,0,.18); margin-bottom: 8px; transition: transform .2s, box-shadow .2s; }
.g1 { background: linear-gradient(135deg, #d9542f, #f4a65e); } .g2 { background: linear-gradient(135deg, #2f7d57, #8fcf9f); } .g3 { background: linear-gradient(135deg, #6a4fe0, #b4a5f7); } .g4 { background: linear-gradient(135deg, #b02f6e, #f28bb8); }
.cap b { font-size: 16.5px; color: var(--c-ink); } .cx { font-size: 14.5px; color: var(--c-ink-soft); line-height: 1.55; }
.srch { position: relative; flex: 1; max-width: 420px; margin-left: 18px; display: flex; align-items: center; } .srch svg { position: absolute; left: 11px; width: 16px; height: 16px; color: var(--c-muted); pointer-events: none; }
.srch input { width: 100%; font: inherit; font-size: 14px; padding: 8px 52px 8px 34px; border: 1px solid var(--c-rule-strong); background: var(--c-paper-2); outline: none; } .srch input:focus { background: #fff; border-color: var(--c-navy); box-shadow: 0 0 0 3px rgba(95,168,211,.2); }
.srch kbd { position: absolute; right: 8px; font-size: 11px; color: var(--c-muted); border: 1px solid var(--c-rule-strong); padding: 1px 5px; background: #fff; font-family: inherit; }
.hits { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 18px 40px -12px rgba(12,26,46,.3); max-height: 420px; overflow-y: auto; z-index: 5; padding: 6px; }
.hits button { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; width: 100%; text-align: left; background: none; border: 0; padding: 9px 10px; cursor: pointer; font: inherit; } .hits button.on { background: var(--c-paper-2); } .hits b { font-size: 14px; font-weight: 600; grid-column: 2; } .hits .m { grid-row: 1; align-self: center; } .hits em { grid-column: 1 / -1; font-style: normal; font-size: 12.5px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hits .none { margin: 8px 10px; font-size: 13px; color: var(--c-muted); }
header nav .key { background: var(--c-navy); color: #fff !important; padding: 7px 12px; }
@media (max-width: 1100px) { .caps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .qs { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .srch kbd, .tag { display: none; } .srch { margin-left: 8px; } header nav a:not(.key) { display: none; } }
</style>
