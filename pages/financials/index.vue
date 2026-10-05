<script setup lang="ts">
// Financials. Finvry companies: always their own company. Aidi OS: the group (consolidated) or any fund, entity or company.
useHead({ title: 'Financials' })
interface Line { key: string; label: string; section: string }
interface Subjects { company: { subject: string; name: string; currency: string; reporting: string | null; rate_as_of: string | null } | null; entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string; relationship: string }[]; currencies: string[]; lines: Line[]; derived: { key: string; label: string }[] }
interface St { id: string | null; period_end: string; period_type: string; currency: string; lines: Record<string, number>; kpis: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; derived: Record<string, number | null> }
const { data: subj } = await useFetch<Subjects>('/api/financials/subjects')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const co = computed(() => subj.value?.company ?? null)
const subject = ref(co.value?.subject ?? 'group'); const periodType = ref('month'); const currency = ref(co.value?.currency ?? 'USD')
watch(co, (c) => { if (c) { subject.value = c.subject; currency.value = c.currency } })
watchEffect(() => { if (!co.value && subject.value === 'group' && subj.value?.currencies.length && !subj.value.currencies.includes(currency.value)) currency.value = subj.value.currencies[0]! })
const original = ref(false)
const rawQ = computed(() => (original.value ? '1' : undefined))
const { data, refresh } = await useFetch<{ name: string; statements: St[] }>('/api/financials', { query: { subject, period_type: periodType, currency, raw: rawQ }, watch: [subject, periodType, currency, original] })
const converting = computed(() => !!co.value?.reporting && !original.value && rows.value.some((r) => r.currency === co.value?.reporting))
const rows = computed(() => data.value?.statements ?? [])
const latest = computed(() => rows.value[rows.value.length - 1]); const prev = computed(() => rows.value[rows.value.length - 2])
const cur = computed(() => latest.value?.currency ?? currency.value)
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const CURS = computed(() => [...new Set(['USD', 'NGN', ...(co.value ? [] : subj.value?.currencies ?? [])])])
const curName = (c: string) => ({ USD: 'US dollar (USD)', NGN: 'Naira (NGN)', GBP: 'Pound (GBP)', EUR: 'Euro (EUR)' } as Record<string, string>)[c] ?? c
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', periodType.value === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pts = (k: string) => rows.value.filter((r) => r.derived[k] != null).map((r) => ({ label: lbl(r.period_end), value: r.derived[k] as number }))
const change = (k: string) => { const a = latest.value?.derived[k], b = prev.value?.derived[k]; return a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100) }
const mix = computed(() => { const d = latest.value?.derived ?? {}; return [['cogs', 'Cost of revenue'], ['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_rnd', 'R&D'], ['opex_ga', 'G&A'], ['opex_other', 'Other']].map(([k, l]) => ({ label: l!, value: Number(d[k!] ?? 0) })) })
const pctFmt = (v: number | null | undefined) => (v == null ? '—' : v + '%')
const tab = ref<'overview' | 'statements' | 'shares'>('overview')
const title = computed(() => co.value?.name ?? data.value?.name ?? 'Financials')

// add / edit (popup)
const showForm = ref(false); const msg = ref(''); const ok = ref(''); const busy = ref(false); const aiNote = ref('')
const now = new Date(); const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
const blank = () => ({ subject: co.value?.subject ?? (subject.value === 'group' ? '' : subject.value), period_type: periodType.value, month: lastMonth.toISOString().slice(0, 7), q: Math.floor(lastMonth.getUTCMonth() / 3) + 1, year: lastMonth.getUTCFullYear(),
  currency: co.value?.currency ?? currency.value, lines: {} as Record<string, string>, kpis: [] as { name: string; value: string }[], notes: '', show_to_lps: false, document_id: '' })
