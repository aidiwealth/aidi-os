<script setup lang="ts">
const id = useRoute().params.id as string
interface Row { seq: number; due_date: string; principal_due: number; interest_due: number; paid: number; status: string }
interface Pos { outstandingPrincipal: number; principalReceived: number; interestReceived: number; arrears: number; dpd: number; bucket: string; next: { due_date: string; amount: number } | null; rows: Row[] }
interface Rep { id: string; received_on: string; amount: string; note: string | null; by_name: string | null; allocation: { interest: number; principal: number; excess: number } | null }
interface Check { due_date: string; checked_on: string; result: string; note: string | null; document_id: string | null; document_title: string | null }
interface Cov { id: string; title: string; kind: string; threshold: string | null; frequency: string; next_due: string; active: boolean; days_left: number; checks: Check[] | null }
const { data, error, refresh } = await useFetch<{ loan: Record<string, string>; position: Pos; repayments: Rep[]; covenants: Cov[]; lenders: { id: string; name: string }[]; borrowers: { id: string; name: string }[] }>('/api/credit/loans/' + id)
const { data: docs } = await useFetch<{ id: string; title: string }[]>('/api/documents')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
useHead({ title: () => (data.value?.loan.borrower ?? 'Loan') + ' — Credit' })
const cur = computed(() => data.value?.loan.currency ?? 'USD')
const money = (v: number | string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur.value }).format(Number(v))
// Large amounts in the summary strip read short (NGN 3M); exact figures sit below in the schedule.
const short = (v: number | string) => briefMoney(v, cur.value)
const split = computed(() => data.value ? [{ label: 'Principal repaid', value: data.value.position.principalReceived }, { label: 'Interest received', value: data.value.position.interestReceived }, { label: 'Principal still owed', value: data.value.position.outstandingPrincipal }] : [])
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const busy = ref(false); const msg = ref(''); const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false } }
const rp = reactive({ received_on: new Date().toISOString().slice(0, 10), amount: '', note: '' })
const addRepayment = () => run(async () => { await $fetch('/api/credit/loans/' + id + '/repayments', { method: 'POST', body: { ...rp, amount: rp.amount.replace(/[^0-9.]/g, '') } }); rp.amount = ''; rp.note = '' }, 'Repayment recorded.')
const cf = reactive({ title: '', kind: 'financial', threshold: '', frequency: 'quarterly', next_due: '' })
const covOpen = ref(false)
const addCov = () => run(async () => { await $fetch('/api/credit/covenants', { method: 'POST', body: { ...cf, loan_id: id } }); covOpen.value = false; cf.title = ''; cf.threshold = '' }, 'Covenant added.')
const chk = reactive<Record<string, { result: string; note: string; document_id: string }>>({})
const ck = (cid: string) => (chk[cid] ??= { result: 'met', note: '', document_id: '' })
const check = (cid: string) => run(() => $fetch('/api/credit/covenants/' + cid + '/check', { method: 'POST', body: ck(cid) }), 'Covenant test recorded.')
const st = reactive({ status: 'repaid', note: '' })
const setStatus = () => run(() => $fetch('/api/credit/loans/' + id + '/status', { method: 'POST', body: st }), 'Status updated.')
const RT: Record<string, string> = { amortising: 'Amortising', interest_only: 'Interest only', bullet: 'Bullet' }
const RS: Record<string, string> = { paid: 'Paid', partial: 'Part paid', overdue: 'Overdue', due: 'Due today', upcoming: '' }
// Edit the loan: lender (the company it was paid from), borrower, reference, security, notes and — before any
// repayment — the terms (the schedule is rebuilt).
const ed = reactive({ open: false, lender_entity_id: '', borrower_id: '', reference: '', security: '', notes: '', principal: '', currency: 'USD', annual_rate: '', tenor_months: '', repayment_type: 'amortising', frequency: 'monthly', disbursed_on: '', first_payment_on: '' })
function openEdit() { const l = data.value!.loan; Object.assign(ed, { open: true, lender_entity_id: l.lender_entity_id ?? '', borrower_id: l.borrower_id, reference: l.reference ?? '', security: l.security ?? '', notes: l.notes ?? '', principal: String(Number(l.principal)), currency: l.currency, annual_rate: String(Number(l.annual_rate)), tenor_months: String(l.tenor_months), repayment_type: l.repayment_type, frequency: l.frequency, disbursed_on: l.disbursed_on, first_payment_on: l.first_payment_on }); msg.value = '' }
const locked = computed(() => (data.value?.repayments.length ?? 0) > 0)
const saveEdit = () => run(async () => { const { open, ...b } = ed; void open; const body: Record<string, unknown> = { lender_entity_id: b.lender_entity_id || null, borrower_id: b.borrower_id, reference: b.reference, security: b.security, notes: b.notes }; if (!locked.value) Object.assign(body, { principal: b.principal.replace(/[^0-9.]/g, ''), currency: b.currency, annual_rate: b.annual_rate, tenor_months: b.tenor_months, repayment_type: b.repayment_type, frequency: b.frequency, disbursed_on: b.disbursed_on, first_payment_on: b.first_payment_on }); await $fetch('/api/credit/loans/' + id + '/edit', { method: 'POST', body }); ed.open = false }, 'Loan updated.')
const paidPct = computed(() => { const p = Number(data.value?.loan.principal ?? 0); return p ? Math.min(100, Math.round((data.value!.position.principalReceived / p) * 100)) : 0 })
const BK: Record<string, string> = { current: 'Current', '1-30': '1–30 days late', '31-90': '31–90 days late', '90+': '90+ days late' }
</script>

