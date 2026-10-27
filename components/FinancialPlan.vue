<script setup lang="ts">
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
async function share() { const r = await act('share'); if (r?.url) { link.value = r.url; try { await navigator.clipboard.writeText(r.url) } catch { /* ignore */ } } }
// Monthly figures in the main currency (other currencies are left out of the charts), the eight steps and their state.
const monthly = (rows: any[]) => rows.filter((r) => (r.currency ?? cur.value) === cur.value).reduce((a, r) => a + (Number(r.amount) || 0) / (r.frequency === 'annual' ? 12 : 1), 0)
const flow = computed(() => { const inc = monthly(p.incomes), tax = monthly(p.taxes), spend = monthly(p.expenses); return { inc, tax, spend, saved: Math.max(0, inc - tax - spend), rate: inc > 0 ? Math.max(0, (inc - tax - spend) / inc) : null } })
const debt = computed(() => { const d = p.debts.filter((r: any) => (r.currency ?? cur.value) === cur.value); return { total: d.reduce((a: number, r: any) => a + (Number(r.balance) || 0), 0), pay: d.reduce((a: number, r: any) => a + (Number(r.payment) || 0), 0), rows: d.filter((r: any) => Number(r.balance) > 0).sort((a: any, b: any) => Number(b.balance) - Number(a.balance)).slice(0, 4) } })
const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value, maximumFractionDigits: 0 }).format(Math.round(v))
const bar = (v: number) => (flow.value.inc > 0 ? Math.min(100, (v / flow.value.inc) * 100) : 0) + '%'
const STEPS = computed(() => [['household', 'Household', !!p.household.location], ['income', 'Income', p.incomes.length > 0], ['tax', 'Tax', p.taxes.length > 0], ['spending', 'Spending', p.expenses.length > 0],
  ['debts', 'Debts', p.debts.length > 0], ['debts', 'Credit scores', p.credit_scores.length > 0], ['debts', 'Goals', p.goals.length > 0], ['docs', 'Documents', (data.value?.docs ?? []).length > 0]] as [string, string, boolean][])
