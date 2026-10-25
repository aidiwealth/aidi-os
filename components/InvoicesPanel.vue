<script setup lang="ts">
// Finvry's invoices (Settings → Plan & billing, and the Billing page): what is outstanding, one list with a filter, and
// pay from the wallet (or by card on the invoice's own page) or get the receipt on each row.
defineProps<{ bare?: boolean }>()
const { canPath } = useModuleAccess()
interface I { id: string; number: string; currency: string; amount: string; status: string; issue_date: string; due_date: string; paid_at: string | null; paid_via: string | null; company: string | null; overdue: boolean; summary: string; link: string; job_id: string | null; job: string | null; tax_amount: string }
const { data } = await usePortalFetch<I[]>('/api/portal/invoices')
const unpaid = computed(() => (data.value ?? []).filter((i) => i.status === 'sent'))
const paid = computed(() => (data.value ?? []).filter((i) => i.status === 'paid'))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const VIA: Record<string, string> = { stripe: 'Card', paystack: 'Card', manual: 'Bank transfer', wallet: 'Wallet' }
const { data: wal, refresh: rwal } = await useFetch<{ currency: string; balance_minor: number } | null>('/api/portal/wallet', { key: 'portal:wallet' })
const paying = ref(''); const pmsg = ref('')
async function payWallet(id: string) { paying.value = id; pmsg.value = ''; try { await $fetch('/api/portal/invoices/' + id + '/pay-wallet', { method: 'POST' }); await refreshNuxtData('portal:/api/portal/invoices'); await rwal() } catch (e) { pmsg.value = portalErr(e) } finally { paying.value = '' } }
const ccy = computed(() => unpaid.value[0]?.currency ?? wal.value?.currency ?? data.value?.[0]?.currency ?? 'USD')
const owed = computed(() => unpaid.value.filter((i) => i.currency === ccy.value).reduce((t, i) => t + Number(i.amount), 0))
const owedParts = computed(() => { const v = new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy.value, minimumFractionDigits: 2 }).format(owed.value); const k = v.lastIndexOf('.'); return k > 0 ? [v.slice(0, k), v.slice(k)] : [v, ''] })
const canWallet = (i: I) => !!wal.value && wal.value.currency === i.currency && wal.value.balance_minor >= Number(i.amount) * 100
const payable = computed(() => unpaid.value.filter(canWallet))
async function payAll() { for (const i of payable.value) { await payWallet(i.id); if (pmsg.value) break } }
const show = ref<'all' | 'unpaid' | 'paid'>('all'), q = ref(''), page = ref(0)
const rows = computed(() => (data.value ?? []).filter((i) => (show.value === 'all' ? i.status === 'sent' || i.status === 'paid' : show.value === 'unpaid' ? i.status === 'sent' : i.status === 'paid'))
  .filter((i) => !q.value || (i.number + ' ' + i.summary + ' ' + (i.job ?? '')).toLowerCase().includes(q.value.toLowerCase())))
