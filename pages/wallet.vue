<script setup lang="ts">
// Wallet: balance card, card top-up, money movement by month, transactions with export.
useHead({ title: 'Wallet' })
interface D { company: string; plan: string; currency: string; balance_minor: number; min_minor: number; ledger: { id: string; kind: string; amount_minor: number; balance_after_minor: number; category: string; reason: string; date: string }[]; pending: number; canTopup: boolean; provider: string }
const route = useRoute()
const { data, refresh } = await useFetch<D>('/api/wallet', { query: { ref: route.query.ref ?? '' } })
const PLAN: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_scale: 'Scale', internal: 'Internal' }
const sym = computed(() => (data.value?.currency === 'NGN' ? '₦' : '$'))
const quick = computed(() => (data.value?.currency === 'NGN' ? [10000, 25000, 50000, 100000] : [25, 50, 100, 250]))
const amount = ref<number | null>(null)
watchEffect(() => { if (data.value && amount.value === null) amount.value = quick.value[1]! })
const below = computed(() => !!data.value && (amount.value ?? 0) * 100 < data.value.min_minor)
const msg = ref(''); const busy = ref(false)
const returned = computed(() => !!route.query.ref)
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
        <div class="quick"><button v-for="a in quick" :key="a" type="button" :class="{ on: amount === a }" @click="amount = a">{{ sym }}{{ a.toLocaleString() }}</button></div>
        <label class="label">Amount ({{ data.currency }})<input v-model.number="amount" type="number" :min="data.min_minor / 100" inputmode="decimal"></label>
        <p class="mut" :class="{ red: below }">Smallest top-up is {{ sym }}{{ (data.min_minor / 100).toLocaleString() }}.</p>
        <button class="btn" type="button" :disabled="busy || !amount || below || !data.canTopup" @click="topup">{{ busy ? 'Redirecting…' : 'Continue with ' + data.provider }}</button>
        <p class="mut">{{ data.canTopup ? 'Secured by ' + data.provider + '. Card details never reach us.' : 'Card top-ups are being switched on. Contact support to fund your wallet.' }}</p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
    </div>
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
.flow, .mix { margin-bottom: 22px; } .mix { max-width: 640px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .top { grid-template-columns: 1fr; } }
</style>
