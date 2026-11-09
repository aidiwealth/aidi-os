<script setup lang="ts">
import { reportHeadline, reportRest, reportSteps } from '~/shared/wm-report'
import { lendersFor } from '~/shared/wm-lenders'
// Financial profile (income, tax, spending, debts, credit scores, goals), documents (drag and drop), the AI review and
// its share link. Used by staff (client page) and by the client (portal).
const props = defineProps<{ api: string; preview?: boolean }>()
const { data, refresh } = await useFetch<Record<string, any>>(() => props.api, { key: 'plan-' + props.api })
const blankP = () => ({ household: { adults: 2, children: 0, location: '' }, incomes: [] as any[], taxes: [] as any[], expenses: [] as any[], debts: [] as any[], credit_scores: [] as any[], goals: [] as any[], notes: '' })
const p = reactive<Record<string, any>>(blankP())
watchEffect(() => { if (data.value) Object.assign(p, blankP(), JSON.parse(JSON.stringify(data.value.profile ?? {}))) })
const sec = ref<'profile' | 'report'>('profile')
const touched = ref(false)
watchEffect(() => { if (data.value?.report && sec.value === 'profile' && !touched.value) sec.value = 'report' })
const cur = ref('USD'); const msg = ref(''); const ok = ref(''); const busy = ref(''); const link = ref(''); const kind = ref('bank_statement')
const add = (k: string, row: Record<string, unknown>) => { touched.value = true; p[k].push(row) }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
const num = (o: any, k: string) => { o[k] = o[k] === '' || o[k] == null ? 0 : Number(o[k]) }
// A cleaned copy for saving (the form itself is left as typed): amounts as numbers, empty optional figures dropped,
// half-filled credit scores left out until they have a score.
function cleaned() { const c = JSON.parse(JSON.stringify(p)); for (const k of ['incomes', 'taxes', 'expenses']) for (const r of c[k]) num(r, 'amount'); for (const r of c.debts) { num(r, 'balance'); if (r.rate !== '' && r.rate != null) r.rate = Number(r.rate); else delete r.rate; if (r.payment !== '' && r.payment != null) r.payment = Number(r.payment); else delete r.payment } c.credit_scores = c.credit_scores.filter((r: any) => Number(r.score) >= 300).map((r: any) => ({ ...r, score: Number(r.score) })); for (const r of c.goals) { if (r.target === '' || r.target == null) delete r.target; else r.target = Number(r.target) } c.household.adults = Number(c.household.adults || 0); c.household.children = Number(c.household.children || 0); return c }
// Saved as you go: a second after the last change (not in preview, and not when the form is only being filled from the server).
const saveState = ref<'' | 'saving' | 'saved' | 'error'>('')
let loading = true, timer: ReturnType<typeof setTimeout> | null = null
watch(data, () => { loading = true; nextTick(() => { loading = false }) }, { immediate: true })
watch(p, () => { if (loading || props.preview) return; saveState.value = 'saving'; if (timer) clearTimeout(timer); timer = setTimeout(() => { void save(true) }, 900) }, { deep: true })
onBeforeUnmount(() => { if (timer) { clearTimeout(timer); void save(true) } })
async function save(quiet = false) { if (props.preview) { msg.value = 'Preview only.'; return } if (timer) { clearTimeout(timer); timer = null } if (!quiet) { busy.value = 'save'; msg.value = ''; ok.value = '' } saveState.value = 'saving'; try { await $fetch(props.api, { method: 'POST', body: { action: 'save', profile: cleaned() } }); saveState.value = 'saved' } catch (e) { saveState.value = 'error'; msg.value = err(e) } finally { if (!quiet) busy.value = '' } }
async function upload(ev: Event) { if (props.preview) return; const files = Array.from(((ev.target as HTMLInputElement).files ?? []) as File[]); if (!files.length) return; busy.value = 'up'; msg.value = ''; const fd = new FormData(); fd.append('kind', kind.value); for (const f of files) fd.append('file', f); try { const r = await $fetch<{ uploaded: number }>(props.api, { method: 'POST', body: fd }); ok.value = r.uploaded + ' file' + (r.uploaded === 1 ? '' : 's') + ' added.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function act(action: string, extra: Record<string, unknown> = {}) { if (props.preview) { msg.value = 'Preview only.'; return null } busy.value = action; msg.value = ''; ok.value = ''; try { const r = await $fetch<Record<string, any>>(props.api, { method: 'POST', body: { action, ...extra } }); await refresh(); return r } catch (e) { msg.value = err(e); return null } finally { busy.value = '' } }
async function generate() { await save(); if (msg.value) return; const r = await act('generate'); if (r) { sec.value = 'report'; ok.value = 'Your financial review is ready.' } }
// The review: the PDF, sharing, and (staff) the wording and steps the client sees.
const pdfUrl = computed(() => props.api.replace(/\/plan$/, '/plan-pdf'))
const shareOpen = ref(false)
const ed = reactive({ headline: '', summary: '' })
watchEffect(() => { const c = data.value?.report?.content; if (c) { ed.headline = reportHeadline(c); ed.summary = reportRest(c) } })
const staffSteps = computed(() => (data.value?.report ? reportSteps(data.value.report.content, true) : []))
const editing = ref(''), es = reactive({ title: '', detail: '', timeframe: '' })
function startEdit(st: { title: string; detail: string; timeframe: string }) { editing.value = st.title; Object.assign(es, { title: st.title, detail: st.detail, timeframe: st.timeframe }) }
async function saveStep(title: string) { const r = await act('report_edit', { step: { title, new_title: es.title, detail: es.detail, timeframe: es.timeframe } }); if (r) { editing.value = ''; await refresh(); ok.value = 'Step saved.' } }
async function saveWords() { const r = await act('report_edit', { headline: ed.headline, summary: ed.summary }); if (r) { await refresh(); ok.value = 'Wording saved. The client sees it now.' } }
async function share() { const r = await act('share'); if (r?.url) { link.value = r.url; try { await navigator.clipboard.writeText(r.url) } catch { /* ignore */ } await refresh() } }
// Monthly figures in the main currency (other currencies are left out of the charts), the eight steps and their state.
const monthly = (rows: any[]) => rows.filter((r) => (r.currency ?? cur.value) === cur.value).reduce((a, r) => a + (Number(r.amount) || 0) / (r.frequency === 'annual' ? 12 : 1), 0)
const flow = computed(() => { const inc = monthly(p.incomes), tax = monthly(p.taxes), spend = monthly(p.expenses); return { inc, tax, spend, saved: Math.max(0, inc - tax - spend), rate: inc > 0 ? Math.max(0, (inc - tax - spend) / inc) : null } })
const debt = computed(() => { const d = p.debts.filter((r: any) => (r.currency ?? cur.value) === cur.value); return { total: d.reduce((a: number, r: any) => a + (Number(r.balance) || 0), 0), pay: d.reduce((a: number, r: any) => a + (Number(r.payment) || 0), 0), rows: d.filter((r: any) => Number(r.balance) > 0).sort((a: any, b: any) => Number(b.balance) - Number(a.balance)).slice(0, 4) } })
// Tax that looks like one paycheque: under 6% of income on a salary over 60,000 a year.
const taxLow = computed(() => flow.value.inc * 12 > 60000 && flow.value.tax > 0 && flow.value.tax < flow.value.inc * 0.06)
const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(Math.round(v))
const bar = (v: number) => (flow.value.inc > 0 ? Math.min(100, (v / flow.value.inc) * 100) : 0) + '%'
const STEPS = computed(() => [['household', 'Household', !!p.household.location], ['income', 'Income', p.incomes.length > 0], ['tax', 'Tax', p.taxes.length > 0], ['spending', 'Spending', p.expenses.length > 0],
  ['debts', 'Debts', p.debts.length > 0], ['debts', 'Credit scores', p.credit_scores.length > 0], ['debts', 'Goals', p.goals.length > 0], ['docs', 'Documents', (data.value?.docs ?? []).length > 0]] as [string, string, boolean][])
const doneN = computed(() => STEPS.value.filter((x) => x[2]).length)
const nextStep = computed(() => STEPS.value.findIndex((x) => !x[2]))
function goTo(id: string) { if (import.meta.client) document.getElementById('fp-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function addTo(k: string, row: Record<string, unknown>, sec: string) { add(k, row); nextTick(() => goTo(sec)) }
const KIND: Record<string, string> = { stock_plan: 'Stock plan / RSU / ESPP statement', investment_statement: 'Brokerage, 401(k), pension or IRA statement', agreement: 'Agreement', bank_statement: 'Bank statement', tax_return: 'Tax return', payslip: 'Payslip / salary', credit_report: 'Credit report (FICO, Credit Karma…)', passport: 'Passport', proof_of_address: 'Proof of address (last 3 months)', other: 'Other' }
// Reading the documents with AI: what was found is listed with a tick on each line; ticked lines are added to the plan
// (money in and out, debts, accounts, employer stock, planning points). Nothing is added unseen.
interface Found { incomes: any[]; expenses: any[]; debts: any[]; accounts: any[]; equity: any[]; flags: { title: string; detail: string }[]; documents: { name: string; type: string; period?: string; institution?: string }[] }
const rd = ref<{ found: Found; checks: { title: string; detail: string }[]; read: string[]; skipped: string[] } | null>(null)
const pick = reactive<Record<string, boolean>>({})
const money2 = (v: number | null | undefined, c = 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD', maximumFractionDigits: 0 }).format(Math.round(v)))
async function readDocs() {
  const r = await act('read_docs'); if (!r) return
  rd.value = { found: r.found, checks: r.checks ?? [], read: r.read ?? [], skipped: r.skipped ?? [] }
  for (const k of Object.keys(pick)) delete pick[k]
  for (const g of ['incomes', 'expenses', 'debts', 'accounts', 'equity'] as const) (r.found[g] ?? []).forEach((_: unknown, i: number) => { pick[g + i] = true })
  if (!r.read?.length) msg.value = r.skipped?.length ? 'These files could not be read (photos or scans). Upload the PDF or Excel statement instead.' : 'No documents to read yet.'
}
async function applyRead() {
  if (!rd.value) return
  const f = rd.value.found, take = (g: keyof Found) => (f[g] as any[]).filter((_, i) => pick[g + i])
  const r = await act('apply_read', { take: { incomes: take('incomes'), expenses: take('expenses'), debts: take('debts'), accounts: take('accounts'), equity: take('equity'), flags: [...f.flags, ...rd.value.checks] } })
  if (r) { rd.value = null; await refresh(); ok.value = 'Added ' + r.added + ' item' + (r.added === 1 ? '' : 's') + ' from the documents. Check them below, then update the financial review.' }
}
</script>
<template>
  <div v-if="data" class="fp">
    <nav class="s2"><button :class="{ on: sec === 'profile' }" @click="sec = 'profile'; touched = true">Financial details</button><button :class="{ on: sec === 'report' }" :disabled="!data.report" @click="sec = 'report'">Financial review</button></nav>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div v-if="sec === 'profile'" class="dt">
      <section class="card dh">
        <div class="dhl"><h3>{{ data.staff ? 'Financial details' : 'Your details' }}</h3><span class="mut">What the review is built from. Change anything; it saves as you go.</span></div>
        <div class="dha"><span class="sv">{{ preview ? 'Preview only' : saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved: check the figures' : 'Saved as you go' }}</span>
          <button class="btn" :disabled="!!busy || preview" @click="generate">{{ busy === 'generate' ? 'Preparing… (about a minute)' : data.report ? (data.staff ? 'Update the review' : 'Update my review') : 'Prepare the financial review' }}</button></div>
        <div class="dtl"><div><span>Comes in a month</span><b>{{ fmt(flow.inc) }}</b></div><div><span>Goes out a month</span><b>{{ fmt(flow.tax + flow.spend + debt.pay) }}</b><em>incl. tax and debt payments</em></div><div><span>You keep</span><b>{{ flow.rate == null ? '—' : Math.round(flow.rate * 100) + '%' }}</b></div><div><span>Owe</span><b>{{ debt.total ? fmt(debt.total) : '—' }}</b></div></div>
      </section>
      <nav class="cnav"><a v-for="x in STEPS" :key="x[1]" href="#" :class="{ ok: x[2], warn: x[1] === 'Tax' && taxLow }" @click.prevent="goTo(x[0])">{{ x[1] === 'Tax' && taxLow ? '! ' : x[2] ? '✓ ' : '' }}{{ x[1] }}</a></nav>
      <div class="lay2">
      <div class="main">
        <section id="fp-household" class="card"><div class="h"><h4>Household</h4><span class="mut">{{ p.household.adults }} adult{{ Number(p.household.adults) === 1 ? '' : 's' }}, {{ Number(p.household.children) ? p.household.children + ' child' + (Number(p.household.children) === 1 ? '' : 'ren') : 'no children' }} · {{ cur }}</span></div>
          <div class="hh"><label>Adults<input v-model="p.household.adults" type="number" min="0"></label><label>Children<input v-model="p.household.children" type="number" min="0"></label><label>City and country<input v-model="p.household.location" placeholder="e.g. Houston, US"></label><label>Main currency<select v-model="cur"><option>USD</option><option>NGN</option></select></label></div></section>
        <section id="fp-income" class="card"><div class="h"><h4>Income</h4><span class="mut">{{ flow.inc ? fmt(flow.inc) + ' a month' : 'Salary, business, rent, dividends…' }}</span></div>
          <div v-for="(r, i) in p.incomes" :key="i" class="rr r5"><input v-model="r.source" placeholder="Source" aria-label="Source"><input v-model="r.who" placeholder="Who" aria-label="Who"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.incomes.splice(i, 1)">×</button></div>
          <p v-if="(p.equity ?? []).some((e: any) => (e.vested ?? []).length)" class="nt">Share pay (RSUs, ESPP) is kept with your shares, not counted here, because it comes as shares at uneven times.</p>
          <div class="chips"><button v-for="c in ['Salary', 'Business', 'Rent', 'Dividends', 'Other income']" :key="c" @click="addTo('incomes', { who: '', source: c === 'Other income' ? '' : c, amount: '', frequency: c === 'Dividends' ? 'annual' : 'monthly', currency: cur }, 'income')">+ {{ c }}</button></div></section>
        <section id="fp-tax" class="card"><div class="h"><h4>Tax</h4><span class="mut">{{ flow.tax ? fmt(flow.tax) + ' a month' : 'Not started' }}</span></div>
          <div v-for="(r, i) in p.taxes" :key="i" class="rr r4"><input v-model="r.kind" placeholder="e.g. Federal income tax, PAYE" aria-label="Tax"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.taxes.splice(i, 1)">×</button></div>
          <p v-if="taxLow" class="nt warn">These look like one paycheque rather than a year. Set "How often" to match, or use the year-to-date figures on your payslip.</p>
          <div class="chips"><button v-for="c in ['Federal', 'State']" :key="c" @click="addTo('taxes', { kind: c + ' income tax', amount: '', frequency: 'annual', currency: cur }, 'tax')">+ {{ c }}</button><button @click="kind = 'tax_return'; goTo('docs')">+ Upload a tax return</button></div></section>
        <section id="fp-spending" class="card"><div class="h"><h4>Spending</h4><span class="mut">{{ flow.spend ? fmt(flow.spend) + ' a month' : 'Not started' }}</span></div>
          <div v-for="(r, i) in p.expenses" :key="i" class="rr r4"><input v-model="r.category" placeholder="Housing, school fees, staff, travel…" aria-label="Category"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.expenses.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Housing', 'Living', 'Children', 'Travel', 'Other']" :key="c" @click="addTo('expenses', { category: c === 'Other' ? '' : c, amount: '', frequency: c === 'Travel' ? 'annual' : 'monthly', currency: cur }, 'spending')">+ {{ c }}</button></div></section>
        <section id="fp-debts" class="card"><div class="h"><h4>Debts, credit and goals</h4><span class="mut">{{ p.debts.length + p.credit_scores.length + p.goals.length ? [p.debts.length && p.debts.length + ' debt' + (p.debts.length === 1 ? '' : 's'), p.credit_scores.length && p.credit_scores.length + ' score' + (p.credit_scores.length === 1 ? '' : 's'), p.goals.length && p.goals.length + ' goal' + (p.goals.length === 1 ? '' : 's')].filter(Boolean).join(' · ') : 'Nothing added yet' }}</span></div>
          <span class="lbl">Debts</span>
          <div v-if="p.debts.length" class="rh r6"><span>Debt</span><span>Owed to</span><span>Still owed</span><span>Rate %</span><span>A month</span><span /><span /></div>
          <div v-for="(r, i) in p.debts" :key="'d' + i" class="rr r6"><input v-model="r.name" placeholder="Name" aria-label="Debt"><input v-model="r.lender" :list="'lenders-' + i" placeholder="Bank, card company…" aria-label="Owed to" autocomplete="off"><datalist :id="'lenders-' + i"><option v-for="n in lendersFor(cur === 'NGN' ? 'NG' : 'US', String(r.name ?? ''))" :key="n" :value="n" /></datalist><input v-model="r.balance" type="number" min="0" placeholder="Balance" aria-label="Balance"><input v-model="r.rate" type="number" min="0" step="0.01" placeholder="Rate %" aria-label="Rate"><input v-model="r.payment" type="number" min="0" placeholder="A month" aria-label="Monthly payment"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.debts.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Mortgage', 'Car loan', 'Student loan', 'Card', 'Other loan']" :key="c" @click="add('debts', { name: c === 'Other loan' ? 'Loan' : c, lender: '', balance: '', rate: '', payment: '', currency: cur })">+ {{ c }}</button></div>
          <span class="lbl">Credit scores</span>
          <div v-for="(r, i) in p.credit_scores" :key="'c' + i" class="rr r4"><input v-model="r.person" placeholder="Person" aria-label="Person"><input v-model="r.score" type="number" min="300" max="900" placeholder="Score" aria-label="Score"><select v-model="r.source" aria-label="Source"><option>FICO</option><option>Credit Karma</option><option>Equifax</option><option>Experian</option><option>TransUnion</option><option>CreditChek</option><option>Other</option></select><input v-model="r.date" type="date" aria-label="Date"><button class="x" aria-label="Remove" @click="p.credit_scores.splice(i, 1)">×</button></div>
          <div class="chips"><button @click="add('credit_scores', { person: '', score: '', source: 'FICO', date: '' })">+ Add a score</button></div>
          <span class="lbl">Goals</span>
          <div v-for="(r, i) in p.goals" :key="'g' + i" class="rr r3"><input v-model="r.name" placeholder="e.g. Children's university, retire at 55" aria-label="Goal"><input v-model="r.target" type="number" min="0" placeholder="Target amount" aria-label="Target"><input v-model="r.by" type="date" aria-label="By"><button class="x" aria-label="Remove" @click="p.goals.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Retirement', 'Home', 'Education', 'Other']" :key="c" @click="add('goals', { name: c === 'Other' ? '' : c, target: '', by: '' })">+ {{ c }}</button></div>
          <label class="full">Anything else<textarea v-model="p.notes" rows="2" maxlength="4000" /></label></section>
      </div>
      <aside class="dside">
        <section id="fp-docs" class="card"><div class="h"><h4>Documents</h4><span class="mut">Kept private; the AI reads them for the review</span></div>
          <div class="dz2"><div class="dzc"><select v-model="kind" aria-label="Document type"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select><DropZone multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx" :disabled="busy === 'up' || preview" :label="busy === 'up' ? 'Uploading…' : 'Drop files or choose'" hint="PDF, images, CSV or Excel · up to 20 MB each" @change="upload" /></div>
            <div><div v-for="d in data.docs" :key="d.id" class="rw"><span>{{ d.name }}<em>{{ KIND[d.kind] ?? d.kind }}</em></span><button class="lk red" @click="act('remove_doc', { doc_id: d.id })">Remove</button></div><p v-if="!data.docs.length" class="mut">No documents yet. Stock plan and RSU statements, brokerage, 401(k) and pension statements, bank statements, payslips, tax returns and credit reports.</p>
              <button v-if="data.docs.length" class="btn secondary sm rdb" :disabled="!!busy || preview" @click="readDocs">{{ busy === 'read_docs' ? 'Reading… (up to a minute)' : 'Read figures with AI' }}</button></div></div>
          <div v-if="rd && rd.read.length" class="rd">
            <p class="mut">Read: {{ rd.read.join(', ') }}<template v-if="rd.skipped.length"> · not read (photos or scans): {{ rd.skipped.join(', ') }}</template>. Identity numbers were removed before reading. Untick anything that is wrong, then add the rest to the plan.</p>
            <template v-for="(e, i) in rd.found.equity" :key="'e' + i"><label class="ck"><input v-model="pick['equity' + i]" type="checkbox"><b>{{ e.company }} stock</b><span>{{ e.shares_held ? e.shares_held.toLocaleString('en-US') + ' shares' : '' }}{{ e.value ? ' · ' + money2(e.value) : '' }}{{ e.as_of ? ' · ' + e.as_of : '' }}</span></label>
              <ul class="sub"><li v-for="(v, j) in e.vested" :key="'v' + j">Release {{ v.date }}: {{ v.shares }} shares{{ v.gross ? ', ' + money2(v.gross) + ' before tax' : '' }}{{ v.withheld_shares ? ', ' + v.withheld_shares + ' withheld' : '' }}{{ v.tax_paid ? ' (' + money2(v.tax_paid) + ' tax' + (v.federal_rate_pct ? ', federal ' + v.federal_rate_pct + '%' : '') + ')' : '' }}</li>
                <li v-for="(g, j) in e.grants" :key="'g' + j">{{ (g.kind || 'rsu').toUpperCase() }} grant {{ g.id }} {{ g.granted ? 'of ' + g.granted : '' }}{{ g.unvested_shares ? ' · ' + g.unvested_shares + ' still to vest' : '' }}{{ g.next_vest ? ' · next ' + g.next_vest : '' }}</li>
                <li v-for="(x, j) in e.espp" :key="'p' + j">ESPP {{ x.date }}: {{ x.shares }} shares{{ x.purchase_price ? ' at ' + money2(x.purchase_price) : '' }}{{ x.market_price ? ' (market ' + money2(x.market_price) + ')' : '' }}</li></ul></template>
            <label v-for="(a, i) in rd.found.accounts" :key="'a' + i" class="ck"><input v-model="pick['accounts' + i]" type="checkbox"><b>{{ a.institution }}</b><span>{{ a.kind === 'company_stock' ? 'Employer stock' : a.kind }} · {{ money2(a.value, a.currency) }}{{ a.as_of ? ' · ' + a.as_of : '' }}</span></label>
            <label v-for="(x, i) in rd.found.incomes" :key="'i' + i" class="ck"><input v-model="pick['incomes' + i]" type="checkbox"><b>Income: {{ x.source }}</b><span>{{ money2(x.amount, x.currency) }} {{ x.frequency === 'annual' ? 'a year' : 'a month' }}</span></label>
            <label v-for="(x, i) in rd.found.expenses" :key="'x' + i" class="ck"><input v-model="pick['expenses' + i]" type="checkbox"><b>Spending: {{ x.category }}</b><span>{{ money2(x.amount, x.currency) }} {{ x.frequency === 'annual' ? 'a year' : 'a month' }}</span></label>
            <label v-for="(x, i) in rd.found.debts" :key="'d' + i" class="ck"><input v-model="pick['debts' + i]" type="checkbox"><b>Debt: {{ x.name }}</b><span>{{ money2(x.balance, x.currency) }} owed{{ x.payment ? ' · ' + money2(x.payment, x.currency) + ' a month' : '' }}</span></label>
            <div v-if="rd.found.flags.length || rd.checks.length" class="fl"><b>Planning points</b><p v-for="(f, i) in [...rd.checks, ...rd.found.flags]" :key="'f' + i"><strong>{{ f.title }}.</strong> {{ f.detail }}</p></div>
            <div class="act"><button class="btn" :disabled="!!busy" @click="applyRead">{{ busy === 'apply_read' ? 'Adding…' : 'Add ticked items to the plan' }}</button><button class="btn secondary" @click="rd = null">Cancel</button></div>
          </div>
          <div v-if="(p.equity ?? []).length || (p.doc_flags ?? []).length" class="rd kept">
            <b>From documents</b>
            <p v-for="(e, i) in p.equity ?? []" :key="'ke' + i"><strong>{{ e.company }}</strong>: {{ e.shares_held ? e.shares_held.toLocaleString('en-US') + ' shares' : '' }}{{ e.value ? ' worth ' + money2(e.value) : '' }}{{ e.as_of ? ' (' + e.as_of + ')' : '' }}{{ (e.vested ?? []).length ? ' · ' + e.vested.length + ' release' + (e.vested.length === 1 ? '' : 's') + ' read' : '' }}</p>
            <p v-for="(f, i) in p.doc_flags ?? []" :key="'kf' + i"><strong>{{ f.title }}.</strong> {{ f.detail }}</p>
          </div></section>
      </aside>
      </div>
    </div>
    <template v-else-if="data.report">
      <div class="rvl" :class="{ staff: data.staff }">
        <div class="rvm"><FinancialReport :report="data.report.content" :history="data.history" :api="preview ? undefined : api" :pdf="preview ? undefined : pdfUrl" :prepared="data.report.created_at" @share="shareOpen = true" @changed="refresh()" /></div>
        <aside v-if="data.staff" class="rva">
          <section class="card"><div class="h"><h4>Checks before the client relies on it</h4><span class="mut">{{ data.checks.filter((c: any) => c.level === 'warn').length ? data.checks.filter((c: any) => c.level === 'warn').length + ' to look at' : 'All clear' }}</span></div>
            <div v-for="(c, i) in data.checks" :key="i" class="chk" :class="c.level"><b>{{ c.title }}</b><span>{{ c.detail }}</span>
              <button v-if="c.fix === 'regenerate'" class="lk" :disabled="!!busy || preview" @click="generate">{{ busy === 'generate' ? 'Updating… (about a minute)' : 'Update the review from the details' }}</button><button v-else-if="c.fix === 'details'" class="lk" @click="sec = 'profile'; touched = true; nextTick(() => goTo('tax'))">Open Tax in the details</button></div>
            <p v-if="!data.checks.length" class="mut">Figures match the details and every document was read.</p></section>
          <section class="card"><div class="h"><h4>What the client sees</h4><span class="mut">{{ data.report.content.edited_at ? 'Edited ' + new Date(data.report.content.edited_at).toLocaleDateString('en-GB') : 'As drafted' }}</span></div>
            <label class="fl2">Headline<input v-model="ed.headline" maxlength="200"></label>
            <label class="fl2">Summary<textarea v-model="ed.summary" rows="4" maxlength="2000" /></label>
            <button class="btn secondary sm" :disabled="!!busy || preview" @click="saveWords">{{ busy === 'report_edit' ? 'Saving…' : 'Save wording' }}</button>
            <span class="lbl">Steps · the first three show as cards</span>
            <div v-for="st in staffSteps" :key="st.title" class="es" :class="{ off: st.hidden }">
              <template v-if="editing === st.title"><input v-model="es.title" aria-label="Step"><textarea v-model="es.detail" rows="3" aria-label="Detail" /><input v-model="es.timeframe" aria-label="When"><span class="row2"><button class="btn sm" :disabled="!!busy" @click="saveStep(st.title)">Save</button><button class="lk" @click="editing = ''">Cancel</button></span></template>
              <template v-else><span><b>{{ st.title }}</b><em>{{ st.hidden ? 'Hidden from the client' : st.timeframe }}</em></span><span class="row2"><button class="lk" @click="startEdit(st)">Edit</button><button class="lk" :disabled="!!busy || preview" @click="act('report_edit', st.hidden ? { show: st.title } : { hide: st.title }).then(() => refresh())">{{ st.hidden ? 'Show' : 'Hide' }}</button></span></template>
            </div></section>
          <section class="card"><div class="h"><h4>Shared link</h4><span class="mut">{{ data.has_link ? 'On' : 'Off' }}</span></div>
            <span class="mut">Family enter their name and email to view; the client is told who looked. Links last 90 days.</span>
            <span class="row2"><button class="btn secondary sm" :disabled="!!busy || preview" @click="share">{{ data.has_link ? 'Make a new link' : 'Create link' }}</button><button v-if="data.has_link" class="lk red" @click="act('unshare').then(() => refresh())">Turn off</button></span><span v-if="link" class="mut">Copied: {{ link }}</span>
            <span v-if="data.views.length" class="lbl">Who viewed</span><div v-for="(v, i) in data.views" :key="i" class="rw"><span>{{ v.name }} · {{ v.email }}</span><span class="mut">{{ new Date(v.viewed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</span></div></section>
        </aside>
      </div>
      <div v-if="!data.staff && (shareOpen || data.has_link || data.views.length)" class="card shr2">
        <div class="h"><h4>Share with family</h4><span class="mut">{{ data.has_link ? 'Link on · lasts 90 days' : 'Off' }}</span></div>
        <span class="mut">They enter their name and email to open a read-only copy, and you're told who looked. No account numbers or identity details are shown.</span>
        <span class="row2"><button class="btn sm" :disabled="!!busy" @click="share">{{ data.has_link ? 'Make a new link' : 'Create a link' }}</button><button v-if="data.has_link" class="lk red" @click="act('unshare').then(() => refresh())">Turn off</button></span><span v-if="link" class="mut">Copied: {{ link }}</span>
        <div v-for="(v, i) in data.views" :key="i" class="rw"><span>{{ v.name }} · {{ v.email }}</span><span class="mut">{{ new Date(v.viewed_at).toLocaleString('en-GB') }}</span></div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.dt { display: flex; flex-direction: column; gap: 12px; } .dh { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; }
.dhl { display: flex; flex-direction: column; gap: 2px; } .dhl h3 { margin: 0; font-size: 22px; color: var(--c-navy); } .dha { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dtl { flex-basis: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: var(--c-rule); border: 1px solid var(--c-rule); }
.dtl > div { background: #fbfaf8; padding: 12px 14px; display: flex; flex-direction: column; } .dtl span { font-size: 12.5px; color: var(--c-muted); } .dtl b { font-size: 20px; color: var(--c-navy); } .dtl em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.cnav { display: flex; flex-wrap: wrap; gap: 6px; } .cnav a { padding: 7px 12px; background: #fff; border: 1px solid var(--c-rule); text-decoration: none; color: var(--c-navy); font-size: 13.5px; } .cnav a.warn { background: #fdf6f0; border-color: #f2d9c4; color: #8a3a06; }
.lay2 { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; } .lay2 > .main { flex: 999 1 600px; } .dside { flex: 1 1 320px; display: flex; flex-direction: column; gap: 12px; min-width: 0; } .dside .dz2 { grid-template-columns: 1fr !important; }
.nt { margin: 4px 0; font-size: 13px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 9px 12px; } .nt.warn { background: #fdf6f0; }
.r6 { grid-template-columns: 1.1fr 1.3fr .9fr .6fr .8fr .7fr 28px; } .rh { display: grid; gap: 6px; font-size: 12px; color: var(--c-muted); padding: 4px 4px 2px; }
@media (max-width: 760px) { .dtl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .r6, .rh { grid-template-columns: 1fr; } .rh { display: none; } }
.rvl { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; } .rvm { flex: 999 1 640px; min-width: 0; } .rvl:not(.staff) .rvm { flex-basis: 100%; }
.rva { flex: 1 1 320px; display: flex; flex-direction: column; gap: 12px; } .rva .card { display: flex; flex-direction: column; gap: 8px; } .rva h4 { margin: 0; font-size: 15px; color: var(--c-navy); }
.chk { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--c-rule); background: #fbfaf8; font-size: 13px; } .chk.warn { background: #fdf6f0; border-color: #f2d9c4; } .chk b { font-size: 13.5px; } .chk .lk { align-self: flex-start; }
.fl2 { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } .fl2 input, .fl2 textarea, .es input, .es textarea { font: inherit; font-size: 13.5px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.es { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .es.off { opacity: .6; } .es > span:first-child { display: flex; flex-direction: column; } .es em { font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.row2 { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; } .shr2 { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; } .shr2 h4 { margin: 0; }
.fp { display: flex; flex-direction: column; gap: 12px; } .fp *, .fp { box-sizing: border-box; } .s2 { display: flex; gap: 4px; } .s2 button { background: #fff; border: 1px solid var(--c-rule); padding: 7px 14px; font: inherit; font-size: 13.5px; cursor: pointer; } .s2 .on { border-color: var(--c-blue-deep); color: var(--c-blue-deep); font-weight: 600; } .s2 button:disabled { opacity: .45; cursor: default; }
.okm { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; } .mut { color: var(--c-muted); font-size: 12.5px; }
.lay { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
.side { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 4px; padding: 16px 0 0; } .side > b, .side > .mut, .side > .pb { margin: 0 16px; } .side > b { font-size: 15px; }
.pb { display: block; height: 6px; background: #e6ecf2; margin-top: 8px !important; } .pb i { display: block; height: 100%; background: var(--c-blue-deep); }
.stp { display: flex; flex-direction: column; padding: 8px; } .stp a { display: flex; gap: 10px; align-items: center; padding: 8px; color: var(--c-ink-soft); text-decoration: none; font-size: 14px; } .stp a:hover { background: var(--c-paper-2); } .stp a.now { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; }
.nb { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--c-rule-strong); font-size: 12px; color: var(--c-blue-deep); flex: none; } .stp a.done .nb { border-color: var(--c-blue-deep); } .stp a.now .nb { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.gen { border-top: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; } .sv { font-size: 12px; color: var(--c-muted); }
.main { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .card { margin: 0; }
.g3c { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g3c .card { display: flex; flex-direction: column; gap: 8px; }
.lbl { display: block; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--c-muted); margin-top: 4px; }
.fl { display: grid; grid-template-columns: 70px minmax(0, 1fr) 84px; gap: 8px; align-items: center; font-size: 13px; } .fl > span:first-child { color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .fl b { text-align: right; font-weight: 600; } .fl.sm { font-size: 12.5px; }
.br { display: block; height: 12px; background: #eef2f6; } .br i { display: block; height: 100%; background: var(--c-blue-deep); } .br i.t { background: #b9cfe2; } .br i.s { background: #6e737b; } .br i.v { background: var(--c-navy); }
.dn { display: flex; align-items: center; gap: 14px; } .big { display: block; font-size: 24px; font-weight: 600; }
.h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; } .card h4 { margin: 0; font-size: 15px; }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; min-width: 0; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); }
.hh { display: grid; grid-template-columns: 110px 110px minmax(0, 1fr) 130px; gap: 12px; }
.rr { display: grid; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid var(--c-rule); } .rr input, .rr select { border-color: transparent; background: transparent; padding: 6px 4px; } .rr input:hover, .rr select:hover, .rr input:focus, .rr select:focus { border-color: var(--c-rule-strong); background: #fff; } .rr input[type=number] { text-align: right; font-weight: 600; }
.r5 { grid-template-columns: 1.4fr 1fr .9fr 1fr .7fr 28px; } .r4 { grid-template-columns: 2fr .9fr 1fr .7fr 28px; } .r3 { grid-template-columns: 2.4fr 1fr 1fr 28px; }
.x { background: none; border: 0; color: var(--c-muted); font-size: 18px; cursor: pointer; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; } .chips button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .chips button:hover { border-color: var(--c-navy); }
.full { margin-top: 12px; }
.rdb { margin-top: 10px; } .rd { margin-top: 14px; border-top: 1px solid var(--c-rule); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; } .rd .ck { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; } .rd .ck span { color: var(--c-muted); } .rd .sub { margin: 0 0 4px 30px; padding: 0; list-style: none; color: var(--c-ink-soft); font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
.rd .fl { background: var(--c-paper-2); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; } .rd .fl p, .rd.kept p { margin: 0; font-size: 13.5px; } .rd .act { display: flex; gap: 8px; margin-top: 4px; } .rd.kept { gap: 6px; }
.dz2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .dzc { display: flex; flex-direction: column; gap: 8px; } .rw { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; } .lk.red { color: var(--c-danger); }
.shr { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13.5px; } .sa { display: flex; gap: 10px; align-items: center; }
@media (max-width: 1100px) { .lay { grid-template-columns: 1fr; } .side { position: static; } .g3c { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .hh, .r5, .r4, .r3, .dz2 { grid-template-columns: 1fr; } }
</style>