watch([show, q], () => (page.value = 0))
</script>
<template>
  <section v-if="data" class="iv">
    <div class="top">
      <div><div class="eyb">Outstanding</div><div class="big">{{ owedParts[0] }}<small>{{ owedParts[1] }}</small></div>
        <p v-if="wal" class="sub">Wallet <Money :value="wal.balance_minor / 100" :currency="wal.currency" /> · <NuxtLink :to="bare ? '/settings?s=plan&b=wallet' : '/wallet'">Add money</NuxtLink></p></div>
      <div class="btns"><button v-if="payable.length" type="button" class="bt p" :disabled="!!paying" @click="payAll">{{ paying ? 'Paying…' : payable.length === unpaid.length ? 'Pay all from wallet' : 'Pay ' + payable.length + ' from wallet' }}</button>
        <NuxtLink v-if="!bare && canPath('/client/jobs')" to="/client/jobs" class="bt">By service job</NuxtLink></div>
    </div>
    <p v-if="pmsg" class="error">{{ pmsg }}</p>
    <div class="panel">
      <div class="ph"><div class="seg"><button v-for="[k, l, n] in ([['all', 'All', unpaid.length + paid.length], ['unpaid', 'Unpaid', unpaid.length], ['paid', 'Paid', paid.length]] as const)" :key="k" type="button" :class="{ on: show === k }" @click="show = k">{{ l }}<em>{{ n }}</em></button></div>
        <input v-model="q" class="sr" placeholder="Search invoices" aria-label="Search invoices"></div>
      <table data-nosearch v-if="rows.length"><thead><tr><th>Invoice</th><th>For</th><th>Issued</th><th>Status</th><th class="r">Amount</th><th /></tr></thead>
        <tbody><tr v-for="i in rows.slice(page * 15, page * 15 + 15)" :key="i.id">
          <td class="num nw">{{ i.number }}</td>
          <td class="for">{{ i.summary }}<NuxtLink v-if="i.job_id" :to="'/client/jobs/' + i.job_id" class="job">{{ i.job }}</NuxtLink></td>
          <td class="mut nw">{{ day(i.issue_date) }}</td>
          <td class="nw"><template v-if="i.status === 'sent'"><i class="dot" :class="{ r: i.overdue }" />{{ i.overdue ? 'Overdue' : 'Due ' + day(i.due_date) }}</template><template v-else><i class="dot b" />Paid{{ i.paid_via ? ' · ' + (VIA[i.paid_via] ?? i.paid_via).toLowerCase() : '' }}</template></td>
          <td class="r num"><Money :value="i.amount" :currency="i.currency" /></td>
          <td class="r nw"><template v-if="i.status === 'sent'"><button v-if="canWallet(i)" type="button" class="lk" :disabled="!!paying" @click="payWallet(i.id)">{{ paying === i.id ? 'Paying…' : 'Pay' }}</button><a v-else :href="i.link" class="lk">Pay</a></template><a v-else :href="i.link" class="lk">Receipt</a></td></tr></tbody></table>
      <p v-else class="none">{{ q ? 'No invoices match' : show === 'unpaid' ? 'Nothing to pay' : 'No invoices yet' }}</p>
      <TablePager v-if="rows.length > 15" v-model="page" :total="rows.length" :size="15" />
    </div>
  </section>
</template>
<style scoped>
.iv { display: flex; flex-direction: column; gap: 18px; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.eyb { font-size: 13px; color: var(--c-muted); margin-bottom: 8px; } .sub { margin: 8px 0 0; font-size: 13px; color: var(--c-muted); } .sub a { color: var(--c-blue-deep); text-decoration: none; }
.big { font-size: 44px; font-weight: 500; letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1; } .big small { font-size: 21px; color: var(--c-muted); font-weight: 500; letter-spacing: 0; }
.btns { display: flex; gap: 8px; } .bt { display: inline-flex; align-items: center; padding: 8px 14px; font: inherit; font-size: 13.5px; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink); cursor: pointer; text-decoration: none; } .bt.p { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.panel { background: #fff; border: 1px solid var(--c-rule); }
.ph { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px; flex-wrap: wrap; }
.seg { display: inline-flex; gap: 4px; } .seg button { background: none; border: 0; padding: 5px 11px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; } .seg em { font-style: normal; color: var(--c-muted); margin-left: 5px; font-size: 12px; }
.sr { font: inherit; font-size: 13px; padding: 7px 11px; border: 1px solid var(--c-rule-strong); min-width: 200px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--c-muted); padding: 10px 20px; border-top: 1px solid var(--c-rule); } td { padding: 12px 20px; border-top: 1px solid var(--c-rule); }
.r { text-align: right; } .num { font-variant-numeric: tabular-nums; } .mut { color: var(--c-muted); } .nw { white-space: nowrap; } .for { min-width: 180px; } .job { display: block; font-size: 12.5px; color: var(--c-muted); text-decoration: none; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #b4541a; margin-right: 6px; vertical-align: 1px; } .dot.b { background: #5fa8d3; } .dot.r { background: var(--c-danger); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.none { padding: 18px 20px; border-top: 1px solid var(--c-rule); color: var(--c-muted); font-size: 13px; margin: 0; text-align: center; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .big { font-size: 36px; } th:nth-child(3), td:nth-child(3) { display: none; } .sr { min-width: 0; width: 100%; } }
</style>
