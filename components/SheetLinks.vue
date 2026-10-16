<script setup lang="ts">
// Live-linked spreadsheets: link a shared Google Sheet, Excel online or Dropbox file, choose which rows feed
// Financials (statement lines and custom metrics) or a forecast, and it stays in step: read on open, daily, or on
// "Sync now".
interface Link { id: string; name: string; url: string; target: 'financials' | 'forecast'; subject: string | null; forecast_id: string | null; forecast: string | null; currency: string; sheet: string | null; mapping: { label: string; to: string }[]; auto: boolean; last_synced_at: string | null; last_error: string | null; last_result: { months?: number; skipped?: string[]; sheet?: string } | null }
interface Prev { provider: string; keys: { key: string; label: string }[]; sheets: { sheet: string; months: string[]; rows: { label: string; last_month: string; last_value: number; months: number }[]; suggestion: { label: string; to: string }[] }[] }
const props = withDefaults(defineProps<{ target: 'financials' | 'forecast'; subject?: string; subjectLabel?: string; currency?: string; forecasts?: { id: string; name: string }[]; forecastId?: string; canEdit?: boolean }>(), { subject: '', subjectLabel: '', currency: 'USD', forecasts: () => [], forecastId: '', canEdit: false })
const emit = defineEmits<{ synced: [] }>()
const links = ref<Link[]>([])
const shown = computed(() => links.value.filter((l) => props.target === 'forecast' || !props.subject || l.subject === props.subject))
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? d
async function load() { try { links.value = (await $fetch<{ links: Link[] }>('/api/sheet-links', { query: { target: props.target } })).links } catch { links.value = [] } }
onMounted(async () => {
  await load()
  // Bring stale links up to date in the background, then refresh what the page shows.
  if (links.value.some((l) => l.auto && (!l.last_synced_at || Date.now() - new Date(l.last_synced_at).getTime() > 3600_000))) {
    try { const r = await $fetch<{ synced: number }>('/api/sheet-links/stale', { method: 'POST', query: { target: props.target } }); await load(); if (r.synced) emit('synced') } catch { /* shown on the link */ }
  }
})
const busyId = ref(''), note = ref(''), noteErr = ref(false)
async function syncNow(l: Link) {
  busyId.value = l.id; note.value = ''
  try { const r = await $fetch<{ months: number; skipped: string[] }>('/api/sheet-links/' + l.id + '/sync', { method: 'POST' }); note.value = l.name + ': ' + r.months + ' month' + (r.months === 1 ? '' : 's') + ' updated' + (r.skipped.length ? '; skipped ' + r.skipped.join(', ') : '') + '.'; noteErr.value = false; emit('synced') }
  catch (e) { note.value = err(e, 'Could not read the sheet.'); noteErr.value = true } finally { busyId.value = ''; await load() }
}
async function unlink(l: Link) { if (!confirm('Unlink "' + l.name + '"? Figures already brought in stay.')) return; await $fetch('/api/sheet-links/' + l.id, { method: 'DELETE' }).catch(() => {}); await load() }
const ago = (t: string | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago' }
const mon = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// The link form.
const open = ref(false), step = ref(1), busy = ref(false), msg = ref('')
const f = reactive({ id: '', name: '', url: '', sheet: '', forecast_id: '', currency: 'USD', auto: true })
const prev = ref<Prev | null>(null), map = ref<Record<string, string>>({}), keep = ref<{ label: string; to: string }[] | null>(null)
const tab = computed(() => prev.value?.sheets.find((s) => s.sheet === f.sheet) ?? prev.value?.sheets[0] ?? null)
function start(l?: Link) {
  Object.assign(f, { id: l?.id ?? '', name: l?.name ?? '', url: l?.url ?? '', sheet: l?.sheet ?? '', forecast_id: l?.forecast_id ?? props.forecastId ?? props.forecasts[0]?.id ?? '', currency: l?.currency ?? props.currency, auto: l?.auto ?? true })
  keep.value = l?.mapping ?? null; prev.value = null; map.value = {}; msg.value = ''; step.value = 1; open.value = true
  if (l) read()
}
function applyMap() {
  const t = tab.value; if (!t) return
  const src = keep.value && (f.sheet === '' || t.sheet === f.sheet) ? keep.value : t.suggestion
  map.value = Object.fromEntries(t.rows.map((r) => [r.label, src.find((m) => m.label.toLowerCase() === r.label.toLowerCase())?.to ?? '']))
}
async function read() {
  if (!f.url.trim()) { msg.value = 'Paste the share link.'; return }
  busy.value = true; msg.value = ''
  try {
    prev.value = await $fetch<Prev>('/api/sheet-links/preview', { method: 'POST', body: { url: f.url, target: props.target } })
    if (!prev.value.sheets.some((s) => s.sheet === f.sheet)) f.sheet = prev.value.sheets[0]!.sheet
    if (!f.name) f.name = f.sheet ? prev.value.provider + ': ' + f.sheet : prev.value.provider
    applyMap(); step.value = 2
  } catch (e) { msg.value = err(e, 'Could not read that sheet.') } finally { busy.value = false }
}
watch(() => f.sheet, () => { if (step.value === 2) { keep.value = null; applyMap() } })
const used = computed(() => Object.values(map.value).filter((v) => v && v !== 'kpi'))
const dup = (k: string) => k && k !== 'kpi' && used.value.filter((v) => v === k).length > 1
const chosen = computed(() => Object.values(map.value).filter(Boolean).length)
async function save() {
  if (props.target === 'forecast' && !f.forecast_id) { msg.value = 'Save a forecast first, then link the sheet to it.'; return }
  busy.value = true; msg.value = ''
  try {
    const r = await $fetch<{ months?: number; skipped?: string[]; error?: string }>('/api/sheet-links', { method: 'POST', body: { id: f.id || undefined, name: f.name, url: f.url, target: props.target, subject: props.target === 'financials' ? props.subject : undefined, forecast_id: props.target === 'forecast' ? f.forecast_id : undefined, currency: f.currency, sheet: tab.value?.sheet ?? '', auto: f.auto, mapping: Object.entries(map.value).map(([label, to]) => ({ label, to })) } })
    open.value = false; noteErr.value = !!r.error
    note.value = r.error ? 'Linked, but the first read failed: ' + r.error : 'Linked. ' + (r.months ?? 0) + ' month' + (r.months === 1 ? '' : 's') + ' brought in' + (r.skipped?.length ? '; skipped ' + r.skipped.join(', ') : '') + '.'
    await load(); emit('synced')
  } catch (e) { msg.value = err(e, 'Could not save the link.') } finally { busy.value = false }
}
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
</script>
<template>
  <div class="sl">
    <div class="slh"><div><b>Linked sheets</b><span class="sub">{{ target === 'forecast' ? 'Months from your sheet become figures in a forecast' : 'Rows from your sheet fill these statements' }}, kept in step automatically.</span></div>
      <button v-if="canEdit && (target === 'forecast' || (subject && subject !== 'group'))" class="btn secondary sm" type="button" @click="start()">Link a sheet</button></div>
    <p v-if="note" :class="noteErr ? 'error' : 'okm'">{{ note }}</p>
    <ul v-if="shown.length" class="sll">
      <li v-for="l in shown" :key="l.id">
        <div class="slm"><b>{{ l.name }}</b><span>{{ l.target === 'forecast' ? 'Forecast: ' + (l.forecast ?? '—') : (l.sheet ? 'Tab ' + l.sheet + ' · ' : '') + l.currency }} · {{ l.mapping.length }} row{{ l.mapping.length === 1 ? '' : 's' }} · synced {{ ago(l.last_synced_at) }}{{ l.last_result?.months !== undefined && !l.last_error ? ' (' + l.last_result.months + ' months)' : '' }}{{ l.auto ? '' : ' · manual only' }}</span>
          <span v-if="l.last_error" class="slx">{{ l.last_error }}</span></div>
        <div v-if="canEdit" class="sla"><button class="link" type="button" :disabled="busyId === l.id" @click="syncNow(l)">{{ busyId === l.id ? 'Syncing…' : 'Sync now' }}</button><button class="link" type="button" @click="start(l)">Edit</button><button class="link" type="button" @click="unlink(l)">Unlink</button></div>
      </li>
    </ul>
    <p v-else-if="target === 'financials' && (!subject || subject === 'group')" class="sub">Choose a company or entity to link a sheet.</p>
    <AppModal :open="open" :title="f.id ? 'Edit linked sheet' : 'Link a sheet'" wide @close="open = false">
      <div v-if="step === 1" class="slf">
        <label class="fl">Share link<input v-model="f.url" type="url" maxlength="600" placeholder="https://docs.google.com/spreadsheets/d/… or an Excel online / Dropbox link"></label>
        <p class="sub">Share the file so anyone with the link can view it. Put the months across one heading row (Jan 2026, Feb 2026…) and line names down a column; your other tabs and formulas can stay as they are.</p>
      </div>
      <div v-else-if="prev && tab" class="slf">
        <div class="g3">
          <label class="fl">Name<input v-model="f.name" maxlength="120"></label>
          <label v-if="prev.sheets.length > 1" class="fl">Tab<select v-model="f.sheet"><option v-for="s in prev.sheets" :key="s.sheet" :value="s.sheet">{{ s.sheet }}</option></select></label>
          <label v-if="target === 'forecast'" class="fl">Forecast<select v-model="f.forecast_id"><option v-for="x in forecasts" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
          <label v-else class="fl">Currency<input v-model="f.currency" maxlength="3" pattern="[A-Z]{3}"></label>
        </div>
        <p class="sub">{{ prev.provider }} · {{ tab.months.length }} months, {{ mon(tab.months[0]!) }} to {{ mon(tab.months[tab.months.length - 1]!) }}{{ target === 'financials' ? ' (months after this one are left out)' : '' }} · into {{ target === 'forecast' ? 'the forecast as given months' : subjectLabel || 'this company' }}</p>
        <div class="tw"><table class="mt" data-nosearch><thead><tr><th>Row in your sheet</th><th class="n">Latest</th><th>Use as</th></tr></thead>
          <tbody><tr v-for="r in tab.rows" :key="r.label" :class="{ off: !map[r.label] }"><td>{{ r.label }}</td><td class="n">{{ fmt(r.last_value) }} <span class="sub">{{ mon(r.last_month) }}</span></td>
            <td><select v-model="map[r.label]" :class="{ bad: dup(map[r.label] ?? '') }" :aria-label="'Use ' + r.label + ' as'"><option value="">Don't use</option><option v-for="k in prev.keys" :key="k.key" :value="k.key">{{ k.label }}</option></select></td></tr></tbody></table></div>
        <label class="ck"><input v-model="f.auto" type="checkbox"> Keep in step automatically (daily, and when this page opens)</label>
      </div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <template #foot>
        <button class="btn secondary" type="button" @click="step === 2 && !f.id ? (step = 1) : (open = false)">{{ step === 2 && !f.id ? 'Back' : 'Cancel' }}</button>
        <button v-if="step === 1" class="btn" type="button" :disabled="busy" @click="read">{{ busy ? 'Reading…' : 'Read sheet' }}</button>
        <button v-else class="btn" type="button" :disabled="busy || !chosen || used.length !== new Set(used).size" @click="save">{{ busy ? 'Linking…' : 'Link ' + chosen + ' row' + (chosen === 1 ? '' : 's') }}</button>
      </template>
    </AppModal>
  </div>
</template>
<style scoped>
.sl { border: 1px solid var(--c-rule-strong); background: #fff; padding: 12px 14px; margin: 12px 0 }
.slh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap }
.slh b { display: block; font-size: 14px }
.sub { color: var(--c-muted); font-size: 12.5px }
.sll { list-style: none; margin: 10px 0 0; padding: 0 }
.sll li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--c-rule-strong); flex-wrap: wrap }
.slm { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
.slm span { color: var(--c-muted); font-size: 12.5px }
.slm .slx { color: var(--c-danger) }
.sla { display: flex; gap: 14px; align-items: center }
.sla button { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer }
.sla button:disabled { color: var(--c-muted); cursor: default }
.slf { display: flex; flex-direction: column; gap: 10px }
.fl { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--c-muted) }
.fl input, .fl select, .mt select { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--c-rule-strong); background: #fff; font: inherit; font-size: 14px; color: var(--c-ink); border-radius: 0 }
.mt { width: 100%; border-collapse: collapse; font-size: 13.5px }
.mt th { position: sticky; top: 0; background: #fafafa; text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12px; padding: 8px 12px; border-bottom: 1px solid var(--c-rule-strong) }
.mt td { padding: 6px 12px; border-top: 1px solid var(--c-rule) }
.mt td:last-child { width: 42% }
.g3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px }
.tw { max-height: 46vh; overflow: auto; border: 1px solid var(--c-rule-strong) }
tr.off td:first-child { color: var(--c-muted) }
select.bad { border-color: var(--c-danger) }
.ck { display: flex; gap: 8px; align-items: center; font-size: 13px }
.okm { color: var(--c-ink); font-size: 13px; margin: 8px 0 0 }
td.n, th.n { text-align: right; white-space: nowrap }
</style>
