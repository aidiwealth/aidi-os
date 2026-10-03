<script setup lang="ts">
const id = useRoute().params.id as string
interface Row { seq: number; due_date: string; principal_due: number; interest_due: number; paid: number; status: string }
interface Pos { outstandingPrincipal: number; principalReceived: number; interestReceived: number; arrears: number; dpd: number; bucket: string; next: { due_date: string; amount: number } | null; rows: Row[] }
interface Rep { id: string; received_on: string; amount: string; note: string | null; by_name: string | null; allocation: { interest: number; principal: number; excess: number } | null }
interface Check { due_date: string; checked_on: string; result: string; note: string | null; document_id: string | null; document_title: string | null }
interface Cov { id: string; title: string; kind: string; threshold: string | null; frequency: string; next_due: string; active: boolean; days_left: number; checks: Check[] | null }
const { data, error, refresh } = await useFetch<{ loan: Record<string, string>; position: Pos; repayments: Rep[]; covenants: Cov[] }>('/api/credit/loans/' + id)
const { data: docs } = await useFetch<{ id: string; title: string }[]>('/api/documents')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
useHead({ title: () => (data.value?.loan.borrower ?? 'Loan') + ' — Credit' })
const cur = computed(() => data.value?.loan.currency ?? 'USD')
const money = (v: number | string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur.value }).format(Number(v))
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
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/credit" class="back">← Credit</NuxtLink>
    <p class="label">{{ data.loan.lender ?? '—' }}<template v-if="data.loan.reference"> · {{ data.loan.reference }}</template> · {{ data.loan.status.replace('_', ' ') }}</p>
    <div class="dh"><h1>{{ data.loan.borrower }}</h1><DeleteButton type="loan" :id="id" :name="'the loan to ' + data.loan.borrower" to="/credit" /></div>
    <p class="terms">{{ money(data.loan.principal) }} at {{ Number(data.loan.annual_rate) }}% · {{ data.loan.tenor_months }} months · {{ RT[data.loan.repayment_type] }}, {{ data.loan.frequency }} · disbursed {{ day(data.loan.disbursed_on) }}<template v-if="data.loan.security"> · security: {{ data.loan.security }}</template></p>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <div class="kpis">
      <div class="kpi"><span class="label">Outstanding principal</span><b>{{ money(data.position.outstandingPrincipal) }}</b><span class="sub">{{ money(data.position.principalReceived) }} repaid</span></div>
      <div class="kpi" :data-b="data.position.bucket"><span class="label">Arrears</span><b>{{ money(data.position.arrears) }}</b><span class="sub">{{ data.position.dpd ? data.position.dpd + ' days past due' : 'Up to date' }}</span></div>
      <div class="kpi"><span class="label">Next payment</span><b>{{ data.position.next ? money(data.position.next.amount) : '—' }}</b><span class="sub">{{ data.position.next ? 'due ' + day(data.position.next.due_date) : 'No more scheduled' }}</span></div>
      <div class="kpi"><span class="label">Interest received</span><b>{{ money(data.position.interestReceived) }}</b><span class="sub">to date</span></div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Repayment schedule</h2>
        <div class="scroll"><table class="table sm">
          <thead><tr><th>#</th><th>Due</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Paid</th><th /></tr></thead>
          <tbody><tr v-for="r in data.position.rows" :key="r.seq" :data-s="r.status">
            <td>{{ r.seq }}</td><td>{{ day(r.due_date) }}</td><td class="num">{{ money(r.principal_due) }}</td><td class="num">{{ money(r.interest_due) }}</td><td class="num">{{ r.paid ? money(r.paid) : '' }}</td><td class="rs">{{ RS[r.status] }}</td>
          </tr></tbody>
        </table></div>
      </div>
      <div class="col">
        <form v-if="data.loan.status === 'active'" class="card frm" @submit.prevent="addRepayment">
          <h2>Record a repayment</h2>
          <label class="label">Received on<input v-model="rp.received_on" type="date" required></label>
          <label class="label">Amount ({{ cur }})<input v-model="rp.amount" inputmode="decimal" required></label>
          <label class="label">Note<input v-model="rp.note" maxlength="1000" placeholder="bank reference"></label>
          <button class="btn" type="submit" :disabled="busy">Record</button>
          <p class="hint">Applied to the oldest instalment first, interest before principal. Anything beyond the schedule counts as early repayment of principal.</p>
        </form>
        <div class="card">
          <h2>Repayments</h2>
          <ul class="list"><li v-for="r in data.repayments" :key="r.id"><span>{{ day(r.received_on) }}<em>{{ r.allocation ? 'interest ' + money(r.allocation.interest) + ' · principal ' + money(r.allocation.principal + r.allocation.excess) : '' }}<template v-if="r.note"> · {{ r.note }}</template></em></span><b>{{ money(r.amount) }}</b></li></ul>
          <p v-if="!data.repayments.length" class="muted">None yet.</p>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row"><h2>Covenants</h2><button class="btn secondary sm" type="button" @click="covOpen = !covOpen">{{ covOpen ? 'Close' : 'Add covenant' }}</button></div>
      <form v-if="covOpen" class="frm4" @submit.prevent="addCov">
        <label class="label">Covenant<input v-model="cf.title" required maxlength="200" placeholder="e.g. Debt service cover ratio"></label>
        <label class="label">Type<select v-model="cf.kind"><option value="financial">Financial</option><option value="reporting">Reporting</option><option value="other">Other</option></select></label>
        <label class="label">Threshold<input v-model="cf.threshold" maxlength="300" placeholder="e.g. ≥ 1.25x"></label>
        <label class="label">Tested<select v-model="cf.frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option><option value="once">Once</option></select></label>
        <label class="label">Next test<input v-model="cf.next_due" type="date" required></label>
        <button class="btn" type="submit" :disabled="busy">Add</button>
      </form>
      <div v-for="c in data.covenants" :key="c.id" class="cov" :class="{ off: !c.active }">
        <div class="covh"><b>{{ c.title }}</b><span>{{ c.kind }}<template v-if="c.threshold"> · {{ c.threshold }}</template> · {{ c.frequency }}</span>
          <span v-if="c.active" :class="{ red: c.days_left < 0 }">next test {{ day(c.next_due) }}{{ c.days_left < 0 ? ' (overdue)' : '' }}</span></div>
        <form v-if="c.active" class="covf" @submit.prevent="check(c.id)">
          <select v-model="ck(c.id).result" aria-label="Result"><option value="met">Met</option><option value="breached">Breached</option><option value="waived">Waived</option></select>
          <input v-model="ck(c.id).note" maxlength="2000" placeholder="Note (required for breach or waiver)">
          <select v-model="ck(c.id).document_id" aria-label="Evidence"><option value="">No evidence</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select>
          <button class="btn sm" type="submit" :disabled="busy">Record test</button>
        </form>
        <ul v-if="c.checks?.length" class="checks"><li v-for="(k, i) in c.checks" :key="i" :data-r="k.result">{{ day(k.due_date) }}: <b>{{ k.result }}</b><template v-if="k.note"> · {{ k.note }}</template><template v-if="k.document_title"> · {{ k.document_title }}</template></li></ul>
      </div>
      <p v-if="!data.covenants.length" class="muted">No covenants recorded.</p>
    </div>

    <form v-if="isGp" class="card frm4" @submit.prevent="setStatus">
      <h2 class="full">Loan status (GPs)</h2>
      <label class="label">Status<select v-model="st.status"><option value="active">Active</option><option value="repaid">Repaid</option><option value="written_off">Written off</option><option value="restructured">Restructured</option></select></label>
      <label class="label span2">Note<input v-model="st.note" required minlength="3" maxlength="1000"></label>
      <button class="btn secondary" type="submit" :disabled="busy">Update status</button>
    </form>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Loan not found.' : 'Could not load this loan.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.label { } h1 { margin-bottom: 4px; } h2 { margin-bottom: 12px; } .terms { color: var(--c-muted); margin: 0 0 16px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-weight: 500; letter-spacing: -0.02em; font-size: 26px; color: var(--c-navy); }