const form = reactive(blank())
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
const periodEnd = computed(() => form.period_type === 'month' ? (form.month ? lastDay(Number(form.month.slice(0, 4)), Number(form.month.slice(5, 7))) : '') : form.period_type === 'quarter' ? lastDay(form.year, form.q * 3) : form.year + '-12-31')
function setFromEnd(end: string, type: string) { const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7)); form.period_type = type; form.month = end.slice(0, 7); form.year = y; form.q = Math.ceil(m / 3) }
const years = Array.from({ length: 12 }, (_, i) => now.getUTCFullYear() - i)
const isFund = computed(() => { const m = form.subject.match(/^entity:(.+)$/); return !co.value && !!m && ['fund', 'spv'].includes(subj.value?.entities.find((e) => e.id === m[1])?.kind ?? '') })
function openForm(s?: St) {
  Object.assign(form, blank()); aiNote.value = ''; msg.value = ''; showForm.value = true
  if (s) { setFromEnd(s.period_end, s.period_type); Object.assign(form, { currency: s.currency, notes: s.notes ?? '', show_to_lps: s.show_to_lps, lines: Object.fromEntries(Object.entries(s.lines).map(([k, v]) => [k, String(v)])), kpis: Object.entries(s.kpis).map(([name, v]) => ({ name, value: String(v) })) }) }
}
const num = (s: string) => (s === undefined || String(s).trim() === '' ? null : Number(String(s).replace(/[^0-9.\-]/g, '')))
async function fromSheet(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  busy.value = true; msg.value = ''
  const fd = new FormData(); fd.append('file', f); fd.append('wanted', periodEnd.value || 'latest period')
  try {
    const r = await $fetch<{ period_end: string | null; period_type: string; currency: string; lines: Record<string, number | null>; kpis: Record<string, number>; notes: string; document_id: string }>('/api/financials/extract', { method: 'POST', body: fd })
    if (r.period_end) setFromEnd(r.period_end, r.period_type)
    const c = (r.currency || form.currency).toUpperCase()
    Object.assign(form, { currency: CURS.value.includes(c) ? c : form.currency, document_id: r.document_id, lines: Object.fromEntries(Object.entries(r.lines).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])), kpis: Object.entries(r.kpis).map(([name, v]) => ({ name, value: String(v) })) })
    aiNote.value = r.notes + ' Check every figure before saving.'
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read the file.' } finally { busy.value = false }
}
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ replaced: boolean }>('/api/financials/statements', { method: 'POST', body: { subject: form.subject, period_type: form.period_type, period_end: periodEnd.value, currency: form.currency,
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
  try { const r = await $fetch<{ url: string }>('/api/financials/shares', { method: 'POST', body: { title: sh.title || title.value, subject: subject.value, period_type: periodType.value, currency: cur.value, metrics: sh.metrics, days: sh.days } }); sh.url = r.url; await rshares() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the link.' }
}
const SECS = [['pl', 'Profit and loss', 'Revenue, costs and profit for the period'], ['bs', 'Balance sheet', 'What the company owns and owes at period end'], ['cf', 'Cash flow', 'Cash in and out during the period']] as const
</script>

<template>
  <section>
    <p class="label">{{ co ? 'Investors' : 'Records' }}</p>
    <div class="head">
      <div class="tl"><h1>Financials</h1>
        <select v-if="!co" v-model="subject" class="subj" aria-label="Show figures for"><option value="group">Group (consolidated)</option>
          <optgroup v-if="subj?.entities.length" label="Funds and entities"><option v-for="e in subj.entities" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
          <optgroup v-if="subj?.companies.length" label="Portfolio and group companies"><option v-for="c in subj.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}{{ c.relationship === 'subsidiary' ? ' (subsidiary)' : '' }}</option></optgroup></select>
        <span v-else class="co">{{ co.name }}</span></div>
      <div class="tools">
        <div class="seg" role="group" aria-label="Period"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="k" :class="{ on: periodType === k }" @click="periodType = k">{{ l }}</button></div>
        <select v-if="!co && subject === 'group'" v-model="currency" aria-label="Currency"><option v-for="c in CURS" :key="c" :value="c">{{ c }}</option></select>
        <div v-if="co?.reporting" class="seg" role="group" aria-label="Show in"><button :class="{ on: !original }" @click="original = false">{{ co.reporting }}</button><button :class="{ on: original }" @click="original = true">Original</button></div>
        <button v-if="canEdit" class="btn" type="button" @click="openForm()">Add figures</button>
      </div>
    </div>
    <p v-if="!co && subject === 'group'" class="hint">Adds up every fund and entity, plus companies marked as subsidiaries, in {{ currency }}. Intercompany amounts are not eliminated.</p>
    <p v-if="converting" class="hint">Shown in {{ co?.reporting }} for reporting, converted at the latest daily exchange rate{{ co?.rate_as_of ? ' (' + new Date(co.rate_as_of).toLocaleDateString('en-GB') + ')' : '' }}. Your figures are stored in their original currency; switch to Original to edit. Billing is not affected.</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg && !showForm" class="error">{{ msg }}</p>

    <ClientOnly><BankFeeds v-if="canEdit" compact class="feeds" /></ClientOnly>
    <template v-if="rows.length && latest">
      <nav class="tabs"><button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button><button :class="{ on: tab === 'statements' }" @click="tab = 'statements'">Statements <em>{{ rows.length }}</em></button><button :class="{ on: tab === 'shares' }" @click="tab = 'shares'">Share links <em>{{ shares?.length ?? 0 }}</em></button></nav>
      <template v-if="tab === 'overview'">
        <div class="kpis">
          <div class="kpi"><span class="l">Revenue · {{ lbl(latest.period_end) }}</span><b><Money :value="latest.derived.revenue" :currency="cur" /></b><span class="s" :class="{ up: (change('revenue') ?? 0) > 0, dn: (change('revenue') ?? 0) < 0 }">{{ change('revenue') == null ? 'First period' : (change('revenue')! > 0 ? '▲ ' : '▼ ') + Math.abs(change('revenue')!) + '% vs previous' }}</span></div>
          <div class="kpi"><span class="l">Net income</span><b><Money :value="latest.derived.net_income" :currency="cur" /></b><span class="s">EBITDA <Money :value="latest.derived.ebitda" :currency="cur" /></span></div>
          <div class="kpi"><span class="l">Cash</span><b><Money :value="latest.derived.cash" :currency="cur" /></b><span class="s">{{ latest.derived.runway ? latest.derived.runway + ' months runway' : latest.derived.burn === 0 ? 'Cash-flow positive' : '—' }}</span></div>
          <div class="kpi"><span class="l">Gross margin</span><b>{{ pctFmt(latest.derived.gross_margin) }}</b><span class="s">Burn <Money :value="latest.derived.burn" :currency="cur" /> / month</span></div>
        </div>
        <div class="charts">
          <TrendChart title="Revenue" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('revenue')" :foot="rows.length + ' periods'" />
          <TrendChart title="Net income" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('net_income')" foot="After all costs" />
          <TrendChart title="Cash" unit="usd" :symbol="SYM[cur] ?? cur + ' '" :points="pts('cash')" foot="Period end" />
        </div>
        <div class="two"><div class="card"><DonutChart :title="'Cost mix · ' + lbl(latest.period_end)" total-label="Total costs" :currency="cur" :segments="mix" /></div>
          <div class="card"><h3>Latest periods</h3><div v-for="r in [...rows].reverse().slice(0, 5)" :key="r.period_end" class="lp"><span>{{ lbl(r.period_end) }}</span><span><Money :value="r.derived.revenue" :currency="r.currency" /></span><span :class="{ neg: (r.derived.net_income ?? 0) < 0 }"><Money :value="r.derived.net_income" :currency="r.currency" /></span></div>
            <button class="link" @click="tab = 'statements'">All statements →</button></div></div>
      </template>
      <div v-else-if="tab === 'statements'" class="card flat"><div class="scroll"><table class="table"><thead><tr><th>Period</th><th class="n">Revenue</th><th class="n">Gross margin</th><th class="n">EBITDA</th><th class="n">Net income</th><th class="n">Cash</th><th /></tr></thead>
        <tbody><tr v-for="r in [...rows].reverse()" :key="r.period_end"><td><b>{{ lbl(r.period_end) }}</b><span class="sub">{{ r.source === 'upload' ? 'From spreadsheet' : r.source === 'group' ? 'Consolidated' : 'Entered' }}{{ r.show_to_lps ? ' · shown to LPs' : '' }}</span></td>
          <td class="n"><Money :value="r.derived.revenue" :currency="r.currency" /></td><td class="n">{{ pctFmt(r.derived.gross_margin) }}</td><td class="n"><Money :value="r.derived.ebitda" :currency="r.currency" /></td>
          <td class="n"><Money :value="r.derived.net_income" :currency="r.currency" /></td><td class="n"><Money :value="r.derived.cash" :currency="r.currency" /></td>
          <td class="n"><template v-if="r.id && canEdit && !converting"><button class="link" type="button" @click="openForm(r)">Edit</button> · <DeleteButton type="statement" :id="r.id" :name="lbl(r.period_end) + ' statement'" link @deleted="refresh()" /></template></td></tr></tbody></table></div></div>
      <template v-else>
        <div class="card frm"><div class="sh"><div><h3>Share your financials</h3><p class="hint">A private link showing only the metrics you pick. It expires, and you get an email when it is viewed.</p></div></div>
          <div class="g3"><label class="label">Title<input v-model="sh.title" :placeholder="title" maxlength="200"></label><label class="label">Expires after<select v-model.number="sh.days"><option :value="7">7 days</option><option :value="30">30 days</option><option :value="90">90 days</option><option :value="365">1 year</option></select></label></div>
          <div class="mets"><label v-for="m in metricOptions" :key="m.key" class="chk"><input v-model="sh.metrics" type="checkbox" :value="m.key" :disabled="!sh.metrics.includes(m.key) && sh.metrics.length >= 8"> {{ m.label }}</label></div>
          <div class="row"><button class="btn" type="button" :disabled="!sh.metrics.length || !canEdit" @click="share">Create link</button><span v-if="sh.url" class="small">Link: <a :href="sh.url" target="_blank" rel="noopener">{{ sh.url }}</a></span></div></div>
        <div v-if="shares?.length" class="card flat"><table class="table"><tbody><tr v-for="s in shares" :key="s.id"><td><b>{{ s.title }}</b><span class="sub">{{ s.metrics.length }} metric{{ s.metrics.length === 1 ? '' : 's' }} · {{ s.expired ? 'expired' : 'expires ' + s.expires }}</span></td>
          <td>{{ s.views }} view{{ s.views === 1 ? '' : 's' }}<span class="sub">{{ s.last_viewed_at ? 'last ' + new Date(s.last_viewed_at).toLocaleString('en-GB') : 'not opened yet' }}</span></td>
          <td class="n"><DeleteButton v-if="canEdit" type="fin_share" :id="s.id" :name="s.title" link @deleted="rshares()" /></td></tr></tbody></table></div>
        <EmptyState v-else card icon="link" title="No share links yet" text="Create one above and send it to an investor or partner." />
      </template>
    </template>
    <EmptyState v-else card icon="financials" :title="co ? 'Add your first month' : 'No figures yet' + (subject === 'group' ? '' : ' for ' + (data?.name ?? ''))"
      :text="co ? 'Drop in the profit and loss or management accounts you already keep and we read it for you to check, or type the figures in. Your dashboard, investor page and updates fill in from here.' : 'Add a profit and loss, balance sheet or KPI sheet for any fund, entity or company, monthly, quarterly or yearly. Upload a spreadsheet or type the figures in.'">
      <button v-if="canEdit" class="btn" @click="openForm()">Add figures</button></EmptyState>

    <AppModal :open="showForm" :title="rows.some((r) => r.period_end === periodEnd && r.period_type === form.period_type) ? 'Edit figures' : 'Add figures'" wide @close="showForm = false">
      <form id="finf" class="frm" @submit.prevent="save">
        <DropZone accept=".xlsx,.csv" :disabled="busy" :label="busy ? 'Reading your spreadsheet…' : 'Fill from a spreadsheet'" hint="Drop an Excel or CSV file and we map the figures for you to check · or click to choose" @change="fromSheet" />
        <p v-if="aiNote" class="note">{{ aiNote }}</p>
        <div class="g4">
          <label v-if="!co" class="label">For<select v-model="form.subject" required><option value="" disabled>Choose</option>
            <optgroup label="Funds and entities"><option v-for="e in subj?.entities ?? []" :key="e.id" :value="'entity:' + e.id">{{ e.name }}</option></optgroup>
            <optgroup v-if="subj?.companies.length" label="Portfolio and group companies"><option v-for="c in subj.companies" :key="c.id" :value="'company:' + c.id">{{ c.name }}</option></optgroup></select></label>
          <label class="label">Period<select v-model="form.period_type"><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
          <label v-if="form.period_type === 'month'" class="label">Month<input v-model="form.month" type="month" required></label>
          <template v-else-if="form.period_type === 'quarter'"><label class="label">Quarter<select v-model.number="form.q"><option v-for="n in 4" :key="n" :value="n">Q{{ n }}</option></select></label><label class="label">Year<select v-model.number="form.year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label></template>
          <label v-else class="label">Year<select v-model.number="form.year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label>
          <label class="label">Currency<select v-model="form.currency" required><option v-for="c in CURS" :key="c" :value="c">{{ curName(c) }}</option></select></label>
        </div>
        <details v-for="[sec, t, d] in SECS" :key="sec" class="sec" :open="sec === 'pl'"><summary><b>{{ t }}</b><span>{{ d }}</span></summary>
          <div class="g4"><label v-for="l in (subj?.lines ?? []).filter((x) => x.section === sec)" :key="l.key" class="label">{{ l.label }}<span class="money"><i>{{ SYM[form.currency] ?? '' }}</i><input v-model="form.lines[l.key]" inputmode="decimal" placeholder="—"></span></label></div></details>
        <details class="sec"><summary><b>Other KPIs</b><span>Customers, headcount, AUM or anything else you track</span></summary>
          <div v-for="(k, i) in form.kpis" :key="i" class="kr"><input v-model="k.name" placeholder="e.g. Customers" maxlength="60"><input v-model="k.value" inputmode="decimal" placeholder="Value"><button type="button" class="link" @click="form.kpis.splice(i, 1)">Remove</button></div>
          <button type="button" class="link" @click="form.kpis.push({ name: '', value: '' })">+ Add a KPI</button></details>
        <label class="label">Notes (optional)<textarea v-model="form.notes" rows="2" maxlength="1000" /></label>
        <label v-if="isFund" class="chk"><input v-model="form.show_to_lps" type="checkbox"> Show these fund financials to LPs in their portal</label>
        <p class="hint">Enter costs as positive numbers; keep the sign on net income, EBITDA and cash flows. Totals left blank are worked out for you. A balance sheet with all three totals must balance.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="showForm = false">Cancel</button><button class="btn" type="submit" form="finf" :disabled="busy">Save figures</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; } .tl { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; } .tl h1 { margin: 0; }
.subj { font-family: var(--font-heading); font-size: 18px; border: 0; border-bottom: 1px dashed var(--c-rule-strong); background: transparent; color: var(--c-blue-deep); padding: 2px 4px; cursor: pointer; } .co { font-family: var(--font-heading); font-size: 20px; color: var(--c-muted); }
.tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .seg { display: flex; border: 1px solid var(--c-rule-strong); background: #fff; } .seg button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.hint { color: var(--c-muted); font-size: 12.5px; margin: 4px 0 8px; } .small { font-size: 12.5px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 12px 0 16px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; background: var(--c-paper-2); padding: 1px 7px; margin-left: 4px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 0 0 12px; } .kpi { background: #fff; border: 1px solid var(--c-rule); padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; }
.kpi .l { font-size: 13px; color: var(--c-muted); } .kpi b { font-size: 28px; font-weight: 600; } .kpi .s { font-size: 12.5px; color: var(--c-muted); } .s.up { color: var(--c-ok); } .s.dn { color: var(--c-danger); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .two h3 { margin: 0 0 10px; }
.lp { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .lp span:not(:first-child) { text-align: right; } .lp .neg { color: var(--c-danger); } .two .link { margin-top: 10px; }
.flat { padding: 0; overflow: hidden; margin-bottom: 12px; } .scroll { overflow-x: auto; } .table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; }
td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.frm { display: flex; flex-direction: column; gap: 12px; } .card.frm { margin-bottom: 12px; } .sh h3 { margin: 0; } .note { background: var(--c-signal-soft); padding: 10px 12px; font-size: 13.5px; margin: 0; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 12px; } .g3 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.sec { border: 1px solid var(--c-rule); background: #fff; } .sec summary { list-style: none; cursor: pointer; padding: 12px 14px; display: flex; gap: 12px; align-items: baseline; } .sec summary::-webkit-details-marker { display: none; } .sec summary::after { content: '+'; margin-left: auto; color: var(--c-muted); font-size: 18px; } .sec[open] summary::after { content: '−'; }
.sec summary span { font-size: 12.5px; color: var(--c-muted); } .sec .g4, .sec .kr, .sec > .link { margin: 0 14px 12px; } .sec > .link { display: inline-block; margin-bottom: 14px; }
.money { display: flex; align-items: center; border: 1px solid var(--c-rule-strong); background: #fff; } .money i { font-style: normal; color: var(--c-muted); font-size: 13px; padding: 0 0 0 9px; } .money input { border: 0; flex: 1; min-width: 0; width: 100%; } .g4 > label, .g4 > * { min-width: 0; } .g4 input, .g4 select { width: 100%; box-sizing: border-box; }
.kr { display: flex; gap: 8px; } .kr input:first-child { flex: 2; } .kr input { flex: 1; } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .mets { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
@media (max-width: 1000px) { .kpis, .g4 { grid-template-columns: 1fr 1fr; } .charts, .two, .g3 { grid-template-columns: 1fr; } }
.feeds { margin: 12px 0; }
</style>
