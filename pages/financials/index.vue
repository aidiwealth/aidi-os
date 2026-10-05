<script setup lang="ts">
// Financials for the group (consolidated) or any fund, entity or company: key figures, trends, expense mix and statements.
useHead({ title: 'Financials' })
interface Line { key: string; label: string; section: string }
interface Subjects { entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string; relationship: string }[]; currencies: string[]; lines: Line[]; derived: { key: string; label: string }[] }
interface St { id: string | null; period_end: string; period_type: string; currency: string; lines: Record<string, number>; kpis: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; derived: Record<string, number | null> }
const { data: subj } = await useFetch<Subjects>('/api/financials/subjects')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const subject = ref('group'); const periodType = ref('month'); const currency = ref('USD')
watchEffect(() => { if (subj.value?.currencies.length && !subj.value.currencies.includes(currency.value)) currency.value = subj.value.currencies[0]! })
const { data, refresh } = await useFetch<{ name: string; statements: St[] }>('/api/financials', { query: { subject, period_type: periodType, currency }, watch: [subject, periodType, currency] })
const rows = computed(() => data.value?.statements ?? [])
const latest = computed(() => rows.value[rows.value.length - 1]); const prev = computed(() => rows.value[rows.value.length - 2])
const cur = computed(() => latest.value?.currency ?? currency.value)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', periodType.value === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (k: string) => rows.value.filter((r) => r.derived[k] != null).map((r) => ({ label: lbl(r.period_end), value: r.derived[k] as number }))
const change = (k: string) => { const a = latest.value?.derived[k], b = prev.value?.derived[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100) }
const mix = computed(() => { const d = latest.value?.derived ?? {}; return [['cogs', 'Cost of revenue'], ['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_rnd', 'R&D'], ['opex_ga', 'G&A'], ['opex_other', 'Other']].map(([k, l]) => ({ label: l!, value: Number(d[k!] ?? 0) })) })
const isFund = computed(() => { const m = form.subject.match(/^entity:(.+)$/); return !!m && ['fund', 'spv'].includes(subj.value?.entities.find((e) => e.id === m[1])?.kind ?? '') })

// add / edit
const showForm = ref(false); const msg = ref(''); const ok = ref(''); const busy = ref(false); const aiNote = ref('')
const blank = () => ({ subject: subject.value === 'group' ? '' : subject.value, period_type: periodType.value, period_end: '', currency: currency.value, lines: {} as Record<string, string>, kpis: [] as { name: string; value: string }[], notes: '', show_to_lps: false, document_id: '' })
const form = reactive(blank())
function openForm(s?: St) {
  Object.assign(form, blank()); aiNote.value = ''; msg.value = ''; showForm.value = true
  if (s) Object.assign(form, { period_type: s.period_type, period_end: s.period_end, currency: s.currency, notes: s.notes ?? '', show_to_lps: s.show_to_lps, lines: Object.fromEntries(Object.entries(s.lines).map(([k, v]) => [k, String(v)])), kpis: Object.entries(s.kpis).map(([name, v]) => ({ name, value: String(v) })) })
}
const num = (s: string) => (s === undefined || String(s).trim() === '' ? null : Number(String(s).replace(/[^0-9.\-]/g, '')))
async function fromSheet(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('file', f); fd.append('wanted', form.period_end || 'latest period')
  try {
    const r = await $fetch<{ period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id: string }>('/api/financials/extract', { method: 'POST', body: fd })
    Object.assign(form, { period_type: r.period_type, period_end: r.period_end ?? form.period_end, currency: (r.currency || form.currency).toUpperCase(), document_id: r.document_id,
      lines: Object.fromEntries(Object.entries(r.lines).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])), kpis: Object.entries(r.kpis).map(([name, v]) => ({ name, value: String(v) })) })
    aiNote.value = r.notes + ' Check every figure before saving.'
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read the file.' } finally { busy.value = false; (ev.target as HTMLInputElement).value = '' }
}
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ replaced: boolean }>('/api/financials/statements', { method: 'POST', body: { subject: form.subject, period_type: form.period_type, period_end: form.period_end, currency: form.currency,
      lines: Object.fromEntries(Object.entries(form.lines).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== null)), kpis: Object.fromEntries(form.kpis.filter((k) => k.name.trim() && num(k.value) !== null).map((k) => [k.name.trim(), num(k.value)])),
      notes: form.notes || undefined, show_to_lps: isFund.value && form.show_to_lps, document_id: form.document_id || undefined } })
    ok.value = r.replaced ? 'Statement updated.' : 'Statement saved.'; showForm.value = false; subject.value = form.subject; periodType.value = form.period_type; currency.value = form.currency; await refresh()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}

