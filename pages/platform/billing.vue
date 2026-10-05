<script setup lang="ts">
useHead({ title: 'Finvry · Billing' })
interface Sub { id: string; organization_id: string; customer: string; plan: string; plan_code: string; billing: string; method: string; currency: string; amount_usd: string; monthly: string; status: string; start_date: string; ended_at: string | null; end_reason: string | null; renews: string | null }
interface Inv { id: string; number: string; organization_id: string; customer: string; issue_date: string; due_date: string; amount: string; currency: string; status: string; paid_at: string | null; overdue: boolean }
const route = useRoute()
const { data, refresh } = await useFetch<{ subscriptions: Sub[]; invoices: Inv[]; cards: { organization_id: string; provider: string; brand: string | null; last4: string | null }[]; providers: { stripe: boolean; paystack: boolean }; kpis: { mrr: number; arr: number; live: number; outstanding: number; overdue: number; overdueCount: number } }>('/api/platform/billing')
const { data: orgs } = await useFetch<{ id: string; name: string; plan_code: string; status: string }[]>('/api/platform/orgs')
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean; price_monthly: string | null; price_annual: string | null }[] }>('/api/platform/plans')
const { data: settings } = await useFetch<{ payment_terms_days: number }>('/api/platform/settings')
const org = ref(String(route.query.org ?? ''))
const tab = ref<'subs' | 'inv'>(route.query.tab === 'inv' ? 'inv' : 'subs')
const showEnded = ref(false)
const subs = computed(() => (data.value?.subscriptions ?? []).filter((s) => (!org.value || s.organization_id === org.value) && (showEnded.value || s.status !== 'ended')))
const invs = computed(() => (data.value?.invoices ?? []).filter((i) => !org.value || i.organization_id === org.value))
const customers = computed(() => (orgs.value ?? []).filter((o) => o.plan_code !== 'internal'))
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }

