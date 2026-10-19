<script setup lang="ts">
// Past reports for one portfolio company: drop PDFs, AI reads each one, a person checks the figures and notes, then
// they go into the company's monthly figures (US dollars) and founder notes.
const props = defineProps<{ companyId: string; companyName: string; canUpload: boolean }>()
const emit = defineEmits<{ imported: [] }>()
interface P { month: string; months_covered: number; revenue_total: number | null; net_burn_monthly: number | null; cash: number | null; customers: number | null; headcount: number | null; gross_margin_pct: number | null }
interface R { company: string | null; title: string; period_label: string; currency: string; usd_rate: number | null; periods: P[]; other_kpis: { name: string; value: number; unit: string; period: string }[]; highlights: string; challenges: string; asks: string; has_figures: boolean; notes: string }
interface Item { key: string; name: string; state: 'waiting' | 'reading' | 'review' | 'saving' | 'saved' | 'failed' | 'skipped'; msg: string; doc?: string; rep?: R; rate?: string; rateSource?: string; dup?: { title: string; imported_at: string } | null; notes: boolean; saved?: string }
interface Imp { id: string; title: string; period_label: string | null; period_end: string | null; currency: string; rate: number; months: number; values_saved: number; document_id: string | null; imported_at: string; by_name: string | null }
const { data: list, refresh } = await useFetch<Imp[]>(() => '/api/portfolio/' + props.companyId + '/reports', { default: () => [] })
const items = ref<Item[]>([]); const open = ref<string>('')
let running = false
// Delete an imported report and the figures it brought in (figures sent or corrected since stay).
async function delReport(r: Imp) {
  if (!confirm('Delete "' + r.title + '" and the ' + r.values_saved + ' figure' + (r.values_saved === 1 ? '' : 's') + ' it brought in? Figures changed since stay. The file stays in Documents.')) return
  try { await $fetch('/api/portfolio/' + props.companyId + '/reports/' + r.id, { method: 'DELETE' }); await refresh(); emit('imported') } catch (e) { alert(err(e)) }
}
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.' }
const files = new Map<string, File>()
function add(ev: Event) {
  for (const f of Array.from((ev.target as HTMLInputElement).files ?? [])) { const key = f.name + ':' + f.size + ':' + Math.random().toString(36).slice(2, 6); files.set(key, f); items.value.push({ key, name: f.name, state: 'waiting', msg: '', notes: true }) }
  void run()
}
async function run() {
  if (running) return; running = true
  try {
    for (const it of items.value) {
      if (it.state !== 'waiting') continue
      it.state = 'reading'
      const fd = new FormData(); fd.append('file', files.get(it.key)!)
      try {
        const r = await $fetch<{ document_id: string; extracted: R; rate: number | null; rate_source: string; duplicate: Item['dup'] }>('/api/portfolio/' + props.companyId + '/reports/read', { method: 'POST', body: fd })
        Object.assign(it, { state: 'review', doc: r.document_id, rep: r.extracted, rate: r.rate ? String(Math.round(r.rate * 10000) / 10000) : '', rateSource: r.rate_source, dup: r.duplicate })
        if (!open.value) open.value = it.key
      } catch (e) { it.state = 'failed'; it.msg = err(e) }
    }
  } finally { running = false }
}
const nf = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d }))
const usd = (v: number | null, it: Item) => { const r = it.rep?.currency === 'USD' ? 1 : Number(it.rate); return v === null || !r ? '—' : '$' + nf(v / r) }
const cur = (it: Item) => it.rep?.currency ?? 'USD'
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ' }
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const span = (p: P) => (p.months_covered === 1 ? mon(p.month) : p.months_covered + ' months to ' + mon(p.month))
function numIn(p: P, k: keyof P, v: string) { const n = v.trim() === '' ? null : Number(v.replace(/[^0-9.-]/g, '')); (p as unknown as Record<string, unknown>)[k] = n === null || Number.isFinite(n) ? n : null }
async function save(it: Item) {
  if (!it.rep || !it.doc) return
  if (it.rep.currency !== 'USD' && !(Number(it.rate) > 0)) { it.msg = 'Enter how many ' + it.rep.currency + ' make one US dollar.'; return }
  it.state = 'saving'; it.msg = ''
  try {
    const r = await $fetch<{ values: number; months: number; quarterly: boolean }>('/api/portfolio/' + props.companyId + '/reports/save', { method: 'POST', body: { document_id: it.doc, report: it.rep, rate: it.rep.currency === 'USD' ? 1 : Number(it.rate), notes: it.notes } })
    it.state = 'saved'; it.saved = r.values ? r.values + ' figure' + (r.values === 1 ? '' : 's') + ' across ' + r.months + ' ' + (r.quarterly ? 'period' : 'month') + (r.months === 1 ? '' : 's') : 'Notes saved (no figures)'
    open.value = items.value.find((x) => x.state === 'review')?.key ?? ''
    await refresh(); emit('imported')
  } catch (e) { it.state = 'review'; it.msg = err(e) }
}
function skip(it: Item) { it.state = 'skipped'; open.value = items.value.find((x) => x.state === 'review')?.key ?? '' }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch { /* ignore */ } }
const ST: Record<Item['state'], string> = { waiting: 'Waiting', reading: 'Reading…', review: 'Check and save', saving: 'Saving…', saved: 'Saved', failed: 'Could not read', skipped: 'Skipped' }
const FIELDS: [keyof P, string, boolean][] = [['revenue_total', 'Revenue (period)', true], ['net_burn_monthly', 'Net burn / month', true], ['cash', 'Cash at end', true], ['customers', 'Customers', false], ['headcount', 'Headcount', false], ['gross_margin_pct', 'Gross margin %', false]]
</script>
<template>
  <div class="card pr">
    <div class="ph"><div><h2>Past reports</h2><p class="mut">Drop the company's reports in the Aidi report template (read exactly, with no AI) or as PDFs (investor updates, emails saved as PDF, fund-utilisation reports, read with AI). You check the numbers before they go into the figures and notes below.</p></div>
      <a class="btn secondary sm" :href="'/api/portfolio/report-template?company=' + encodeURIComponent(companyName)">Report template</a></div>
    <DropZone v-if="canUpload" accept=".pdf,application/pdf,.xlsx,.csv" no-tip multiple :label="'Drag and drop ' + companyName + ' reports here'" hint="The Aidi report template (Excel) or PDFs, several at once · or click to choose" @change="add" />
    <div v-if="items.length" class="q">
      <div v-for="it in items" :key="it.key" class="qi" :class="[it.state, { on: open === it.key }]">
        <button type="button" class="qh" :disabled="it.state !== 'review' && it.state !== 'saved'" @click="open = open === it.key ? '' : it.key">
          <FileBadge :name="it.name" size="sm" /><span class="qn"><b>{{ it.rep?.title || it.name }}</b><em>{{ it.rep ? it.rep.period_label + ' · ' + it.rep.currency : it.name }}</em></span>
          <span class="qs" :class="it.state">{{ it.state === 'saved' ? '✓ ' + it.saved : ST[it.state] }}</span></button>
        <p v-if="it.state === 'failed'" class="error sm">{{ it.msg }}</p>
        <div v-if="open === it.key && it.rep && (it.state === 'review' || it.state === 'saving')" class="rv">
          <p v-if="it.dup" class="warn">This file was already imported on {{ it.dup.imported_at }} ("{{ it.dup.title }}"). Saving again overwrites the same months.</p>
          <p v-if="it.rep.company && !it.rep.company.toLowerCase().includes(companyName.toLowerCase().split(' ')[0]!)" class="warn">This report looks like it is about <b>{{ it.rep.company }}</b>, not {{ companyName }}. Check before saving.</p>
          <p v-if="!it.rep.has_figures" class="warn">No figures found in this file (it may only link to the real report). You can still save its notes.</p>
          <div class="g3">
            <label class="label">Title<input v-model="it.rep.title" maxlength="200"></label>
            <label class="label">Period<input v-model="it.rep.period_label" maxlength="80"></label>
            <label v-if="it.rep.currency !== 'USD'" class="label">{{ it.rep.currency }} per US$1<input v-model="it.rate" inputmode="decimal"><em class="hint">{{ it.rateSource === 'report' ? 'From the report itself' : it.rateSource === 'today' ? "Today's rate: change it to the rate at the time" : 'Enter the rate at the time' }}</em></label>
          </div>
          <div v-if="it.rep.periods.length" class="tw"><table class="t" data-nosearch>
            <thead><tr><th>Period</th><th v-for="f in FIELDS" :key="f[0]">{{ f[1] }}<span v-if="f[2]" class="u">{{ cur(it) }}</span></th></tr></thead>
            <tbody><tr v-for="(p, i) in it.rep.periods" :key="i"><td class="pl">{{ span(p) }}</td>
              <td v-for="f in FIELDS" :key="f[0]"><input :value="p[f[0]] ?? ''" inputmode="decimal" :aria-label="f[1] + ' ' + span(p)" @change="numIn(p, f[0], ($event.target as HTMLInputElement).value)"><em v-if="f[2] && cur(it) !== 'USD' && p[f[0]] !== null" class="cv">{{ usd(p[f[0]] as number, it) }}</em></td></tr></tbody>
          </table></div>
          <p class="mut sm">Saved in US dollars for the period each figure covers: a quarter stays a quarter (its total revenue, average monthly burn, and cash, customers, headcount and margin at the end). Corrections your team made earlier are kept.</p>
          <div v-if="it.rep.other_kpis.length" class="kp"><span v-for="k in it.rep.other_kpis" :key="k.name"><b>{{ k.name }}</b> {{ (SYM[k.unit] ?? '') + nf(k.value, 2) }}{{ SYM[k.unit] ? '' : ' ' + k.unit }}<em v-if="k.period"> · {{ k.period }}</em></span></div>
          <div class="g3 nt"><label class="label">Highlights<textarea v-model="it.rep.highlights" rows="5" /></label><label class="label">Challenges<textarea v-model="it.rep.challenges" rows="5" /></label><label class="label">Asks<textarea v-model="it.rep.asks" rows="5" /></label></div>
          <label class="chk"><input v-model="it.notes" type="checkbox"> Add these notes to the company's founder notes</label>
          <p v-if="it.rep.notes" class="ai">✦ {{ it.rep.notes }}</p>
          <p v-if="it.msg" class="error sm">{{ it.msg }}</p>
          <div class="acts"><button type="button" class="btn secondary" @click="skip(it)">Skip</button><button type="button" class="btn" :disabled="it.state === 'saving'" @click="save(it)">{{ it.state === 'saving' ? 'Saving…' : 'Save to ' + companyName }}</button></div>
        </div>
      </div>
    </div>
    <div v-if="list.length" class="ls"><p class="kl">Imported reports</p>
      <div v-for="r in list" :key="r.id" class="li"><span class="lt"><b>{{ r.title }}</b><em>{{ r.period_label || '—' }} · {{ r.values_saved }} figure{{ r.values_saved === 1 ? '' : 's' }}{{ r.currency !== 'USD' ? ' · ' + r.currency + ' at ' + nf(r.rate, 2) + '/$' : '' }} · {{ r.imported_at }}{{ r.by_name ? ' by ' + r.by_name : '' }}</em></span>
        <span class="ra"><button v-if="r.document_id" type="button" class="lk" @click="openDoc(r.document_id)">Open file</button><button v-if="canUpload" type="button" class="lk red" @click="delReport(r)">Delete</button></span></div></div>
  </div>