// share links
const { data: shares, refresh: rshares } = await useFetch<{ id: string; title: string; subject: string; metrics: string[]; views: number; last_viewed_at: string | null; expires: string; expired: boolean }[]>('/api/financials/shares')
const sh = reactive({ open: false, title: '', metrics: ['revenue', 'net_income', 'cash'] as string[], days: 30, url: '' })
const metricOptions = computed(() => [...(subj.value?.lines ?? []).filter((l) => l.section !== 'cf').map((l) => ({ key: l.key, label: l.label })), ...(subj.value?.derived ?? []), ...Object.keys(latest.value?.kpis ?? {}).map((k) => ({ key: 'kpi:' + k, label: k }))])
async function share() {
  msg.value = ''
  try { const r = await $fetch<{ url: string }>('/api/financials/shares', { method: 'POST', body: { title: sh.title || (data.value?.name ?? 'Financials'), subject: subject.value, period_type: periodType.value, currency: cur.value, metrics: sh.metrics, days: sh.days } }); sh.url = r.url; await rshares() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the link.' }
}
const pctFmt = (v: number | null | undefined) => (v == null ? '—' : v + '%')
</script>

<template>
  <section>
    <p class="label">Financials</p>
    <div class="head"><h1>{{ data?.name ?? 'Financials' }}</h1>
      <div class="tools">
        <select v-model="subject" aria-label="Show figures for"><option value="group">Group (consolidated)</option>
          <optgroup v-if="subj?.entities.length" label="Funds and entities"><option v-for="e in subj.entities" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
          <optgroup v-if="subj?.companies.length" label="Companies"><option v-for="c in subj.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}{{ c.relationship === 'subsidiary' ? ' (subsidiary)' : '' }}</option></optgroup></select>
        <select v-model="periodType" aria-label="Period"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select>
        <select v-if="subject === 'group'" v-model="currency" aria-label="Currency"><option v-for="c in (subj?.currencies.length ? subj.currencies : ['USD'])" :key="c">{{ c }}</option></select>
        <button v-if="canEdit" class="btn" type="button" @click="openForm()">Add figures</button>
        <button v-if="canEdit && rows.length" class="btn secondary" type="button" @click="sh.open = !sh.open; sh.url = ''">Share</button>
      </div></div>
    <p v-if="subject === 'group'" class="muted small">Adds up every fund and entity, plus companies marked as subsidiaries, in {{ currency }}. Intercompany amounts are not eliminated.</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg && !showForm" class="error">{{ msg }}</p>

    <form v-if="showForm" class="card frm" @submit.prevent="save">
      <div class="fh"><h2>{{ form.period_end && rows.some((r) => r.period_end === form.period_end) ? 'Edit statement' : 'Add figures' }}</h2>
        <DropZone compact accept=".xlsx,.csv" :disabled="busy" :label="busy ? 'Reading…' : 'Fill from a spreadsheet: drop an Excel or CSV file'" hint="or click to choose" @change="fromSheet" /></div>
      <p v-if="aiNote" class="note">{{ aiNote }}</p>
      <div class="g4">
        <label class="label">For<select v-model="form.subject" required><option value="" disabled>Choose</option>
          <optgroup label="Funds and entities"><option v-for="e in subj?.entities ?? []" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
          <optgroup label="Companies"><option v-for="c in subj?.companies ?? []" :key="c.id" :value="'company:' + c.id">{{ c.name }}</option></optgroup></select></label>
        <label class="label">Period<select v-model="form.period_type"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
        <label class="label">Period end<input v-model="form.period_end" type="date" required></label>
        <label class="label">Currency<input v-model="form.currency" maxlength="3" required style="text-transform: uppercase"></label>
      </div>
      <div v-for="[sec, title] in [['pl', 'Profit and loss'], ['bs', 'Balance sheet'], ['cf', 'Cash flow']]" :key="sec" class="sec"><h3>{{ title }}</h3>
        <div class="g4"><label v-for="l in (subj?.lines ?? []).filter((x) => x.section === sec)" :key="l.key" class="label">{{ l.label }}<input v-model="form.lines[l.key]" inputmode="decimal" placeholder="—"></label></div></div>
      <div class="sec"><h3>Other KPIs</h3>
        <div v-for="(k, i) in form.kpis" :key="i" class="kr"><input v-model="k.name" placeholder="e.g. Customers, AUM, Headcount" maxlength="60"><input v-model="k.value" inputmode="decimal" placeholder="Value"><button type="button" class="link" @click="form.kpis.splice(i, 1)">Remove</button></div>
        <button type="button" class="link" @click="form.kpis.push({ name: '', value: '' })">+ Add a KPI</button></div>
      <label class="label">Notes<textarea v-model="form.notes" rows="2" maxlength="1000" /></label>
      <label v-if="isFund" class="chk"><input v-model="form.show_to_lps" type="checkbox"> Show these fund financials to LPs in their portal</label>
      <p class="muted small">Enter costs as positive numbers; keep the sign on net income, EBITDA and cash flows. Totals left blank are worked out for you. A balance sheet with all three totals must balance.</p>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div class="row"><button class="btn" type="submit" :disabled="busy">Save</button><button class="btn secondary" type="button" @click="showForm = false">Cancel</button></div>
    </form>

    <div v-if="sh.open" class="card frm">
      <h2>Share these financials</h2>
      <p class="muted small">A private link showing only the metrics you pick for {{ data?.name }}. It expires, and you get an email when it is viewed.</p>
      <div class="g4"><label class="label wide2">Title<input v-model="sh.title" :placeholder="data?.name" maxlength="200"></label><label class="label">Expires after (days)<input v-model="sh.days" inputmode="numeric"></label></div>
      <div class="mets"><label v-for="m in metricOptions" :key="m.key" class="chk"><input v-model="sh.metrics" type="checkbox" :value="m.key" :disabled="!sh.metrics.includes(m.key) && sh.metrics.length >= 8"> {{ m.label }}</label></div>
      <div class="row"><button class="btn" type="button" :disabled="!sh.metrics.length" @click="share">Create link</button><span v-if="sh.url" class="small">Link: <a :href="sh.url" target="_blank" rel="noopener">{{ sh.url }}</a></span></div>
    </div>

    <template v-if="rows.length && latest">
      <div class="kpis">
        <div class="kpi"><span class="l">Revenue · {{ lbl(latest.period_end) }}</span><b><Money :value="latest.derived.revenue" :currency="cur" /></b><span class="s" :class="{ up: (change('revenue') ?? 0) > 0, dn: (change('revenue') ?? 0) < 0 }">{{ change('revenue') == null ? '—' : (change('revenue')! > 0 ? '+' : '') + change('revenue') + '% vs previous' }}</span></div>
        <div class="kpi"><span class="l">Net income</span><b><Money :value="latest.derived.net_income" :currency="cur" /></b><span class="s">EBITDA <Money :value="latest.derived.ebitda" :currency="cur" /></span></div>
        <div class="kpi"><span class="l">Cash</span><b><Money :value="latest.derived.cash" :currency="cur" /></b><span class="s">{{ latest.derived.runway ? latest.derived.runway + ' months runway' : latest.derived.burn === 0 ? 'Cash-flow positive' : '—' }}</span></div>
        <div class="kpi"><span class="l">Gross margin</span><b>{{ pctFmt(latest.derived.gross_margin) }}</b><span class="s">Burn <Money :value="latest.derived.burn" :currency="cur" /> / month</span></div>
      </div>
      <div class="charts">
        <TrendChart title="Revenue" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('revenue')" :foot="rows.length + ' periods'" />
        <TrendChart title="Net income" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('net_income')" foot="After all costs" />
        <TrendChart title="Cash" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('cash')" foot="Period end" />
      </div>
      <div class="two">
        <div class="card"><DonutChart :title="'Cost mix · ' + lbl(latest.period_end)" total-label="Total costs" :currency="cur" :segments="mix" /></div>
        <div class="card"><h3>Statements</h3>
          <div class="scroll"><table class="table"><thead><tr><th>Period</th><th class="n">Revenue</th><th class="n">Gross margin</th><th class="n">EBITDA</th><th class="n">Net income</th><th class="n">Cash</th><th /></tr></thead>
            <tbody><tr v-for="r in [...rows].reverse()" :key="r.period_end"><td>{{ lbl(r.period_end) }}<span class="sub">{{ r.source === 'upload' ? 'From spreadsheet' : r.source === 'group' ? 'Consolidated' : 'Entered' }}{{ r.show_to_lps ? ' · shown to LPs' : '' }}</span></td>
              <td class="n"><Money :value="r.derived.revenue" :currency="r.currency" /></td><td class="n">{{ pctFmt(r.derived.gross_margin) }}</td><td class="n"><Money :value="r.derived.ebitda" :currency="r.currency" /></td>
              <td class="n"><Money :value="r.derived.net_income" :currency="r.currency" /></td><td class="n"><Money :value="r.derived.cash" :currency="r.currency" /></td>
              <td class="n"><template v-if="r.id && canEdit"><button class="link" type="button" @click="openForm(r)">Edit</button> <DeleteButton type="statement" :id="r.id" :name="lbl(r.period_end) + ' statement'" link @deleted="refresh()" /></template></td></tr></tbody></table></div></div>
      </div>
    </template>
    <div v-else-if="!showForm" class="card empty"><b>No figures yet{{ subject === 'group' ? '' : ' for ' + data?.name }}.</b>
      <p>Add a profit and loss, balance sheet or KPI sheet for any fund, entity or company, monthly, quarterly or yearly. Upload the spreadsheet you already keep and we map it for you to check, or type the figures in. The group view adds everything up.</p></div>

    <div v-if="shares?.length" class="card shares"><h3>Share links</h3>
      <table class="table"><tbody><tr v-for="s in shares" :key="s.id"><td><b>{{ s.title }}</b><span class="sub">{{ s.metrics.length }} metric{{ s.metrics.length === 1 ? '' : 's' }} · {{ s.expired ? 'expired' : 'expires ' + s.expires }}</span></td>
        <td>{{ s.views }} view{{ s.views === 1 ? '' : 's' }}<span class="sub">{{ s.last_viewed_at ? 'last ' + new Date(s.last_viewed_at).toLocaleString('en-GB') : 'not opened yet' }}</span></td>
        <td class="n"><DeleteButton v-if="canEdit" type="fin_share" :id="s.id" :name="s.title" link @deleted="rshares()" /></td></tr></tbody></table></div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; } .tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0 0 10px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.frm { display: flex; flex-direction: column; gap: 12px; margin: 12px 0 16px; } .fh { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .fh h2 { margin: 0; }
.up { position: relative; overflow: hidden; } .up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } .note { background: var(--c-signal-soft); padding: 10px 12px; font-size: 13.5px; margin: 0; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 12px; } .g4 label { display: flex; flex-direction: column; gap: 5px; } .wide2 { grid-column: span 3; }
.sec h3 { font-size: 16px; margin: 6px 0 8px; } .kr { display: flex; gap: 8px; margin-bottom: 6px; } .kr input:first-child { flex: 2; } .kr input { flex: 1; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .mets { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0; } .kpi { background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.kpi .l { font-size: 13px; color: var(--c-muted); } .kpi b { font-size: 28px; font-weight: 600; } .kpi .s { font-size: 12.5px; color: var(--c-muted); } .s.up { color: var(--c-ok); } .s.dn { color: var(--c-danger); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .two { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; } .two h3 { margin: 0 0 10px; }
.scroll { overflow-x: auto; } .table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); }
td { padding: 9px 10px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.empty p { color: var(--c-ink-soft); max-width: 720px; margin: 6px 0 0; } .shares { margin-top: 14px; } .shares h3 { margin: 0 0 8px; }
@media (max-width: 1000px) { .kpis, .g4 { grid-template-columns: 1fr 1fr; } .charts, .two { grid-template-columns: 1fr; } .wide2 { grid-column: span 2; } }
</style>