const form = ref<'' | 'sub' | 'inv'>('')
const sf = reactive({ organization_id: '', plan_code: 'company_startup', billing: 'monthly', method: 'invoice', currency: 'USD', amount_usd: '' as string | number, start_date: today(), notes: '' })
const cardOf = (orgId: string) => data.value?.cards.find((c) => c.organization_id === orgId)
const cur = (v: number | string, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(Number(v))
watch(() => [sf.plan_code, sf.billing, sf.currency], () => { const p = plans.value?.plans.find((x) => x.code === sf.plan_code); if (p && sf.currency === 'USD') sf.amount_usd = (sf.billing === 'annual' ? p.price_annual : p.price_monthly) ?? '' })
watch(() => sf.method, (m) => { if (m === 'stripe') sf.currency = 'USD' })
function newSub() { sf.organization_id = org.value; const o = customers.value.find((c) => c.id === org.value); if (o) sf.plan_code = o.plan_code; form.value = 'sub' }
const saveSub = () => run(async () => { await $fetch('/api/platform/subscriptions', { method: 'POST', body: sf }); form.value = '' }, 'Subscription saved; the workspace is on the plan and active.')
const endSub = (s: Sub) => run(async () => {
  const reason = prompt('End ' + s.customer + "'s subscription. Type cancelled or churned:", 'cancelled')
  if (reason !== 'cancelled' && reason !== 'churned') throw new Error('cancel')
  await $fetch('/api/platform/subscriptions/' + s.id + '/end', { method: 'POST', body: { end_date: today(), reason } })
}, 'Subscription ended. Change the workspace status on the customer page if access should stop.').catch(() => {})

const inf = reactive({ currency: 'USD', organization_id: '', subscription_id: '', issue_date: today(), due_date: today(), period_start: '', period_end: '', lines: [{ description: '', quantity: 1, unit_amount: '' as string | number }], bill_to: { name: '', email: '', address: '' }, send: true })
async function newInv(s?: Sub) {
  const oid = s?.organization_id ?? org.value
  const sub = s ?? (data.value?.subscriptions ?? []).find((x) => x.organization_id === oid && x.status !== 'ended')
  const d = today(), terms = settings.value?.payment_terms_days ?? 14
  Object.assign(inf, { currency: sub?.currency ?? 'USD', organization_id: oid, subscription_id: sub?.id ?? '', issue_date: d, due_date: addDays(d, terms), period_start: sub ? (sub.renews && sub.renews > d ? d : d) : '', period_end: sub ? addDays(d, sub.billing === 'annual' ? 364 : 30) : '', send: true,
    lines: [{ description: sub ? 'Finvry ' + sub.plan + ' plan (' + (sub.billing === 'annual' ? 'annual' : 'monthly') + ')' : '', quantity: 1, unit_amount: sub?.amount_usd ?? '' }], bill_to: { name: '', email: '', address: '' } })
  if (oid) { const det = await $fetch<{ admins: { name: string; email: string }[] }>('/api/platform/orgs/' + oid); const a = det.admins[0]; if (a) Object.assign(inf.bill_to, { name: a.name, email: a.email }) }
  form.value = 'inv'
}
watch(() => inf.organization_id, (v, old) => { if (old !== undefined && v && form.value === 'inv' && v !== old) newInv((data.value?.subscriptions ?? []).find((x) => x.organization_id === v && x.status !== 'ended') ?? undefined) })
const total = computed(() => inf.lines.reduce((t, l) => t + Number(l.quantity || 0) * Number(l.unit_amount || 0), 0))
const saveInv = () => run(async () => { const r = await $fetch<{ number: string; emailed: boolean }>('/api/platform/invoices', { method: 'POST', body: inf }); form.value = ''; tab.value = 'inv'; ok.value = r.number + (inf.send ? (r.emailed ? ' created and emailed.' : ' created; the email did not send.') : ' saved as a draft.') }, '')
const act = (i: Inv, action: 'send' | 'mark_paid' | 'void') => run(async () => {
  if (action === 'void' && !confirm('Void invoice ' + i.number + '?')) throw new Error('cancel')
  await $fetch('/api/platform/invoices/' + i.id + '/action', { method: 'POST', body: { action } })
}, action === 'send' ? 'Invoice emailed.' : action === 'mark_paid' ? 'Marked paid.' : 'Invoice voided.').catch(() => {})
const usd = (v: number | string) => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
async function copyLink(i: Inv) {
  msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ url: string; providers: string[] }>('/api/platform/invoices/' + i.id + '/link'); await navigator.clipboard.writeText(r.url); ok.value = 'Pay link for ' + i.number + ' copied' + (r.providers.length ? '.' : '. No payment provider is switched on for ' + i.currency + ' yet.') }
  catch (e) { msg.value = err(e) }
}
const charge = (i: Inv) => run(async () => { if (!confirm('Charge the saved card ' + cur(i.amount, i.currency) + ' for ' + i.number + '?')) throw new Error('cancel'); await $fetch('/api/platform/invoices/' + i.id + '/charge', { method: 'POST' }) }, 'Card charged; the invoice is paid.').catch(() => {})
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Billing</h1><div class="tools"><button class="btn secondary" type="button" @click="newSub">New subscription</button><button class="btn" type="button" @click="newInv()">New invoice</button></div></div>
    <div class="kpis">
      <div class="kpi"><span class="label">MRR</span><b>{{ usd(data.kpis.mrr) }}</b><span class="sub">{{ data.kpis.live }} live subscriptions</span></div>
      <div class="kpi"><span class="label">ARR</span><b>{{ usd(data.kpis.arr) }}</b></div>
      <div class="kpi"><span class="label">Outstanding</span><b>{{ usd(data.kpis.outstanding) }}</b><span class="sub">sent, not yet paid</span></div>
      <div class="kpi"><span class="label">Overdue</span><b :class="{ red: data.kpis.overdue }">{{ usd(data.kpis.overdue) }}</b><span class="sub">{{ data.kpis.overdueCount }} invoice{{ data.kpis.overdueCount === 1 ? '' : 's' }}</span></div>
    </div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>

    <form v-if="form === 'sub'" class="card frm" @submit.prevent="saveSub">
      <h2 class="wide">Start or change a subscription</h2>
      <label class="label">Customer<select v-model="sf.organization_id" required><option value="" disabled>Choose</option><option v-for="o in customers" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
      <label class="label">Plan<select v-model="sf.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.active && x.code !== 'internal')" :key="p.code" :value="p.code">{{ p.name }}</option></select></label>
      <label class="label">Billing<select v-model="sf.billing"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
      <label class="label">Price per {{ sf.billing === 'annual' ? 'year' : 'month' }} ({{ sf.currency }})<input v-model="sf.amount_usd" inputmode="decimal" required></label>
      <label class="label">Paid by<select v-model="sf.method"><option value="invoice">Invoice (bank transfer or pay link)</option><option value="stripe">Card, renewed automatically (Stripe)</option><option value="paystack">Card, renewed automatically (Paystack)</option></select></label>
      <label class="label">Currency<select v-model="sf.currency" :disabled="sf.method === 'stripe'"><option value="USD">USD</option><option value="NGN">NGN</option></select></label>
      <label class="label">Starts<input v-model="sf.start_date" type="date" required></label>
      <label class="label wide">Notes<input v-model="sf.notes" maxlength="2000" placeholder="Discount, contract reference"></label>
      <p class="hint wide">If the customer already has a subscription, it ends on this start date and this one replaces it. The workspace moves to the plan, and a trial becomes active. Card subscriptions are charged automatically on each renewal date once the customer has paid one invoice by card; until then, renewal invoices are emailed with a pay link.</p>
      <div class="wide row"><button class="btn" type="submit" :disabled="busy">Save subscription</button><button class="btn secondary" type="button" @click="form = ''">Cancel</button></div>
    </form>

    <form v-if="form === 'inv'" class="card frm" @submit.prevent="saveInv">
      <h2 class="wide">New invoice</h2>
      <label class="label">Customer<select v-model="inf.organization_id" required><option value="" disabled>Choose</option><option v-for="o in customers" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
      <label class="label">Issue date<input v-model="inf.issue_date" type="date" required></label>
      <label class="label">Due date<input v-model="inf.due_date" type="date" required></label>
      <label class="label">Currency<select v-model="inf.currency"><option value="USD">USD</option><option value="NGN">NGN</option></select></label>
      <label class="label">Bill to (name)<input v-model="inf.bill_to.name" required maxlength="200"></label>
      <label class="label">Bill to (email)<input v-model="inf.bill_to.email" type="email" required maxlength="254"></label>
      <label class="label">Address<input v-model="inf.bill_to.address" maxlength="500"></label>
      <label class="label">Service period from<input v-model="inf.period_start" type="date"></label>
      <label class="label">to<input v-model="inf.period_end" type="date"></label>
      <div class="wide lines">
        <div class="lh"><span>Description</span><span>Qty</span><span>Unit price ({{ inf.currency }})</span><span /></div>
        <div v-for="(l, i) in inf.lines" :key="i" class="lr"><input v-model="l.description" required maxlength="300"><input v-model.number="l.quantity" type="number" min="0" step="any"><input v-model="l.unit_amount" inputmode="decimal" required><button type="button" class="link" :disabled="inf.lines.length === 1" @click="inf.lines.splice(i, 1)">Remove</button></div>
        <div class="lf"><button type="button" class="link" @click="inf.lines.push({ description: '', quantity: 1, unit_amount: '' })">+ Add line</button><b>Total {{ cur(total, inf.currency) }}</b></div>
      </div>
      <label class="chk wide"><input v-model="inf.send" type="checkbox"> Email it to the billing contact now{{ data.providers.stripe || data.providers.paystack ? ', with a link to pay online' : '' }}</label>
      <div class="wide row"><button class="btn" type="submit" :disabled="busy">{{ inf.send ? 'Create and send' : 'Save draft' }}</button><button class="btn secondary" type="button" @click="form = ''">Cancel</button></div>
    </form>

    <div class="bar2">
      <div class="tabs"><button :class="{ on: tab === 'subs' }" @click="tab = 'subs'">Subscriptions</button><button :class="{ on: tab === 'inv' }" @click="tab = 'inv'">Invoices</button></div>
      <select v-model="org" aria-label="Customer"><option value="">All customers</option><option v-for="o in customers" :key="o.id" :value="o.id">{{ o.name }}</option></select>
    </div>

    <template v-if="tab === 'subs'">
      <table class="table">
        <thead><tr><th>Customer</th><th>Plan</th><th class="num">Price</th><th class="num">MRR</th><th>Renews</th><th>Status</th><th /></tr></thead>
        <tbody><tr v-for="s in subs" :key="s.id" :class="{ off: s.status === 'ended' }">
          <td><NuxtLink :to="'/platform/customers/' + s.organization_id" class="co">{{ s.customer }}</NuxtLink><span class="sub">since {{ day(s.start_date) }} · {{ s.method === 'invoice' ? 'invoice' : s.method + ' card' }}<template v-if="cardOf(s.organization_id)"> · {{ cardOf(s.organization_id)!.brand ?? 'card' }} •••• {{ cardOf(s.organization_id)!.last4 }}</template></span></td>
          <td>{{ s.plan }}<span class="sub">{{ s.billing }}</span></td>
          <td class="num">{{ cur(s.amount_usd, s.currency) }}<span class="sub">/ {{ s.billing === 'annual' ? 'year' : 'month' }}</span></td>
          <td class="num"><b>{{ usd(s.monthly) }}</b></td>
          <td>{{ day(s.renews) }}</td>
          <td><span class="st" :data-s="s.status">{{ s.status === 'ended' ? 'Ended' + (s.end_reason ? ' (' + s.end_reason + ')' : '') : s.status === 'past_due' ? 'Past due' : 'Active' }}</span><span v-if="s.ended_at" class="sub">{{ day(s.ended_at) }}</span></td>
          <td class="acts"><template v-if="s.status !== 'ended'"><button type="button" class="link" @click="newInv(s)">Invoice</button><button type="button" class="link" @click="endSub(s)">End</button></template></td>
        </tr></tbody>
      </table>
      <EmptyState v-if="!subs.length" compact icon="customers" :title="`No subscriptions${org ? ' for this customer' : ''} yet`" />
      <label class="chk"><input v-model="showEnded" type="checkbox"> Show ended subscriptions</label>
    </template>

    <template v-else>
      <table class="table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th class="num">Amount</th><th>Status</th><th /></tr></thead>
        <tbody><tr v-for="i in invs" :key="i.id" :class="{ off: i.status === 'void' }">
          <td><a :href="'/invoice/' + i.id" target="_blank" class="co">{{ i.number }}</a></td>
          <td>{{ i.customer }}</td><td>{{ day(i.issue_date) }}</td><td :class="{ red: i.overdue }">{{ day(i.due_date) }}</td>
          <td class="num"><b>{{ cur(i.amount, i.currency) }}</b></td>
          <td><span class="st" :data-s="i.overdue ? 'overdue' : i.status">{{ i.overdue ? 'Overdue' : i.status === 'paid' ? 'Paid ' + day(i.paid_at) : i.status }}</span></td>
          <td class="acts">
            <button v-if="i.status === 'draft' || i.status === 'sent'" type="button" class="link" @click="act(i, 'send')">{{ i.status === 'draft' ? 'Send' : 'Resend' }}</button>
            <button v-if="i.status === 'sent'" type="button" class="link" @click="copyLink(i)">Pay link</button>
            <button v-if="i.status === 'sent' && cardOf(i.organization_id)" type="button" class="link" @click="charge(i)">Charge card</button>
            <button v-if="i.status === 'sent'" type="button" class="link" @click="act(i, 'mark_paid')">Mark paid</button>
            <button v-if="i.status === 'draft' || i.status === 'sent'" type="button" class="link" @click="act(i, 'void')">Void</button>
          </td>
        </tr></tbody>
      </table>
      <EmptyState v-if="!invs.length" compact icon="customers" :title="`No invoices${org ? ' for this customer' : ''} yet`" />
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 16px; } .tools { display: flex; gap: 10px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-weight: 500; letter-spacing: -0.02em; font-size: 26px; color: var(--c-navy); } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; align-items: end; } .frm > label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; } h2 { margin: 0; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; } .row { display: flex; gap: 10px; }
.lines { display: flex; flex-direction: column; gap: 6px; } .lh, .lr { display: grid; grid-template-columns: 1fr 90px 160px 70px; gap: 8px; align-items: center; } .lh { font-size: 11px; letter-spacing: 0; color: var(--c-muted); }
.lf { display: flex; justify-content: space-between; padding-top: 6px; } .lf b { font-weight: 500; color: var(--c-navy); }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); margin-top: 8px; } .chk input { width: auto; }
.bar2 { display: flex; justify-content: space-between; align-items: center; margin: 6px 0 10px; }
.tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 2px; margin-right: 18px; cursor: pointer; color: var(--c-muted); } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 11px 14px; border-bottom: 1px solid var(--c-rule); }
td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } tr.off td { opacity: .55; } .num { text-align: right; } td b { font-weight: 500; }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; }
.st { text-transform: capitalize; font-weight: 500; font-size: 13px; } .st[data-s="active"], .st[data-s="paid"] { color: var(--c-ok); } .st[data-s="past_due"], .st[data-s="overdue"] { color: var(--c-danger); } .st[data-s="sent"] { color: var(--c-blue-deep); } .st[data-s="draft"], .st[data-s="void"], .st[data-s="ended"] { color: var(--c-muted); }
.acts { white-space: nowrap; } .acts .link { margin-left: 10px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.red { color: var(--c-danger) !important; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .frm { grid-template-columns: 1fr; } }
</style>