<template>
  <section v-if="data" class="ln">
    <NuxtLink to="/credit?t=loans" class="back">← Loans</NuxtLink>
    <div class="hdr">
      <div><p class="kl">Loan to</p><h1>{{ data.loan.borrower }}</h1>
        <p class="sub2">Lent by <b>{{ data.loan.lender ?? 'not set' }}</b><template v-if="data.loan.reference"> · {{ data.loan.reference }}</template><template v-if="data.loan.sector"> · {{ data.loan.sector }}</template><template v-if="data.loan.country"> · {{ data.loan.country }}</template></p></div>
      <div class="ha"><span class="pill" :class="data.loan.status === 'active' ? (data.position.bucket === 'current' ? 'ok' : data.position.bucket === '1-30' ? 'late' : 'bad') : 'closed'">{{ data.loan.status === 'active' ? BK[data.position.bucket] : data.loan.status.replace('_', ' ') }}</span><button class="btn secondary" type="button" @click="openEdit">Edit loan</button><DeleteButton type="loan" :id="id" :name="'the loan to ' + data.loan.borrower" to="/credit?t=loans" /></div>
    </div>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="okm" role="status">{{ ok }}</p>

    <div class="card strip">
      <div class="s0"><em>Principal</em><b>{{ short(data.loan.principal) }}</b><small>{{ Number(data.loan.annual_rate) }}% · {{ data.loan.tenor_months }} months · {{ RT[data.loan.repayment_type] }}{{ data.loan.repayment_type === 'bullet' ? '' : ', ' + data.loan.frequency }}</small></div>
      <div><em>Repaid</em><b>{{ short(data.position.principalReceived) }}</b><small><i class="bar"><s :style="{ width: paidPct + '%' }" /></i>{{ paidPct }}% of principal</small></div>
      <div><em>Outstanding</em><b>{{ short(data.position.outstandingPrincipal) }}</b><small>disbursed {{ day(data.loan.disbursed_on) }}</small></div>
      <div><em>Next payment</em><b>{{ data.position.next ? short(data.position.next.amount) : '—' }}</b><small>{{ data.position.next ? 'due ' + day(data.position.next.due_date) : 'nothing scheduled' }}</small></div>
      <div :class="{ late: data.position.arrears > 0 }"><em>Arrears</em><b>{{ short(data.position.arrears) }}</b><small>{{ data.position.dpd ? data.position.dpd + ' days past due' : 'up to date' }}</small></div>
      <div><em>Interest received</em><b>{{ short(data.position.interestReceived) }}</b><small>to date</small></div>
    </div>

    <div class="grid">
      <div class="col">
        <div class="card pad0"><div class="ch"><h2>Repayment schedule</h2><span class="mut">{{ data.position.rows.length }} instalment{{ data.position.rows.length === 1 ? '' : 's' }}</span></div>
          <div class="scroll"><table class="table sm" data-nosearch>
            <thead><tr><th>#</th><th>Due</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Paid</th><th /></tr></thead>
            <tbody><tr v-for="r in data.position.rows" :key="r.seq" :data-s="r.status"><td>{{ r.seq }}</td><td>{{ day(r.due_date) }}</td><td class="num">{{ money(r.principal_due) }}</td><td class="num">{{ money(r.interest_due) }}</td><td class="num">{{ r.paid ? money(r.paid) : '' }}</td><td class="rs">{{ RS[r.status] }}</td></tr></tbody>
          </table></div></div>
        <div class="card pad0"><div class="ch"><h2>Repayments received</h2><span class="mut">{{ data.repayments.length }}</span></div>
          <div v-for="r in data.repayments" :key="r.id" class="rr"><span><b>{{ day(r.received_on) }}</b><em>{{ r.allocation ? 'interest ' + money(r.allocation.interest) + ' · principal ' + money(r.allocation.principal + r.allocation.excess) : '' }}<template v-if="r.note"> · {{ r.note }}</template><template v-if="r.by_name"> · {{ r.by_name }}</template></em></span><b>{{ money(r.amount) }}</b></div>
          <p v-if="!data.repayments.length" class="mut pad">None yet.</p></div>
        <div class="card pad0"><div class="ch"><h2>Covenants</h2><button class="btn secondary sm" type="button" @click="covOpen = !covOpen">{{ covOpen ? 'Close' : 'Add covenant' }}</button></div>
          <form v-if="covOpen" class="frm4 pad" @submit.prevent="addCov">
            <label class="label">Covenant<input v-model="cf.title" required maxlength="200" placeholder="e.g. Debt service cover ratio"></label>
            <label class="label">Type<select v-model="cf.kind"><option value="financial">Financial</option><option value="reporting">Reporting</option><option value="other">Other</option></select></label>
            <label class="label">Threshold<input v-model="cf.threshold" maxlength="300" placeholder="e.g. ≥ 1.25x"></label>
            <label class="label">Tested<select v-model="cf.frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option><option value="once">Once</option></select></label>
            <label class="label">Next test<input v-model="cf.next_due" type="date" required></label>
            <button class="btn" type="submit" :disabled="busy">Add</button>
          </form>
          <div v-for="c in data.covenants" :key="c.id" class="cov" :class="{ off: !c.active }">
            <div class="covh"><b>{{ c.title }}</b><span>{{ c.kind }}<template v-if="c.threshold"> · {{ c.threshold }}</template> · {{ c.frequency }}</span><span v-if="c.active" :class="{ red: c.days_left < 0 }">next test {{ day(c.next_due) }}{{ c.days_left < 0 ? ' (overdue)' : '' }}</span></div>
            <form v-if="c.active" class="covf" @submit.prevent="check(c.id)">
              <select v-model="ck(c.id).result" aria-label="Result"><option value="met">Met</option><option value="breached">Breached</option><option value="waived">Waived</option></select>
              <input v-model="ck(c.id).note" maxlength="2000" placeholder="Note (required for breach or waiver)">
              <select v-model="ck(c.id).document_id" aria-label="Evidence"><option value="">No evidence</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select>
              <button class="btn sm" type="submit" :disabled="busy">Record test</button>
            </form>
            <ul v-if="c.checks?.length" class="checks"><li v-for="(k, i) in c.checks" :key="i" :data-r="k.result">{{ day(k.due_date) }}: <b>{{ k.result }}</b><template v-if="k.note"> · {{ k.note }}</template><template v-if="k.document_title"> · {{ k.document_title }}</template></li></ul>
          </div>
          <p v-if="!data.covenants.length && !covOpen" class="mut pad">No covenants recorded.</p></div>
      </div>
      <div class="col">
        <form v-if="data.loan.status === 'active'" class="card frm" @submit.prevent="addRepayment">
          <h2>Record a repayment</h2>
          <label class="label">Received on<input v-model="rp.received_on" type="date" required></label>
          <label class="label">Amount ({{ cur }})<input v-model="rp.amount" inputmode="decimal" required></label>
          <label class="label">Bank reference<input v-model="rp.note" maxlength="1000" placeholder="optional"></label>
          <button class="btn" type="submit" :disabled="busy">Record repayment</button>
          <p class="hint">Applied to the oldest instalment first, interest before principal; anything beyond the schedule repays principal early.</p>
        </form>
        <div class="card"><DonutChart title="Where the loan stands" total-label="Repaid and owed" :currency="cur" :segments="split" /></div>
        <div class="card"><h2>Terms</h2>
          <div class="kv"><span>Lent by</span><b>{{ data.loan.lender ?? '—' }}</b></div>
          <div class="kv"><span>Borrower</span><b>{{ data.loan.borrower }}</b></div>
          <div class="kv"><span>Rate</span><b>{{ Number(data.loan.annual_rate) }}% a year</b></div>
          <div class="kv"><span>Repayment</span><b>{{ RT[data.loan.repayment_type] }}{{ data.loan.repayment_type === 'bullet' ? '' : ', ' + data.loan.frequency }}</b></div>
          <div class="kv"><span>Disbursed</span><b>{{ day(data.loan.disbursed_on) }}</b></div>
          <div class="kv"><span>First payment</span><b>{{ day(data.loan.first_payment_on) }}</b></div>
          <div v-if="data.loan.security" class="kv"><span>Security</span><b>{{ data.loan.security }}</b></div>
          <div v-if="data.loan.notes" class="kv"><span>Notes</span><b>{{ data.loan.notes }}</b></div></div>
        <form v-if="isGp" class="card frm" @submit.prevent="setStatus">
          <h2>Close or restructure (GPs)</h2>
          <label class="label">Status<select v-model="st.status"><option value="active">Active</option><option value="repaid">Repaid</option><option value="written_off">Written off</option><option value="restructured">Restructured</option></select></label>
          <label class="label">Note<input v-model="st.note" required minlength="3" maxlength="1000"></label>
          <button class="btn secondary" type="submit" :disabled="busy">Update status</button>
        </form>
      </div>
    </div>
    <div v-if="data.loan.borrower_id" class="card crd"><h2>Credit · {{ data.loan.borrower }}</h2><p class="mut">The business's credit review and its founders and guarantors.</p><BorrowerCredit :borrower-id="data.loan.borrower_id" /></div>

    <AppModal :open="ed.open" title="Edit loan" wide @close="ed.open = false"><form class="frm2" @submit.prevent="saveEdit">
      <label class="label">Lent by (the company the money left from)<select v-model="ed.lender_entity_id"><option value="">Not set</option><option v-for="v in data.lenders" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
      <label class="label">Borrower<select v-model="ed.borrower_id"><option v-for="b in data.borrowers" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
      <label class="label">Reference<input v-model="ed.reference" maxlength="60"></label>
      <label class="label">Security<input v-model="ed.security" maxlength="1000"></label>
      <p v-if="locked" class="hint">Repayments are recorded, so the amount, rate, tenor and dates stay as they are. To change them, mark the loan restructured and book the new terms.</p>
      <template v-else>
        <label class="label">Principal<input v-model="ed.principal" inputmode="decimal"></label>
        <label class="label">Currency<select v-model="ed.currency"><option v-for="c in ['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'GBP', 'EUR']" :key="c" :value="c">{{ c }}</option></select></label>
        <label class="label">Annual rate (%)<input v-model="ed.annual_rate" inputmode="decimal"></label>
        <label class="label">Tenor (months)<input v-model="ed.tenor_months" type="number" min="1" max="360"></label>
        <label class="label">Repayment<select v-model="ed.repayment_type"><option v-for="(l, k) in RT" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Frequency<select v-model="ed.frequency" :disabled="ed.repayment_type === 'bullet'"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
        <label class="label">Disbursed on<input v-model="ed.disbursed_on" type="date"></label>
        <label class="label">First payment<input v-model="ed.first_payment_on" type="date"></label>
        <p class="hint">Changing the terms rebuilds the repayment schedule.</p>
      </template>
      <label class="label full">Notes<input v-model="ed.notes" maxlength="3000"></label>
      <p v-if="msg" class="error full">{{ msg }}</p>
    </form>
    <template #foot><button class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" :disabled="busy" @click="saveEdit">Save changes</button></template></AppModal>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Loan not found.' : 'Could not load this loan.' }}</p>
