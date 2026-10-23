<script setup lang="ts">
// Bring data into Sales (deals), Marketing (results by channel and month) or Banking (transactions): drag in an Excel
// or CSV file, paste a Google Sheets / Excel online / Dropbox link and keep it in step, or (deals) connect HubSpot or
// Pipedrive. Columns are matched by their headings (including CRM and card-export headings), with AI filling in what
// the headings leave open. Nothing is written straight away: what would be new or changed is shown to accept first,
// and linked sheets and CRMs leave later updates for review the same way.
import type { ImportSummary } from '~/shared/growth'
const props = defineProps<{ open: boolean; kind: 'sales_deals' | 'marketing_months' | 'bank_txns'; processId?: string | null; currency?: string }>()
const emit = defineEmits<{ close: []; done: [] }>()
const HEAD: Record<string, string[]> = { sales_deals: ['Deal', 'Customer', 'Contact', 'Value', 'Stage', 'Expected close', 'Source', 'Owner', 'Notes'], marketing_months: ['Month', 'Channel', 'Spend', 'Visitors', 'Leads', 'Marketing qualified', 'Sales qualified', 'Customers', 'Revenue'], bank_txns: ['Date', 'Description', 'Money in', 'Money out', 'Who spent'] }
const WHAT: Record<string, string> = { sales_deals: 'deals', marketing_months: 'channel results', bank_txns: 'bank transactions' }
const { sf, isGroup, companies } = await useCoScope()
const f = reactive({ url: '', name: '', link: true, currency: props.currency ?? 'USD', account: '', entity: '', all_out: '' as '' | 'true' | 'false' })
const busy = ref(false), msg = ref(''), ok = ref('')
const res = ref<{ pending: string | null; summary: ImportSummary; rows: number; columns: { field: string; column: string }[]; ai: boolean; all_out: boolean | null } | null>(null)
interface L { id: string; name: string; url: string | null; source: string; auto: boolean; last_synced_at: string | null; last_result: { added: number; updated: number; waiting?: number } | null; last_error: string | null; pending_id: string | null }
const links = ref<L[]>([])
async function loadLinks() { try { links.value = await sf<L[]>('/api/growth/links', { query: { kind: props.kind, process_id: props.processId || undefined } }) } catch { links.value = [] } }
watch(() => props.open, (o) => { if (o) { res.value = null; msg.value = ''; ok.value = ''; f.url = ''; crm.token = ''; void loadLinks() } })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read that.'
let last: FormData | Record<string, string> | null = null
async function fromFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return
  const fd = new FormData(); fd.append('file', file, file.name); fd.append('kind', props.kind); if (props.processId) fd.append('process_id', props.processId); fd.append('currency', f.currency); fd.append('account', f.account || file.name.replace(/\.[a-z]+$/i, '')); if (f.entity) fd.append('entity_id', f.entity); if (f.all_out) fd.append('all_out', f.all_out)
  await go(fd)
}
async function fromLink() { await go({ kind: props.kind, process_id: props.processId ?? '', url: f.url, link: f.link ? 'true' : 'false', name: f.name || 'Linked sheet', currency: f.currency, account: f.account || f.name || 'Linked sheet', entity_id: f.entity, all_out: f.all_out }) }
async function go(body: FormData | Record<string, string>) {
  busy.value = true; msg.value = ''; ok.value = ''; res.value = null; last = body
  try { res.value = await sf('/api/growth/import', { method: 'POST', body }) } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// A card export read the wrong way round: read it again with the choice flipped.
async function flip() { if (!last || !res.value) return; const v = res.value.all_out ? 'false' : 'true'; f.all_out = v; if (last instanceof FormData) last.set('all_out', v); else last.all_out = v; await go(last) }
async function settle(id: string, accept: boolean) {
  busy.value = true; msg.value = ''
  try { const r = await sf<{ added: number; updated: number; link: string | null }>('/api/growth/pending/settle', { method: 'POST', body: { id, accept } }); res.value = null; ok.value = accept ? r.added + ' added, ' + r.updated + ' updated' + (r.link ? '; the link is kept in step and later changes will wait here for you.' : '.') : 'Dismissed; nothing was changed.'; if (accept) emit('done'); await loadLinks() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const review = ref<{ id: string; name: string; summary: ImportSummary } | null>(null)
async function act(l: L, action: 'sync' | 'auto_on' | 'auto_off' | 'delete' | 'review') {
  if (action === 'review') { const ps = await sf<{ id: string; name: string; summary: ImportSummary }[]>('/api/growth/pending', { query: { kind: props.kind, process_id: props.processId || undefined } }); review.value = ps.find((x) => x.id === l.pending_id) ?? null; return }
  if (action === 'delete' && !await askConfirm('Unlink "' + l.name + '"? What it brought in stays.')) return
  busy.value = true; msg.value = ''
  try { const r = await sf<{ pending?: string | null; summary?: ImportSummary }>('/api/growth/links', { method: 'POST', body: { id: l.id, action } }); if (action === 'sync') { if (r.pending && r.summary) review.value = { id: r.pending, name: l.name, summary: r.summary }; else ok.value = l.name + ' is up to date.' } await loadLinks() } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// CRMs (deals): read-only, by key.
const CRM: Record<string, { label: string; key: string; help: string }> = {
  hubspot: { label: 'HubSpot', key: 'Private app access token', help: 'In HubSpot: Settings → Integrations → Private apps → Create a private app with read access to deals, companies and owners, then copy its access token.' },
  pipedrive: { label: 'Pipedrive', key: 'Personal API token', help: 'In Pipedrive: your name (top right) → Personal preferences → API → copy your personal API token.' },
}
const crm = reactive({ source: '' as '' | 'hubspot' | 'pipedrive', token: '' })
async function connect() {
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await sf<{ pending: string | null; summary: ImportSummary }>('/api/growth/connect', { method: 'POST', body: { process_id: props.processId, source: crm.source, token: crm.token } }); crm.token = ''; const nm = CRM[crm.source]!.label; crm.source = ''; if (r.pending) review.value = { id: r.pending, name: nm, summary: r.summary }; else ok.value = nm + ' connected; your deals already match.'; await loadLinks() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
function template() {
  const blob = new Blob([HEAD[props.kind]!.join(',') + '\n'], { type: 'text/csv' }), u = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = u; a.download = 'finvry-' + WHAT[props.kind]!.replace(/ /g, '-') + '-template.csv'; a.click(); URL.revokeObjectURL(u)
}
const LABEL: Record<string, string> = { name: 'Deal', account: 'Customer', status: 'Won or lost', external_id: 'Record ID', contact: 'Contact', value: 'Value', stage: 'Stage', expected_close: 'Expected close', source: 'Source', owner: 'Owner', notes: 'Notes', month: 'Month', channel: 'Channel', spend: 'Spend', visitors: 'Visitors', leads: 'Leads', mqls: 'Marketing qualified', sqls: 'Sales qualified', customers: 'Customers', revenue: 'Revenue', date: 'Date', description: 'Description', spender: 'Who spent', amount: 'Amount', debit: 'Money out', credit: 'Money in' }
const srcLabel = (l: L) => (l.source === 'hubspot' ? 'HubSpot' : l.source === 'pipedrive' ? 'Pipedrive' : 'Sheet')
</script>
<template>
  <AppModal :open="open" :title="'Bring in ' + WHAT[kind]" wide @close="emit('close')">
    <div class="si">
      <p class="lead">One row per {{ kind === 'sales_deals' ? 'deal' : kind === 'marketing_months' ? 'channel and month' : 'transaction' }}, headings in the first row. Headings are matched for you, with AI filling in what they leave open{{ kind === 'sales_deals' ? ' (including your sheet\'s stage names)' : kind === 'marketing_months' ? ' (including your channel names)' : '' }}. <button class="lk" type="button" @click="template">Download a template</button></p>
      <label v-if="kind === 'bank_txns' && isGroup">Company<select v-model="f.entity"><option value="">{{ companies.find((c) => c.main)?.name ?? 'Main company' }}</option><option v-for="c in companies.filter((x) => !x.main)" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
      <div v-if="kind === 'bank_txns'" class="g2"><label>Account<input v-model="f.account" maxlength="120" placeholder="e.g. GTBank current ··1234"></label><label>Currency<select v-model="f.currency"><option>NGN</option><option>USD</option><option>GBP</option><option>EUR</option><option>KES</option><option>GHS</option><option>ZAR</option></select></label></div>
      <DropZone accept=".xlsx,.csv" :disabled="busy" hint="Excel or CSV · brought in once" @change="fromFile" />
      <label v-if="kind === 'bank_txns'" class="cb"><input type="checkbox" :checked="f.all_out === 'true'" @change="f.all_out = ($event.target as HTMLInputElement).checked ? 'true' : ''"> A card or expense export (Brex, Ramp, Amex…): every row is a payment</label>
      <div class="or"><span>or link a sheet</span></div>
      <div class="lnk"><input v-model="f.url" placeholder="Paste a Google Sheets, Excel online or Dropbox share link" aria-label="Sheet link"><input v-model="f.name" maxlength="120" placeholder="Name (optional)" aria-label="Name" class="nm"><button class="btn" :disabled="busy || f.url.length < 10" @click="fromLink">{{ busy ? 'Reading…' : 'Bring in' }}</button></div>
      <label class="cb"><input v-model="f.link" type="checkbox"> Keep in step (checked when this page opens, at most every six hours; changes wait for you to accept)</label>
      <template v-if="kind === 'sales_deals' && processId">
        <div class="or"><span>or connect your CRM</span></div>
        <p class="mut">Read-only, to build the pipeline and the reports investors expect; your CRM stays where the team works. Salesforce, Zoho, Close, Attio and others: export your deals or opportunities report to Excel or CSV and drop it above, or link it; their headings are recognised.</p>
        <div class="crm"><button v-for="(c, k) in CRM" :key="k" type="button" class="opt" :class="{ on: crm.source === k }" @click="crm.source = crm.source === k ? '' : (k as 'hubspot' | 'pipedrive')">{{ c.label }}</button></div>
        <div v-if="crm.source" class="ck2"><p class="mut">{{ CRM[crm.source]!.help }}</p><div class="lnk"><input v-model="crm.token" type="password" autocomplete="off" :placeholder="CRM[crm.source]!.key" :aria-label="CRM[crm.source]!.key"><span /><button class="btn" :disabled="busy || crm.token.length < 10" @click="connect">{{ busy ? 'Reading deals…' : 'Connect' }}</button></div></div>
      </template>
      <AiThinking v-if="busy" compact :steps="['Reading the sheet…', 'Matching columns…', 'Matching names with AI…']" />
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="res" class="rs"><span>Matched: {{ res.columns.map((c) => (LABEL[c.field] ?? c.field) + ' ← ' + c.column).join(' · ') }}{{ res.ai ? ' · AI helped match' : '' }}</span>
        <span v-if="kind === 'bank_txns' && res.all_out !== null">{{ res.all_out ? 'Read as a card or expense export: every row is a payment.' : 'Read as a bank statement: negative amounts are money out.' }} <button class="lk" @click="flip">Read it the other way</button></span></div>
      <ImportReview v-if="res && res.pending" :summary="res.summary" :busy="busy" :what="WHAT[kind]!" @accept="settle(res!.pending!, true)" @dismiss="settle(res!.pending!, false)" />
      <p v-else-if="res" class="ok">Nothing new: your {{ WHAT[kind] }} already match.</p>
      <template v-if="review"><h3 class="rh">Updates from {{ review.name }}</h3><ImportReview :summary="review.summary" :busy="busy" :what="WHAT[kind]!" @accept="settle(review!.id, true); review = null" @dismiss="settle(review!.id, false); review = null" /></template>
      <p v-if="ok" class="ok">{{ ok }}</p>
      <div v-if="links.length" class="ls"><h3>Linked sheets and connections</h3><div v-for="l in links" :key="l.id" class="li"><div><b>{{ l.name }}</b><small>{{ srcLabel(l) }} · {{ l.last_error ? l.last_error : l.last_synced_at ? 'Synced ' + new Date(l.last_synced_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not synced yet' }} · {{ l.auto ? 'checked when this page opens; updates wait for you' : 'manual' }}</small></div>
        <span class="ac"><button v-if="l.pending_id" class="lk" @click="act(l, 'review')">Review updates</button><button class="lk" @click="act(l, 'sync')">Check now</button><button class="lk" @click="act(l, l.auto ? 'auto_off' : 'auto_on')">{{ l.auto ? 'Stop auto' : 'Keep in step' }}</button><button class="lk red" @click="act(l, 'delete')">Unlink</button></span></div></div>
    </div>
    <template #foot><span class="sp" /><button class="btn secondary" @click="emit('close')">Done</button></template>
  </AppModal>
</template>
<style scoped>
.si { display: flex; flex-direction: column; gap: 12px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.g2 { display: grid; grid-template-columns: 1fr 160px; gap: 10px; } label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
input:not([type="checkbox"]), select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.or { display: flex; align-items: center; gap: 10px; color: var(--c-muted); font-size: 12px; } .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--c-rule); }
.lnk { display: grid; grid-template-columns: 1fr 180px auto; gap: 8px; } .cb { flex-direction: row; align-items: center; gap: 8px; color: var(--c-ink-soft); }
.rs { border: 1px solid var(--c-rule); background: #f6f8fb; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; } .rs span { color: var(--c-ink-soft); font-size: 12.5px; }
.ls h3 { margin: 4px 0 6px; font-size: 14px; } .li { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-top: 1px solid var(--c-rule); padding: 8px 0; font-size: 13.5px; } .li small { display: block; color: var(--c-muted); font-size: 12px; } .ac { display: flex; gap: 12px; white-space: nowrap; }
.sp { flex: 1; } @media (max-width: 720px) { .lnk, .g2 { grid-template-columns: 1fr; } }
.mut { margin: 0; color: var(--c-muted); font-size: 12.5px; line-height: 1.5; } .ok { margin: 0; color: var(--c-ink-soft); font-size: 13px; } .rh { margin: 4px 0 0; font-size: 14px; }
.crm { display: flex; gap: 8px; } .opt { font: inherit; font-size: 13px; padding: 7px 14px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .opt.on { border-color: var(--c-navy); background: var(--c-navy); color: #fff; } .ck2 { display: flex; flex-direction: column; gap: 6px; }
</style>