</template>
<style scoped>
.pr { display: flex; flex-direction: column; gap: 14px; } .ph h2 { margin: 0 0 4px; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm { font-size: 12.5px; }
.q { display: flex; flex-direction: column; border: 1px solid var(--c-rule); } .qi + .qi { border-top: 1px solid var(--c-rule); }
.qh { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; width: 100%; padding: 10px 14px; background: #fff; border: 0; font: inherit; text-align: left; cursor: pointer; } .qh:disabled { cursor: default; } .qi.on .qh { background: var(--c-paper-2); }
.qn { display: flex; flex-direction: column; min-width: 0; } .qn b { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .qn em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.qs { font-size: 12px; padding: 3px 8px; background: #eef0f6; color: var(--c-navy); white-space: nowrap; } .qs.review { background: #fff6e6; color: #a5650b; } .qs.saved { background: #e9f6ee; color: var(--c-ok); } .qs.failed { background: #fdecef; color: var(--c-danger); } .qs.reading, .qs.saving { background: var(--c-signal-soft); color: var(--c-blue-deep); }
.qi .error { margin: 0 14px 10px; }
.rv { padding: 4px 14px 16px; display: flex; flex-direction: column; gap: 12px; background: var(--c-paper-2); }
.warn { margin: 0; background: #fff6e6; color: #7a4a06; padding: 8px 12px; font-size: 13px; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.label input, .label textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .label textarea { resize: vertical; font-size: 13px; } .hint { font-style: normal; font-size: 11.5px; color: var(--c-muted); }
.tw { overflow-x: auto; background: #fff; border: 1px solid var(--c-rule); } .t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 8px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; } .t th .u { margin-left: 4px; font-size: 10.5px; }
.t td { padding: 6px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t td input { width: 110px; font: inherit; font-size: 13px; padding: 5px 7px; border: 1px solid var(--c-rule-strong); text-align: right; font-variant-numeric: tabular-nums; } .pl { white-space: nowrap; font-weight: 500; padding-top: 11px !important; }
.cv { display: block; font-style: normal; font-size: 11px; color: var(--c-muted); text-align: right; margin-top: 2px; }
.kp { display: flex; flex-wrap: wrap; gap: 6px; } .kp span { background: #fff; border: 1px solid var(--c-rule); padding: 4px 8px; font-size: 12.5px; } .kp em { font-style: normal; color: var(--c-muted); }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; } .ai { margin: 0; font-size: 12.5px; color: var(--c-blue-deep); }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
.ls { display: flex; flex-direction: column; } .kl { margin: 0 0 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); }
.li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--c-rule); } .lt { display: flex; flex-direction: column; min-width: 0; } .lt b { font-size: 13.5px; font-weight: 600; } .lt em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
.ph { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; } .ph .btn { white-space: nowrap; text-decoration: none; } .ra { display: flex; gap: 12px; } .lk.red { color: var(--c-danger); }
</style>