</template>

<style scoped>
.ln { display: flex; flex-direction: column; gap: 14px; } .back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; }
.hdr { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hdr h1 { margin: 0; } .kl { margin: 0 0 2px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; } .sub2 { margin: 4px 0 0; color: var(--c-muted); font-size: 14px; } .sub2 b { color: var(--c-navy); font-weight: 600; }
.ha { display: flex; gap: 10px; align-items: center; }
.pill { font-size: 12.5px; padding: 4px 10px; background: #eef7f1; color: #1f6b43; } .pill.late { background: #fbf2e1; color: #8a5a07; } .pill.bad { background: #fdecef; color: var(--c-danger); } .pill.closed { background: var(--c-paper-2); color: var(--c-muted); }
.card { margin: 0; } .strip { display: grid; grid-template-columns: 1.4fr repeat(5, minmax(0, 1fr)); padding: 0; } .strip > div { padding: 14px 16px; border-left: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; min-width: 0; } .strip > div:first-child { border-left: 0; background: #f6f8fb; }
.strip em { font-style: normal; font-size: 12px; color: var(--c-muted); } .strip b { font-size: 19px; font-weight: 600; color: var(--c-navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .strip .s0 b { font-size: 24px; } .strip small { font-size: 12px; color: var(--c-muted); } .strip .late b { color: var(--c-danger); }
.bar { display: block; height: 5px; background: var(--c-paper-2); margin: 4px 0 3px; } .bar s { display: block; height: 100%; background: var(--c-ok); }
.grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; align-items: start; } .col { display: flex; flex-direction: column; gap: 14px; }
.pad0 { padding: 0; } .pad { padding: 12px 18px; } .ch { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--c-rule); } .ch h2, h2 { font-size: 16px; margin: 0; } .card > h2 { margin-bottom: 12px; }
.scroll { max-height: 420px; overflow: auto; } .table { width: 100%; border-collapse: separate; border-spacing: 0; } .table.sm td, .table.sm th { padding: 8px 14px; font-size: 13px; }
th { text-align: left; font-size: 12px; color: var(--c-muted); font-weight: 500; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; } td { border-bottom: 1px solid var(--c-rule); } .num { text-align: right; white-space: nowrap; }
tr[data-s="paid"] td { color: var(--c-muted); } tr[data-s="overdue"] td, tr[data-s="partial"] .rs { color: var(--c-danger); } .rs { font-size: 12px; font-weight: 500; }
.rr { display: flex; justify-content: space-between; gap: 10px; padding: 10px 18px; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .rr:first-of-type { border-top: 0; } .rr em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .rr > b { white-space: nowrap; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .kv span { color: var(--c-muted); } .kv b { font-weight: 500; text-align: right; }
.frm { display: flex; flex-direction: column; gap: 10px; } .frm label, .frm2 label { display: flex; flex-direction: column; gap: 6px; } .frm .btn { align-self: flex-start; }
.frm2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .full, .frm2 .hint { grid-column: 1 / -1; }
.frm4 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 14px; align-items: end; } .frm4 label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.cov { padding: 12px 18px; border-top: 1px solid var(--c-rule); } .cov.off { opacity: .55; } .covh { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; } .covh b { color: var(--c-navy); font-weight: 500; } .covh span { font-size: 12.5px; color: var(--c-muted); text-transform: capitalize; }
.covf { display: grid; grid-template-columns: 120px 1fr 1fr auto; gap: 8px; margin-top: 8px; } .checks { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12.5px; } .checks li[data-r="breached"] b { color: var(--c-danger); } .checks li[data-r="met"] b { color: var(--c-ok); }
.btn.sm { padding: 6px 12px; font-size: 13px; } .red { color: var(--c-danger) !important; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.crd h2 { margin: 0 0 4px; } .crd .mut { margin: 0 0 12px; }
@media (max-width: 1100px) { .strip { grid-template-columns: 1fr 1fr; } .strip > div:nth-child(odd) { border-left: 0; } .grid, .frm4, .covf, .frm2 { grid-template-columns: 1fr; } }
</style>
