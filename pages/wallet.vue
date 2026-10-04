<script setup lang="ts">
// Wallet: balance card, card top-up, money movement by month, transactions with export.
useHead({ title: 'Wallet' })
interface Bank { bank: string; account_number: string; account_name: string; routing?: string; swift?: string }
interface D { transfer: { mode: 'monnify'; account: { bank_name: string; account_number: string; account_name: string; accounts: { bankName: string; accountNumber: string; accountName: string }[] } | null } | { mode: 'manual'; bank: Bank } | null; reference: string; card: { brand: string | null; last4: string | null } | null; subscriptions: { id: string; kind: string; name: string; amount_minor: number; currency: string; interval: string; next_charge_at: string; status: string; failures: number; last_error: string | null }[]; company: string; plan: string; currency: string; balance_minor: number; min_minor: number; ledger: { id: string; kind: string; amount_minor: number; balance_after_minor: number; category: string; reason: string; date: string }[]; pending: number; canTopup: boolean; provider: string }
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
async function removeCard() { if (!confirm('Remove the saved card? Renewals will then come from your wallet only.')) return; try { await $fetch('/api/wallet/card', { method: 'DELETE' }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not remove the card.' } }
const PLAN: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_scale: 'Scale', internal: 'Internal' }
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
const LABEL: Record<string, string> = { topup: 'Top-ups', admin_credit: 'Credits from Finvry', refund: 'Refunds', service: 'Services', subscription: 'Subscription', admin_debit: 'Adjustments' }
const byCat = computed(() => { const m = new Map<string, number>(); for (const l of data.value?.ledger ?? []) if (l.kind === 'debit') m.set(l.category, (m.get(l.category) ?? 0) + l.amount_minor / 100); return [...m.entries()].map(([k, v]) => ({ label: LABEL[k] ?? k, value: v })) })
</script>
<template>
  <section v-if="data">
    <p class="label">Company</p><h1>Wallet</h1>
    <p class="lead">Top up once and pay for Aidi services, filings and renewals from your balance. Every movement is listed below.</p>
    <p v-if="returned && data.pending" class="card note">Payment received; we're confirming it with {{ data.provider }}. Your balance updates in a moment.</p>
    <div class="top">
      <WalletCard title="Finvry" label="Available balance" :value="data.balance_minor / 100" :currency="data.currency" :sub="lastMove" foot-label="Workspace" :foot-value="data.company" :tag="PLAN[data.plan] ?? data.plan" />
      <div class="card fund">
        <h3>Add money</h3>
        <div v-if="data.transfer" class="tabs2"><button type="button" :class="{ on: tab === 'transfer' }" @click="tab = 'transfer'">Bank transfer</button><button type="button" :class="{ on: tab === 'card' }" @click="tab = 'card'">Card</button></div>
        <template v-if="data.transfer && tab === 'transfer'">
          <template v-if="data.transfer.mode === 'monnify'">
            <template v-if="acct"><p class="mut">Transfer to this account from any Nigerian bank and your wallet is credited automatically, usually within minutes.</p>
              <div class="acct"><span>Bank</span><b>{{ acct.bank_name }}</b><span>Account number</span><b class="mono">{{ acct.account_number }} <button type="button" class="cp" @click="copy(acct?.account_number ?? '')">{{ copied === acct.account_number ? 'Copied' : 'Copy' }}</button></b><span>Account name</span><b>{{ acct.account_name }}</b></div>
              <p v-if="acct.accounts.length > 1" class="mut">Also: {{ acct.accounts.slice(1).map((a) => a.bankName + ' ' + a.accountNumber).join(' · ') }}</p></template>
            <template v-else><p class="mut">Get a dedicated account number for {{ data.company }}. Bank rules require a BVN or NIN; it is sent to our bank partner only to open the account.</p>
              <div class="kyc"><select v-model="kycType"><option value="bvn">BVN</option><option value="nin">NIN</option></select><input v-model="kyc" inputmode="numeric" maxlength="11" placeholder="11 digits"></div>
              <button class="btn" type="button" :disabled="busy || kyc.length !== 11" @click="makeAccount">{{ busy ? 'Creating account…' : 'Generate account number' }}</button></template>
          </template>
          <template v-else-if="bank"><p class="mut">Transfer to our account, quoting your reference. We credit your wallet when the money arrives (usually the same working day).</p>
            <div class="acct"><span>Bank</span><b>{{ bank.bank }}</b><span>Account number</span><b class="mono">{{ bank.account_number }} <button type="button" class="cp" @click="copy(bank?.account_number ?? '')">{{ copied === bank.account_number ? 'Copied' : 'Copy' }}</button></b><span>Account name</span><b>{{ bank.account_name }}</b>
              <template v-if="bank.routing"><span>Routing</span><b class="mono">{{ bank.routing }}</b></template><template v-if="bank.swift"><span>SWIFT</span><b class="mono">{{ bank.swift }}</b></template>
              <span>Your reference</span><b class="mono">{{ data.reference }} <button type="button" class="cp" @click="copy(data.reference)">{{ copied === data.reference ? 'Copied' : 'Copy' }}</button></b></div>
            <button v-if="!notice.done" class="btn secondary" type="button" @click="notice.open = true">I've sent a transfer</button><p v-else class="okm">Thanks. We'll credit your wallet as soon as it arrives.</p></template>
        </template>
        <template v-else>
        <div class="quick"><button v-for="a in quick" :key="a" type="button" :class="{ on: amount === a }" @click="amount = a">{{ sym }}{{ a.toLocaleString() }}</button></div>
        <label class="label">Amount ({{ data.currency }})<input v-model.number="amount" type="number" :min="data.min_minor / 100" inputmode="decimal"></label>
        <p class="mut" :class="{ red: below }">Smallest top-up is {{ sym }}{{ (data.min_minor / 100).toLocaleString() }}.</p>
        <button class="btn" type="button" :disabled="busy || !amount || below || !data.canTopup" @click="topup">{{ busy ? 'Redirecting…' : 'Continue with ' + data.provider }}</button>
        <p class="mut">{{ data.canTopup ? 'Secured by ' + data.provider + '. Card details never reach us.' : 'Card top-ups are being switched on. Contact support to fund your wallet.' }}</p>
        <p v-if="data.card" class="mut">Card on file: {{ data.card.brand ?? 'Card' }}{{ data.card.last4 ? ' ending ' + data.card.last4 : '' }} · used if your wallet is short at renewal · <button type="button" class="cp" @click="removeCard">Remove</button></p>
        <p v-else class="mut">The card you use is saved for renewals, so nothing stops if your wallet runs low.</p>
        </template>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
    </div>
    <div v-if="data.subscriptions.length" class="card subs"><h3>Renewals</h3><p class="mut">Charged from your wallet on the date shown; if the wallet is short we use your card on file. If both fail we try again after 3 days, then {{ data.subscriptions.some((s) => s.kind === 'plan') ? 'move you to the Free plan or ' : '' }}pause the service, and email you each time.</p>
      <div v-for="s in data.subscriptions" :key="s.id" class="sr"><span><b>{{ s.name }}</b><em> · {{ s.interval === 'month' ? 'monthly' : 'yearly' }}</em></span><span class="mono">{{ (s.currency === 'NGN' ? '₦' : '$') + (s.amount_minor / 100).toLocaleString('en-US') }}</span><span :class="{ red: s.status === 'suspended' || s.failures }">{{ s.status === 'suspended' ? 'Paused · ' + (s.last_error ?? 'payment failed') : s.failures ? 'Retrying ' + s.next_charge_at : 'Next ' + new Date(s.next_charge_at + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }}</span></div></div>
    <AppModal :open="notice.open" title="Tell us about your transfer" @close="notice.open = false">
      <form id="ntf" class="nt" @submit.prevent="sendNotice(); notice.open = false"><label class="label">Amount sent ({{ data.currency }})<input v-model="notice.amount" inputmode="decimal" required></label><label class="label">Date sent<input v-model="notice.sent_on" type="date" required></label><label class="label">Note (optional)<input v-model="notice.note" maxlength="500" placeholder="e.g. sent from Zuri Labs GTBank account"></label></form>
      <template #foot><button class="btn secondary" @click="notice.open = false">Cancel</button><button class="btn" type="submit" form="ntf">Send</button></template>
    </AppModal>
    <MoneyFlow v-if="data.ledger.length" class="flow" :rows="rows" :currency="data.currency" />
    <div v-if="byCat.length" class="card mix"><DonutChart title="Where your wallet went" total-label="Spent" :currency="data.currency" :segments="byCat" /></div>
    <TxnTable :rows="rows" :currency="data.currency" title="Transactions"><template #empty>No transactions yet. Add money to get started.</template></TxnTable>
  </section>
</template>
<style scoped>
.lead { color: var(--c-ink-soft); max-width: 720px; } .note { border-left: 3px solid var(--c-blue-deep); margin-bottom: 14px; }
.top { display: grid; grid-template-columns: minmax(320px, 1.1fr) 1fr; gap: 16px; margin: 16px 0 22px; } .fund { display: flex; flex-direction: column; gap: 10px; } .fund h3 { margin: 0; }
.quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .quick button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 9px 4px; font: inherit; font-weight: 500; cursor: pointer; } .quick button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
label.label { display: flex; flex-direction: column; gap: 6px; } input { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .red { color: var(--c-danger); }
.flow, .mix { margin-bottom: 22px; } .tabs2 { display: flex; border: 1px solid var(--c-rule-strong); } .tabs2 button { flex: 1; background: #fff; border: 0; padding: 8px; font: inherit; font-size: 13.5px; cursor: pointer; } .tabs2 button.on { background: var(--c-navy); color: #fff; }
.acct { display: grid; grid-template-columns: 130px 1fr; gap: 8px 10px; background: var(--c-paper-2); padding: 12px 14px; font-size: 14px; } .acct span { color: var(--c-muted); } .acct b { font-weight: 500; } .mono { font-family: ui-monospace, Menlo, monospace; }
.cp { background: none; border: 0; padding: 0 0 0 6px; font: inherit; font-size: 12px; color: var(--c-blue-deep); cursor: pointer; } .kyc { display: flex; gap: 8px; } .kyc select { font: inherit; padding: 8px; border: 1px solid var(--c-rule-strong); } .kyc input { flex: 1; } .okm { color: var(--c-ok); font-size: 13.5px; margin: 0; }
.subs { margin-bottom: 22px; } .subs h3 { margin: 0 0 4px; } .sr { display: grid; grid-template-columns: 1fr auto 220px; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; align-items: center; } .sr em { font-style: normal; color: var(--c-muted); font-size: 12.5px; } .sr span:last-child { text-align: right; color: var(--c-ink-soft); font-size: 13px; } .nt { display: flex; flex-direction: column; gap: 12px; } .mix { max-width: 640px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .top { grid-template-columns: 1fr; } }
</style>