const doneN = computed(() => STEPS.value.filter((x) => x[2]).length)
const nextStep = computed(() => STEPS.value.findIndex((x) => !x[2]))
function goTo(id: string) { if (import.meta.client) document.getElementById('fp-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function addTo(k: string, row: Record<string, unknown>, sec: string) { add(k, row); nextTick(() => goTo(sec)) }
const KIND: Record<string, string> = { bank_statement: 'Bank statement', tax_return: 'Tax return', payslip: 'Payslip / salary', credit_report: 'Credit report (FICO, Credit Karma…)', passport: 'Passport', proof_of_address: 'Proof of address (last 3 months)', other: 'Other' }
</script>
<template>
  <div v-if="data" class="fp">
    <nav class="s2"><button :class="{ on: sec === 'profile' }" @click="sec = 'profile'; touched = true">Financial details</button><button :class="{ on: sec === 'report' }" :disabled="!data.report" @click="sec = 'report'">Financial review</button></nav>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div v-if="sec === 'profile'" class="lay">
      <aside class="card side">
        <b>Plan details</b><span class="mut">{{ doneN }} of 8 done · the review gets better with each</span><span class="pb"><i :style="{ width: (doneN / 8) * 100 + '%' }" /></span>
        <nav class="stp"><a v-for="(x, i) in STEPS" :key="x[1]" href="#" :class="{ done: x[2], now: i === nextStep }" @click.prevent="goTo(x[0])"><span class="nb">{{ x[2] ? '✓' : i + 1 }}</span>{{ x[1] }}</a></nav>
        <div class="gen"><button class="btn" :disabled="!!busy || preview" @click="generate">{{ busy === 'generate' ? 'Preparing… (about a minute)' : data.report ? 'Update financial review' : 'Prepare financial review' }}</button><span class="mut">The AI reads the details and documents and drafts the review.</span>
          <span class="sv">{{ preview ? 'Preview only' : saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved: check the figures' : 'Saved as you go' }}</span></div>
      </aside>
      <div class="main">
        <div class="g3c">
          <section class="card"><span class="lbl">Money in and out, a month</span>
            <div class="fl"><span>Income</span><span class="br"><i :style="{ width: flow.inc > 0 ? '100%' : '0' }" /></span><b>{{ fmt(flow.inc) }}</b></div>
            <div class="fl"><span>Tax</span><span class="br"><i class="t" :style="{ width: bar(flow.tax) }" /></span><b>{{ fmt(flow.tax) }}</b></div>
            <div class="fl"><span>Spending</span><span class="br"><i class="s" :style="{ width: bar(flow.spend) }" /></span><b>{{ fmt(flow.spend) }}</b></div>
            <div class="fl"><span>Saved</span><span class="br"><i class="v" :style="{ width: bar(flow.saved) }" /></span><b>{{ fmt(flow.saved) }}</b></div></section>
          <section class="card"><span class="lbl">Savings rate</span>
            <div class="dn"><svg viewBox="0 0 42 42" width="104" height="104" role="img" :aria-label="'Savings rate ' + Math.round((flow.rate ?? 0) * 100) + ' percent'"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#e6ecf2" stroke-width="5" /><circle cx="21" cy="21" r="15.9" fill="none" stroke="#0c1a2e" stroke-width="5" :stroke-dasharray="(flow.rate ?? 0) * 100 + ' ' + (100 - (flow.rate ?? 0) * 100)" stroke-dashoffset="25" /></svg>
              <div><b class="big">{{ flow.rate == null ? '—' : Math.round(flow.rate * 100) + '%' }}</b><span class="mut">{{ flow.rate == null ? 'Add income to see it' : 'of income kept after tax and spending' }}</span></div></div></section>
          <section class="card"><span class="lbl">Debts</span><b class="big">{{ debt.total ? fmt(debt.total) : '—' }}</b><span class="mut">{{ debt.total ? fmt(debt.pay) + ' a month in payments' : 'Nothing added yet' }}</span>
            <div v-for="(d, i) in debt.rows" :key="i" class="fl sm"><span>{{ d.name || 'Debt' }}</span><span class="br"><i class="s" :style="{ width: (Number(d.balance) / debt.total) * 100 + '%' }" /></span><b>{{ fmt(Number(d.balance)) }}</b></div></section>
        </div>
        <section id="fp-household" class="card"><div class="h"><h4>Household</h4><span class="mut">{{ p.household.adults }} adult{{ Number(p.household.adults) === 1 ? '' : 's' }}, {{ Number(p.household.children) ? p.household.children + ' child' + (Number(p.household.children) === 1 ? '' : 'ren') : 'no children' }} · {{ cur }}</span></div>
          <div class="hh"><label>Adults<input v-model="p.household.adults" type="number" min="0"></label><label>Children<input v-model="p.household.children" type="number" min="0"></label><label>City and country<input v-model="p.household.location" placeholder="e.g. Houston, US"></label><label>Main currency<select v-model="cur"><option>USD</option><option>NGN</option></select></label></div></section>
        <section id="fp-income" class="card"><div class="h"><h4>Income</h4><span class="mut">{{ flow.inc ? fmt(flow.inc) + ' a month' : 'Salary, business, rent, dividends…' }}</span></div>
          <div v-for="(r, i) in p.incomes" :key="i" class="rr r5"><input v-model="r.source" placeholder="Source" aria-label="Source"><input v-model="r.who" placeholder="Who" aria-label="Who"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.incomes.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Salary', 'Business', 'Rent', 'Dividends', 'Other income']" :key="c" @click="addTo('incomes', { who: '', source: c === 'Other income' ? '' : c, amount: '', frequency: c === 'Dividends' ? 'annual' : 'monthly', currency: cur }, 'income')">+ {{ c }}</button></div></section>
        <section id="fp-tax" class="card"><div class="h"><h4>Tax</h4><span class="mut">{{ flow.tax ? fmt(flow.tax) + ' a month' : 'Not started' }}</span></div>
          <div v-for="(r, i) in p.taxes" :key="i" class="rr r4"><input v-model="r.kind" placeholder="e.g. Federal income tax, PAYE" aria-label="Tax"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.taxes.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Federal', 'State']" :key="c" @click="addTo('taxes', { kind: c + ' income tax', amount: '', frequency: 'annual', currency: cur }, 'tax')">+ {{ c }}</button><button @click="kind = 'tax_return'; goTo('docs')">+ Upload a tax return</button></div></section>
        <section id="fp-spending" class="card"><div class="h"><h4>Spending</h4><span class="mut">{{ flow.spend ? fmt(flow.spend) + ' a month' : 'Not started' }}</span></div>
          <div v-for="(r, i) in p.expenses" :key="i" class="rr r4"><input v-model="r.category" placeholder="Housing, school fees, staff, travel…" aria-label="Category"><select v-model="r.frequency" aria-label="How often"><option value="monthly">Monthly</option><option value="annual">Yearly</option></select><input v-model="r.amount" type="number" min="0" placeholder="Amount" aria-label="Amount"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.expenses.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Housing', 'Living', 'Children', 'Travel', 'Other']" :key="c" @click="addTo('expenses', { category: c === 'Other' ? '' : c, amount: '', frequency: c === 'Travel' ? 'annual' : 'monthly', currency: cur }, 'spending')">+ {{ c }}</button></div></section>
        <section id="fp-debts" class="card"><div class="h"><h4>Debts, credit and goals</h4><span class="mut">{{ p.debts.length + p.credit_scores.length + p.goals.length ? [p.debts.length && p.debts.length + ' debt' + (p.debts.length === 1 ? '' : 's'), p.credit_scores.length && p.credit_scores.length + ' score' + (p.credit_scores.length === 1 ? '' : 's'), p.goals.length && p.goals.length + ' goal' + (p.goals.length === 1 ? '' : 's')].filter(Boolean).join(' · ') : 'Nothing added yet' }}</span></div>
          <span class="lbl">Debts</span>
          <div v-for="(r, i) in p.debts" :key="'d' + i" class="rr r5"><input v-model="r.name" placeholder="Name" aria-label="Debt"><input v-model="r.balance" type="number" min="0" placeholder="Balance" aria-label="Balance"><input v-model="r.rate" type="number" min="0" step="0.01" placeholder="Rate %" aria-label="Rate"><input v-model="r.payment" type="number" min="0" placeholder="A month" aria-label="Monthly payment"><select v-model="r.currency" aria-label="Currency"><option>USD</option><option>NGN</option></select><button class="x" aria-label="Remove" @click="p.debts.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Mortgage', 'Loan', 'Card']" :key="c" @click="add('debts', { name: c, balance: '', rate: '', payment: '', currency: cur })">+ {{ c }}</button></div>
          <span class="lbl">Credit scores</span>
          <div v-for="(r, i) in p.credit_scores" :key="'c' + i" class="rr r4"><input v-model="r.person" placeholder="Person" aria-label="Person"><input v-model="r.score" type="number" min="300" max="900" placeholder="Score" aria-label="Score"><select v-model="r.source" aria-label="Source"><option>FICO</option><option>Credit Karma</option><option>Equifax</option><option>Experian</option><option>TransUnion</option><option>CreditChek</option><option>Other</option></select><input v-model="r.date" type="date" aria-label="Date"><button class="x" aria-label="Remove" @click="p.credit_scores.splice(i, 1)">×</button></div>
          <div class="chips"><button @click="add('credit_scores', { person: '', score: '', source: 'FICO', date: '' })">+ Add a score</button></div>
          <span class="lbl">Goals</span>
          <div v-for="(r, i) in p.goals" :key="'g' + i" class="rr r3"><input v-model="r.name" placeholder="e.g. Children's university, retire at 55" aria-label="Goal"><input v-model="r.target" type="number" min="0" placeholder="Target amount" aria-label="Target"><input v-model="r.by" type="date" aria-label="By"><button class="x" aria-label="Remove" @click="p.goals.splice(i, 1)">×</button></div>
          <div class="chips"><button v-for="c in ['Retirement', 'Home', 'Education', 'Other']" :key="c" @click="add('goals', { name: c === 'Other' ? '' : c, target: '', by: '' })">+ {{ c }}</button></div>
          <label class="full">Anything else<textarea v-model="p.notes" rows="2" maxlength="4000" /></label></section>
        <section id="fp-docs" class="card"><div class="h"><h4>Documents</h4><span class="mut">Kept private; the AI reads them for the review</span></div>
          <div class="dz2"><div class="dzc"><select v-model="kind" aria-label="Document type"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select><DropZone multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx" :disabled="busy === 'up' || preview" :label="busy === 'up' ? 'Uploading…' : 'Drop files or choose'" hint="PDF, images, CSV or Excel · up to 20 MB each" @change="upload" /></div>
            <div><div v-for="d in data.docs" :key="d.id" class="rw"><span>{{ d.name }}<em>{{ KIND[d.kind] ?? d.kind }}</em></span><button class="lk red" @click="act('remove_doc', { doc_id: d.id })">Remove</button></div><p v-if="!data.docs.length" class="mut">No documents yet. Bank statements, tax returns, payslips and credit reports.</p></div></div></section>
      </div>
    </div>
    <template v-else-if="data.report">
      <div class="shr card"><span><b>Share this review</b> with family: they enter their name and email to view, and you are told who looked.</span><span class="sa"><button class="btn sm" :disabled="!!busy" @click="share">{{ data.has_link ? 'Make a new link' : 'Create link' }}</button><button v-if="data.has_link" class="lk red" @click="act('unshare')">Turn off</button></span><span v-if="link" class="mut">Copied: {{ link }}</span></div>
      <FinancialReport :report="data.report.content" :history="data.history" />
      <div v-if="data.views.length" class="card"><h4>Who viewed the shared review</h4><div v-for="(v, i) in data.views" :key="i" class="rw"><span>{{ v.name }} · {{ v.email }}</span><span class="mut">{{ new Date(v.viewed_at).toLocaleString('en-GB') }}</span></div></div>
    </template>
  </div>
</template>
<style scoped>
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
.dz2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .dzc { display: flex; flex-direction: column; gap: 8px; } .rw { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; } .lk.red { color: var(--c-danger); }
.shr { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13.5px; } .sa { display: flex; gap: 10px; align-items: center; }
@media (max-width: 1100px) { .lay { grid-template-columns: 1fr; } .side { position: static; } .g3c { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .hh, .r5, .r4, .r3, .dz2 { grid-template-columns: 1fr; } }
</style>