.kpi[data-b="1-30"] b { color: var(--c-warn); } .kpi[data-b="31-90"] b, .kpi[data-b="90+"] b { color: var(--c-danger); }
.grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; margin-bottom: 16px; } .col { display: flex; flex-direction: column; gap: 16px; }
.card { margin-bottom: 0; } section > .card { margin-bottom: 16px; }
.scroll { max-height: 460px; overflow: auto; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; } .table.sm td, .table.sm th { padding: 7px 10px; font-size: 13px; }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; }
td { border-bottom: 1px solid var(--c-rule); } .num { text-align: right; white-space: nowrap; }
tr[data-s="paid"] td { color: var(--c-muted); } tr[data-s="overdue"] td, tr[data-s="partial"] .rs { color: var(--c-danger); } .rs { font-size: 12px; font-weight: 500; }
.frm { display: flex; flex-direction: column; gap: 10px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .frm .btn { align-self: flex-start; }
.frm4 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 14px; align-items: end; margin-bottom: 14px; } .frm4 label { display: flex; flex-direction: column; gap: 6px; } .full { grid-column: 1 / -1; } .span2 { grid-column: span 2; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; }
.list { list-style: none; padding: 0; margin: 0; } .list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
.list em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .list b { font-weight: 500; white-space: nowrap; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.cov { padding: 12px 0; border-top: 1px solid var(--c-rule); } .cov.off { opacity: .55; }
.covh { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; } .covh b { color: var(--c-navy); font-weight: 500; } .covh span { font-size: 12.5px; color: var(--c-muted); text-transform: capitalize; }
.covf { display: grid; grid-template-columns: 120px 1fr 1fr auto; gap: 8px; margin-top: 8px; }
.checks { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12.5px; } .checks li { padding: 2px 0; } .checks li[data-r="breached"] b { color: var(--c-danger); } .checks li[data-r="met"] b { color: var(--c-ok); }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.red { color: var(--c-danger) !important; } .muted { color: var(--c-muted); } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .grid, .frm4, .covf { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
</style>
