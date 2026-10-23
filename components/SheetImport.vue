<script setup lang="ts">
// Bring a spreadsheet into Sales (deals), Marketing (results by channel and month) or Banking (transactions): drag in
// an Excel or CSV file, or paste a Google Sheets / Excel online / Dropbox link and keep it in step. Columns are matched
// by their headings, with AI filling in what the headings leave open; the sheet's own stage and channel names are
// matched to yours. Linked sheets are listed with Sync now and Unlink.
const props = defineProps<{ open: boolean; kind: 'sales_deals' | 'marketing_months' | 'bank_txns'; processId?: string | null; currency?: string }>()
const emit = defineEmits<{ close: []; done: [] }>()
const HEAD: Record<string, string[]> = { sales_deals: ['Deal', 'Contact', 'Value', 'Stage', 'Expected close', 'Source', 'Owner', 'Notes'], marketing_months: ['Month', 'Channel', 'Spend', 'Visitors', 'Leads', 'Marketing qualified', 'Sales qualified', 'Customers', 'Revenue'], bank_txns: ['Date', 'Description', 'Money in', 'Money out', 'Balance'] }
const WHAT: Record<string, string> = { sales_deals: 'deals', marketing_months: 'channel results', bank_txns: 'bank transactions' }
const f = reactive({ url: '', name: '', link: true, currency: props.currency ?? 'USD', account: '' })
const busy = ref(false), msg = ref(''), res = ref<{ added: number; updated: number; skipped: number; rows: number; columns: { field: string; column: string }[]; ai: boolean; link: string | null } | null>(null)
interface L { id: string; name: string; url: string; auto: boolean; last_synced_at: string | null; last_result: { added: number; updated: number } | null; last_error: string | null }
const links = ref<L[]>([])
async function loadLinks() { try { links.value = await $fetch<L[]>('/api/growth/links', { query: { kind: props.kind, process_id: props.processId || undefined } }) } catch { links.value = [] } }
watch(() => props.open, (o) => { if (o) { res.value = null; msg.value = ''; f.url = ''; void loadLinks() } })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read that sheet.'
async function fromFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return
  const fd = new FormData(); fd.append('file', file, file.name); fd.append('kind', props.kind); if (props.processId) fd.append('process_id', props.processId); fd.append('currency', f.currency); fd.append('account', f.account || file.name.replace(/\.[a-z]+$/i, ''))
  await go(fd)
}
async function fromLink() { await go({ kind: props.kind, process_id: props.processId ?? '', url: f.url, link: f.link ? 'true' : 'false', name: f.name || 'Linked sheet', currency: f.currency, account: f.account || f.name || 'Linked sheet' }) }
async function go(body: FormData | Record<string, string>) {
  busy.value = true; msg.value = ''; res.value = null
  try { res.value = await $fetch('/api/growth/import', { method: 'POST', body }); emit('done'); await loadLinks() } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function act(l: L, action: 'sync' | 'auto_on' | 'auto_off' | 'delete') {
  if (action === 'delete' && !await askConfirm('Unlink "' + l.name + '"? What it brought in stays.')) return
  try { await $fetch('/api/growth/links', { method: 'POST', body: { id: l.id, action } }); if (action === 'sync') emit('done'); await loadLinks() } catch (e) { msg.value = err(e) }
}
function template() {
  const blob = new Blob([HEAD[props.kind]!.join(',') + '\n'], { type: 'text/csv' }), u = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = u; a.download = 'finvry-' + WHAT[props.kind]!.replace(/ /g, '-') + '-template.csv'; a.click(); URL.revokeObjectURL(u)
}
const LABEL: Record<string, string> = { name: 'Deal', contact: 'Contact', value: 'Value', stage: 'Stage', expected_close: 'Expected close', source: 'Source', owner: 'Owner', notes: 'Notes', month: 'Month', channel: 'Channel', spend: 'Spend', visitors: 'Visitors', leads: 'Leads', mqls: 'Marketing qualified', sqls: 'Sales qualified', customers: 'Customers', revenue: 'Revenue', date: 'Date', description: 'Description', amount: 'Amount', debit: 'Money out', credit: 'Money in' }
</script>
<template>
  <AppModal :open="open" :title="'Bring in ' + WHAT[kind]" wide @close="emit('close')">
    <div class="si">
      <p class="lead">One row per {{ kind === 'sales_deals' ? 'deal' : kind === 'marketing_months' ? 'channel and month' : 'transaction' }}, headings in the first row. Headings are matched for you, with AI filling in what they leave open{{ kind === 'sales_deals' ? ' (including your sheet\'s stage names)' : kind === 'marketing_months' ? ' (including your channel names)' : '' }}. <button class="lk" type="button" @click="template">Download a template</button></p>
      <div v-if="kind === 'bank_txns'" class="g2"><label>Account<input v-model="f.account" maxlength="120" placeholder="e.g. GTBank current ··1234"></label><label>Currency<select v-model="f.currency"><option>NGN</option><option>USD</option><option>GBP</option><option>EUR</option><option>KES</option><option>GHS</option><option>ZAR</option></select></label></div>
      <DropZone accept=".xlsx,.csv" :disabled="busy" hint="Excel or CSV · brought in once" @change="fromFile" />
      <div class="or"><span>or link a sheet</span></div>
      <div class="lnk"><input v-model="f.url" placeholder="Paste a Google Sheets, Excel online or Dropbox share link" aria-label="Sheet link"><input v-model="f.name" maxlength="120" placeholder="Name (optional)" aria-label="Name" class="nm"><button class="btn" :disabled="busy || f.url.length < 10" @click="fromLink">{{ busy ? 'Reading…' : 'Bring in' }}</button></div>
      <label class="cb"><input v-model="f.link" type="checkbox"> Keep in step (updated when this page opens, at most every six hours)</label>
      <AiThinking v-if="busy" compact :steps="['Reading the sheet…', 'Matching columns…', 'Matching names with AI…']" />
      <p v-if="msg" class="error">{{ msg }}</p>
      <div v-if="res" class="rs"><b>{{ res.added }} added, {{ res.updated }} updated{{ res.skipped ? ', ' + res.skipped + ' rows skipped (missing ' + (kind === 'sales_deals' ? 'a name' : kind === 'marketing_months' ? 'a month or channel' : 'a date, description or amount') + ')' : '' }}.</b>
        <span>Matched: {{ res.columns.map((c) => LABEL[c.field] + ' ← ' + c.column).join(' · ') }}{{ res.ai ? ' · AI helped match' : '' }}</span></div>
      <div v-if="links.length" class="ls"><h3>Linked sheets</h3><div v-for="l in links" :key="l.id" class="li"><div><b>{{ l.name }}</b><small>{{ l.last_error ? l.last_error : l.last_synced_at ? 'Synced ' + new Date(l.last_synced_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not synced yet' }} · {{ l.auto ? 'kept in step' : 'manual' }}</small></div>
        <span class="ac"><button class="lk" @click="act(l, 'sync')">Sync now</button><button class="lk" @click="act(l, l.auto ? 'auto_off' : 'auto_on')">{{ l.auto ? 'Stop auto' : 'Keep in step' }}</button><button class="lk red" @click="act(l, 'delete')">Unlink</button></span></div></div>
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
</style>
