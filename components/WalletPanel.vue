<script setup lang="ts">
import { localCardCountry, LOCAL_CARD_NOTE } from '~/shared/countries'
// Wallet (Settings → Plan & billing, and the Wallet page): the balance, add money in a pop-up, what is coming up, and
// every movement.
defineProps<{ bare?: boolean }>()
interface Bank { bank: string; account_number: string; account_name: string; routing?: string; swift?: string }
interface D { country?: string; transfer: { mode: 'monnify'; account: { bank_name: string; account_number: string; account_name: string; accounts: { bankName: string; accountNumber: string; accountName: string }[] } | null } | { mode: 'manual'; bank: Bank } | null; reference: string; card: { brand: string | null; last4: string | null } | null; subscriptions: { id: string; kind: string; name: string; amount_minor: number; currency: string; interval: string; next_charge_at: string; status: string; failures: number; last_error: string | null }[]; company: string; plan: string; currency: string; balance_minor: number; min_minor: number; ledger: { id: string; reference?: string | null; kind: string; amount_minor: number; balance_after_minor: number; category: string; reason: string; date: string }[]; pending: number; canTopup: boolean; provider: string }
const route = useRoute()
const { data, refresh } = await useFetch<D>('/api/wallet', { query: { ref: route.query.ref ?? '' } })
const tab = ref<'transfer' | 'card'>('card')
watchEffect(() => { if (data.value?.transfer && !route.query.ref && !route.query.paid) tab.value = 'transfer' })
const acct = computed(() => { const x = data.value?.transfer; return x && x.mode === 'monnify' ? x.account : null })
const bank = computed(() => { const x = data.value?.transfer; return x && x.mode === 'manual' ? x.bank : null })
const kyc = ref(''); const kycType = ref<'bvn' | 'nin'>('bvn'); const notice = reactive({ open: false, amount: '' as string | number, sent_on: new Date().toISOString().slice(0, 10), note: '', done: false })
const copied = ref(''); async function copy(v: string) { await navigator.clipboard.writeText(v); copied.value = v; setTimeout(() => (copied.value = ''), 1500) }
async function makeAccount() { busy.value = true; msg.value = ''; try { await $fetch('/api/wallet/account', { method: 'POST', body: { kyc: kyc.value, type: kycType.value } }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the account.' } finally { busy.value = false } }
async function sendNotice() { busy.value = true; msg.value = ''; try { await $fetch('/api/wallet/transfer-notice', { method: 'POST', body: notice }); notice.done = true } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { busy.value = false } }
async function removeCard() { if (!await askConfirm('Remove the saved card? Renewals will then come from your wallet only.')) return; try { await $fetch('/api/wallet/card', { method: 'DELETE' }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not remove the card.' } }
const PLAN: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_medium: 'Medium', company_scale: 'Scale', internal: 'Internal' }
const sym = computed(() => (data.value?.currency === 'NGN' ? '₦' : '$'))
const quick = computed(() => (data.value?.currency === 'NGN' ? [10000, 25000, 50000, 100000] : [25, 50, 100, 250]))
const amount = ref<number | null>(null)
watchEffect(() => { if (data.value && amount.value === null) amount.value = quick.value[1]! })
const below = computed(() => !!data.value && (amount.value ?? 0) * 100 < data.value.min_minor)
const msg = ref(''); const busy = ref(false)
const returned = computed(() => !!route.query.ref || !!route.query.paid)
async function topup() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ url: string }>('/api/wallet/topup', { method: 'POST', body: { amount: amount.value } }); window.location.href = r.url } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not start the top-up.'; busy.value = false } }
onMounted(() => { if (returned.value && data.value?.pending) setTimeout(() => refresh(), 4000) })
const rows = computed(() => (data.value?.ledger ?? []).map((l) => ({ date: l.date, description: l.reason, reference: null, amount: (l.kind === 'credit' ? 1 : -1) * l.amount_minor / 100, balance: l.balance_after_minor / 100 })))
const lastMove = computed(() => { const l = data.value?.ledger[0]; return l ? 'Last movement ' + new Date(l.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'No movements yet' })
const invoicePays = computed(() => (data.value?.ledger ?? []).filter((l) => l.kind === 'debit' && (l.reference ?? '').startsWith('invoice:')).slice(0, 8))
const LABEL: Record<string, string> = { topup: 'Top-ups', admin_credit: 'Credits from Finvry', refund: 'Refunds', service: 'Services', subscription: 'Subscription', admin_debit: 'Adjustments' }
const byCat = computed(() => { const m = new Map<string, number>(); for (const l of data.value?.ledger ?? []) if (l.kind === 'debit') m.set(l.category, (m.get(l.category) ?? 0) + l.amount_minor / 100); return [...m.entries()].map(([k, v]) => ({ label: LABEL[k] ?? k, value: v })) })
// At a glance: the next renewal, what renews in the next 90 days, and whether the balance covers it.
const subsActive = computed(() => (data.value?.subscriptions ?? []).filter((x) => x.status === 'active').sort((a, b) => a.next_charge_at.localeCompare(b.next_charge_at)))
const nextSub = computed(() => subsActive.value[0] ?? null)
const soon90 = computed(() => { const lim = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10); return subsActive.value.filter((x) => x.next_charge_at <= lim).reduce((t, x) => t + x.amount_minor, 0) })
const yearly = computed(() => subsActive.value.reduce((t, x) => t + (x.interval === 'month' ? x.amount_minor * 12 : x.amount_minor), 0))
const fmtM = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.currency ?? 'USD', maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100)
const dLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const short = computed(() => (nextSub.value && data.value ? Math.max(0, nextSub.value.amount_minor - data.value.balance_minor) : 0))

// Add money opens in a pop-up (bank transfer or card); a card top-up return opens nothing.
const addOpen = ref(false)
function openAdd(t: 'transfer' | 'card') { tab.value = data.value?.transfer ? t : 'card'; addOpen.value = true }
// The balance, split into whole units and cents.
const parts = computed(() => { const v = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.currency ?? 'USD', minimumFractionDigits: 2 }).format((data.value?.balance_minor ?? 0) / 100); const i = v.lastIndexOf('.'); return i > 0 ? [v.slice(0, i), v.slice(i)] : [v, ''] })
// The last 90 days: added, spent, and the balance as a line (a step for each movement).
const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
const recent = computed(() => (data.value?.ledger ?? []).filter((l) => l.date >= since))
const added = computed(() => recent.value.filter((l) => l.kind === 'credit').reduce((t, l) => t + l.amount_minor, 0))
const spent = computed(() => recent.value.filter((l) => l.kind === 'debit').reduce((t, l) => t + l.amount_minor, 0))
const spark = computed(() => {
  const d = data.value; if (!d) return { line: '', area: '' }
  const asc = [...recent.value].reverse(), day = (s: string) => Math.max(0, Math.min(90, (new Date(s + 'T12:00:00Z').getTime() - new Date(since + 'T12:00:00Z').getTime()) / 864e5))
  const start = asc.length ? asc[0]!.balance_after_minor - (asc[0]!.kind === 'credit' ? 1 : -1) * asc[0]!.amount_minor : d.balance_minor
  const pts: [number, number][] = [[0, start]]; for (const l of asc) { const x = day(l.date); pts.push([x, pts[pts.length - 1]![1]], [x, l.balance_after_minor]) } pts.push([90, d.balance_minor])
  const hi = Math.max(1, ...pts.map((p) => p[1])), y = (v: number) => 58 - (v / hi) * 50
  const line = pts.map((p, i) => (i ? 'L' : 'M') + (p[0] / 90 * 600).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ')
  return { line, area: line + ' L600 64 L0 64 Z' }
})
// Coming up: renewals in date order (with whether the balance covers them, in turn) and unpaid invoices.
const days = (s: string) => Math.round((new Date(s + 'T12:00:00Z').getTime() - Date.now()) / 864e5)
const upcoming = computed(() => { let left = data.value?.balance_minor ?? 0; return subsActive.value.map((s) => { const cover = left >= s.amount_minor; left = Math.max(0, left - s.amount_minor); return { ...s, short: cover ? 0 : s.amount_minor - Math.max(0, left), in: days(s.next_charge_at) } }) })
const { canPath } = useModuleAccess()
const { data: inv } = useFetch<{ id: string; number: string; amount: string; currency: string; status: string; due_date: string; summary: string; overdue: boolean }[]>('/api/portal/invoices', { key: 'wallet-invoices', server: false, default: () => [] })
const unpaid = computed(() => (canPath('/client/invoices') ? (inv.value ?? []).filter((i) => i.status === 'sent') : []))
const perYear = computed(() => subsActive.value.reduce((t, x) => t + (x.interval === 'month' ? x.amount_minor * 12 : x.amount_minor), 0))
// Transactions: all, money in or money out, 15 a page.
const flow = ref<'' | 'credit' | 'debit'>(''), page = ref(0)
const moves = computed(() => (data.value?.ledger ?? []).filter((l) => !flow.value || l.kind === flow.value))
watch(flow, () => (page.value = 0))
const CAT: Record<string, string> = { topup: 'Top-up', admin_credit: 'From Finvry', refund: 'Refund', service: 'Service', subscription: 'Subscription', admin_debit: 'Adjustment' }
</script>
<template>
  <section v-if="data" class="wl">
    <div class="top">
      <div><div class="eyb">{{ bare ? 'Finvry wallet' : 'Wallet' }} · {{ data.currency }}</div><div class="big">{{ parts[0] }}<small>{{ parts[1] }}</small></div>
        <p v-if="returned && data.pending" class="pend">Payment received. Your balance updates in a moment.</p></div>
      <div class="btns">
        <button type="button" class="bt p" @click="openAdd('transfer')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>Add money</button>
        <button v-if="data.card" type="button" class="bt" @click="openAdd('card')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" /><path d="M3 10h18" /></svg>{{ data.card.brand ?? 'Card' }} ···· {{ data.card.last4 ?? '' }}</button>
        <a href="/api/wallet/export" class="bt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></svg>Statement</a>
      </div>
    </div>
    <p v-if="localCardCountry(data.country)" class="lcn">{{ LOCAL_CARD_NOTE }}</p>
    <p v-if="msg && !addOpen" class="error">{{ msg }}</p>
    <div class="g2">
      <div class="panel hero">
        <div class="hh"><span>Balance, last 90 days</span><span>Today</span></div>
        <svg class="spark" viewBox="0 0 600 64" preserveAspectRatio="none" aria-hidden="true"><path :d="spark.area" fill="#0c1a2e" opacity=".05" /><path :d="spark.line" fill="none" stroke="#0c1a2e" stroke-width="1.6" vector-effect="non-scaling-stroke" /></svg>
        <div class="trio">
          <div><span>Added</span><b>{{ fmtM(added) }}</b></div><div><span>Spent</span><b>{{ fmtM(spent) }}</b></div>
          <div><span>Next charge</span><b>{{ nextSub ? fmtM(nextSub.amount_minor) : '—' }}<em v-if="nextSub"> · {{ dLong(nextSub.next_charge_at).replace(/ \d{4}$/, '') }}</em></b></div>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><h3>Upcoming</h3><span v-if="perYear" class="m">{{ fmtM(perYear) }} / yr</span></div>
        <div v-for="s in upcoming" :key="s.id" class="rowl"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></span>
          <div class="tx"><b>{{ s.name }}</b><span>{{ dLong(s.next_charge_at) }} · {{ s.in <= 0 ? 'today' : s.in === 1 ? 'tomorrow' : 'in ' + s.in + ' days' }}</span></div>
          <div class="am">{{ fmtM(s.amount_minor) }}<span v-if="s.failures"><i class="dot r" />Payment failed, retrying</span><span v-else-if="s.short"><i class="dot" />{{ data.card ? 'Card covers ' + fmtM(s.short) : 'Short ' + fmtM(s.short) }}</span><span v-else><i class="dot b" />Covered</span></div></div>
        <div v-for="i in unpaid" :key="i.id" class="rowl"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l3 3v15H6z" /></svg></span>
          <div class="tx"><b>{{ i.summary || 'Invoice' }}</b><span>{{ i.overdue ? 'Overdue' : 'Due ' + dLong(i.due_date) }} · {{ i.number }}</span></div>
          <div class="am"><Money :value="i.amount" :currency="i.currency" /><span><i class="dot" :class="{ r: i.overdue }" />Invoice</span></div></div>
        <p v-if="!upcoming.length && !unpaid.length" class="none">Nothing due</p>
        <p v-else class="foot">Paid from the wallet, then your card.</p>
      </div>
    </div>
    <div class="panel">
      <div class="ph"><h3>Transactions</h3><div class="seg"><button v-for="[k, l] in ([['', 'All'], ['credit', 'Money in'], ['debit', 'Money out']] as const)" :key="k" type="button" :class="{ on: flow === k }" @click="flow = k">{{ l }}</button></div></div>
      <table data-nosearch v-if="moves.length"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead>
        <tbody><tr v-for="l in moves.slice(page * 15, page * 15 + 15)" :key="l.id"><td class="mut nw">{{ dLong(l.date) }}</td><td>{{ l.reason }}</td><td class="mut">{{ CAT[l.category] ?? l.category }}</td><td class="r num" :class="{ in: l.kind === 'credit' }">{{ l.kind === 'credit' ? '+' : '−' }}{{ fmtM(l.amount_minor) }}</td><td class="r num mut">{{ fmtM(l.balance_after_minor) }}</td></tr></tbody></table>
      <p v-else class="none">No transactions yet</p>
      <TablePager v-if="moves.length > 15" v-model="page" :total="moves.length" :size="15" />
    </div>
    <AppModal :open="addOpen" title="Add money" @close="addOpen = false">
      <div class="fund">
        <div v-if="data.transfer" class="seg2"><button type="button" :class="{ on: tab === 'transfer' }" @click="tab = 'transfer'">Bank transfer</button><button type="button" :class="{ on: tab === 'card' }" @click="tab = 'card'">Card</button></div>
        <template v-if="data.transfer && tab === 'transfer'">
          <template v-if="data.transfer.mode === 'monnify'">
            <template v-if="acct"><div class="acct"><span>Bank</span><b>{{ acct.bank_name }}</b><span>Account</span><b class="mono">{{ acct.account_number }} <button type="button" class="cp" @click="copy(acct?.account_number ?? '')">{{ copied === acct.account_number ? 'Copied' : 'Copy' }}</button></b><span>Name</span><b>{{ acct.account_name }}</b></div>
              <p class="mut">Credited automatically, usually in minutes.</p>
              <p v-if="acct.accounts.length > 1" class="mut">Also: {{ acct.accounts.slice(1).map((a) => a.bankName + ' ' + a.accountNumber).join(' · ') }}</p></template>
            <template v-else><p class="mut">A BVN or NIN opens an account number for {{ data.company }}.</p>
              <div class="kyc"><select v-model="kycType"><option value="bvn">BVN</option><option value="nin">NIN</option></select><input v-model="kyc" inputmode="numeric" maxlength="11" placeholder="11 digits"></div>
              <button class="btn" type="button" :disabled="busy || kyc.length !== 11" @click="makeAccount">{{ busy ? 'Creating…' : 'Get account number' }}</button></template>
          </template>
          <template v-else-if="bank"><div class="acct"><span>Bank</span><b>{{ bank.bank }}</b><span>Account</span><b class="mono">{{ bank.account_number }} <button type="button" class="cp" @click="copy(bank?.account_number ?? '')">{{ copied === bank.account_number ? 'Copied' : 'Copy' }}</button></b><span>Name</span><b>{{ bank.account_name }}</b>
              <template v-if="bank.routing"><span>Routing</span><b class="mono">{{ bank.routing }}</b></template><template v-if="bank.swift"><span>SWIFT</span><b class="mono">{{ bank.swift }}</b></template>
              <span>Reference</span><b class="mono">{{ data.reference }} <button type="button" class="cp" @click="copy(data.reference)">{{ copied === data.reference ? 'Copied' : 'Copy' }}</button></b></div>
            <p class="mut">Quote the reference. Usually credited the same day.</p>
            <template v-if="!notice.done"><template v-if="notice.open"><label class="label">Amount sent ({{ data.currency }})<input v-model="notice.amount" inputmode="decimal" required></label><label class="label">Date sent<input v-model="notice.sent_on" type="date" required></label><label class="label">Note<input v-model="notice.note" maxlength="500" placeholder="Optional"></label></template></template>
            <p v-else class="okm">Thanks. We'll credit it when it arrives.</p></template>
        </template>
        <template v-else>
          <div class="quick"><button v-for="a in quick" :key="a" type="button" :class="{ on: amount === a }" @click="amount = a">{{ sym }}{{ a.toLocaleString() }}</button></div>
          <label class="label">Amount ({{ data.currency }})<input v-model.number="amount" type="number" :min="data.min_minor / 100" inputmode="decimal"></label>
          <p class="mut" :class="{ red: below }">At least {{ sym }}{{ (data.min_minor / 100).toLocaleString() }}.{{ data.canTopup ? '' : ' Card top-ups are coming soon.' }}</p>
          <p v-if="data.card" class="mut">{{ data.card.brand ?? 'Card' }}{{ data.card.last4 ? ' ···· ' + data.card.last4 : '' }} on file, used when the wallet is short · <button type="button" class="cp" @click="removeCard">Remove</button></p>
        </template>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <template #foot><button class="btn secondary" type="button" @click="addOpen = false">Close</button>
        <template v-if="data.transfer && tab === 'transfer'"><button v-if="bank && !notice.done && !notice.open" class="btn" type="button" @click="notice.open = true">I've sent it</button><button v-else-if="bank && notice.open && !notice.done" class="btn" type="button" :disabled="busy || !notice.amount" @click="sendNotice">Send</button></template>
        <button v-else-if="!(data.transfer && tab === 'transfer')" class="btn" type="button" :disabled="busy || !amount || below || !data.canTopup" @click="topup">{{ busy ? 'Redirecting…' : 'Continue to pay' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.wl { display: flex; flex-direction: column; gap: 18px; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.eyb { font-size: 13px; color: var(--c-muted); margin-bottom: 8px; }
.big { font-size: 44px; font-weight: 500; letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1; color: var(--c-ink); } .big small { font-size: 21px; color: var(--c-muted); font-weight: 500; letter-spacing: 0; }
.pend { font-size: 13px; color: var(--c-blue-deep); margin: 8px 0 0; }
.btns { display: flex; gap: 8px; flex-wrap: wrap; } .bt { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; font: inherit; font-size: 13.5px; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink); cursor: pointer; text-decoration: none; } .bt:hover { border-color: var(--c-ink-soft); } .bt.p { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .bt svg { width: 15px; height: 15px; }
.lcn { background: #f3f8fc; padding: 9px 12px; font-size: 13px; color: var(--c-ink-soft); margin: 0; }
.g2 { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.panel { background: #fff; border: 1px solid var(--c-rule); }
.hero { padding: 20px 22px 16px; display: flex; flex-direction: column; gap: 12px; } .hh { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--c-muted); } .spark { width: 100%; height: 64px; display: block; }
.trio { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--c-rule); padding-top: 12px; } .trio span { font-size: 12.5px; color: var(--c-muted); } .trio b { display: block; font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums; margin-top: 2px; } .trio em { font-style: normal; font-size: 12.5px; color: var(--c-muted); font-weight: 400; }
.ph { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 20px; } .ph h3 { margin: 0; font-size: 15px; font-weight: 600; } .ph .m { font-size: 12.5px; color: var(--c-muted); }
.rowl { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--c-rule); font-size: 14px; } .ic { width: 32px; height: 32px; background: var(--c-paper-2); display: grid; place-items: center; color: var(--c-ink-soft); flex: none; } .ic svg { width: 15px; height: 15px; }
.tx { flex: 1; min-width: 0; } .tx b { font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tx span { font-size: 12.5px; color: var(--c-muted); } .am { text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; } .am span { display: block; font-size: 12px; color: var(--c-muted); font-weight: 400; white-space: nowrap; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #b4541a; margin-right: 6px; vertical-align: 1px; } .dot.b { background: #5fa8d3; } .dot.r { background: var(--c-danger); }
.none { padding: 18px 20px; border-top: 1px solid var(--c-rule); color: var(--c-muted); font-size: 13px; margin: 0; text-align: center; } .foot { padding: 10px 20px 14px; margin: 0; font-size: 12.5px; color: var(--c-muted); border-top: 1px solid var(--c-rule); }
.seg { display: inline-flex; gap: 4px; } .seg button { background: none; border: 0; padding: 5px 11px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--c-muted); padding: 10px 20px; border-top: 1px solid var(--c-rule); } td { padding: 12px 20px; border-top: 1px solid var(--c-rule); } .r { text-align: right; } .num { font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); } .nw { white-space: nowrap; } td.in { color: var(--c-blue-deep); }
.fund { display: flex; flex-direction: column; gap: 12px; } .fund .mut { font-size: 12.5px; margin: 0; } .red { color: var(--c-danger) !important; }
.seg2 { display: flex; border: 1px solid var(--c-rule-strong); } .seg2 button { flex: 1; background: #fff; border: 0; padding: 8px; font: inherit; font-size: 13.5px; cursor: pointer; } .seg2 button.on { background: var(--c-navy); color: #fff; }
.acct { display: grid; grid-template-columns: 110px 1fr; gap: 8px 10px; background: var(--c-paper-2); padding: 12px 14px; font-size: 14px; } .acct span { color: var(--c-muted); } .acct b { font-weight: 500; } .mono { font-family: ui-monospace, Menlo, monospace; }
.cp { background: none; border: 0; padding: 0 0 0 6px; font: inherit; font-size: 12px; color: var(--c-blue-deep); cursor: pointer; }
.quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .quick button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 9px 4px; font: inherit; font-weight: 500; cursor: pointer; } .quick button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); } .kyc { display: flex; gap: 8px; } .kyc input { flex: 1; } .okm { color: var(--c-ok); font-size: 13px; margin: 0; } .error { color: var(--c-danger); font-size: 13px; margin: 0; }
@media (max-width: 900px) { .g2 { grid-template-columns: 1fr; } .big { font-size: 36px; } th:nth-child(3), td:nth-child(3), th:nth-child(5), td:nth-child(5) { display: none; } }
</style>
