<script setup lang="ts">
// A wealth client's accounts and investing in one place: what sits in banks and in accounts held elsewhere, the
// investing account's progress in four steps, money in and out by month, then the investing and savings tools.
// Staff see provider names and can add accounts; the client sees the same view without vendor names.
const props = defineProps<{ s: Record<string, any>; staff?: boolean; investApi?: string | null; clientId?: string; canLinkBank?: boolean }>()
const emit = defineEmits<{ invite: []; linkBank: []; addAccount: [institution: string]; editAccount: [a: Record<string, any>] }>()
const { data: inv } = await useFetch<Record<string, any>>(() => props.investApi ?? '', { key: 'inv-' + (props.investApi ?? 'none'), immediate: !!props.investApi })
const money = (v: number | string | null | undefined, c = 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)))
const banks = computed(() => (props.s.banks as Record<string, any>[]) ?? [])
const accounts = computed(() => (props.s.accounts as Record<string, any>[]) ?? [])
const bankTotal = computed(() => banks.value.filter((b) => b.currency === 'USD').reduce((a, b) => a + Number(b.current ?? 0), 0))
const acctTotal = computed(() => accounts.value.filter((a) => a.currency === 'USD').reduce((t, a) => t + Number(a.balance ?? 0), 0))
const KIND: Record<string, string> = { brokerage: 'Brokerage', crypto: 'Crypto', savings: 'Savings', bank: 'Bank', retirement: 'Retirement', other: 'Other' }
const BROKERS = ['Robinhood', 'Charles Schwab', 'Fidelity', 'Vanguard', 'Bamboo', 'Cowrywise', 'Other']
// The investing account in four steps, from what the provider reports.
const al = computed(() => inv.value?.enabled?.alpaca ? inv.value.alpaca ?? {} : null)
const acctStatus = computed(() => String(al.value?.status ?? al.value?.account?.status ?? ''))
const steps = computed(() => {
  if (!al.value) return []
  const opened = !!al.value.account?.external_id, approved = ['APPROVED', 'ACTIVE'].includes(acctStatus.value)
  const funded = (al.value.banks ?? []).length > 0 && (al.value.transfers ?? []).some((t: any) => t.direction === 'INCOMING')
  const invested = (al.value.positions ?? []).length > 0 || (al.value.orders ?? []).length > 0
  const st = [opened, approved, funded, invested]; const now = st.findIndex((x) => !x)
  return [['Open the account', props.staff ? 'The client fills in their details in their portal' : 'Fill in your details below'],
    ['Identity check', acctStatus.value === 'ACTION_REQUIRED' ? 'More information is needed' : acctStatus.value === 'REJECTED' ? 'Not approved' : 'Usually takes minutes'],
    ['Link a bank and add money', 'A bank transfer into the account'],
    ['Invest', props.staff ? 'The client places orders; recommendations stay off until the compliance switches are on' : 'Place your own orders']]
    .map(([t, sub], i) => ({ n: i + 1, t, sub, state: st[i] ? 'done' : i === now ? 'now' : 'todo' }))
})
const acctLabel = computed(() => (!al.value ? '' : !al.value.account?.external_id ? 'Not opened' : ['APPROVED', 'ACTIVE'].includes(acctStatus.value) ? 'Open' : acctStatus.value ? acctStatus.value.charAt(0) + acctStatus.value.slice(1).toLowerCase().replace(/_/g, ' ') : 'Submitted'))
const wallet = computed(() => { const b = inv.value?.fincra?.balances as Record<string, { balance: number }> | undefined; if (!b) return null; return Object.entries(b).map(([c, x]) => money(x.balance, c)).join(' · ') || money(0) })
// Money in (above the line) and out (below) by month, from the investing account and the wallet.
const flows = computed(() => {
  const cur = inv.value?.country === 'NG' ? 'NGN' : 'USD', by: Record<string, { in: number; out: number }> = {}
  const add = (d: string, amt: number, dir: 'in' | 'out') => { const m = String(d).slice(0, 7); (by[m] ??= { in: 0, out: 0 })[dir] += amt }
  for (const t of al.value?.transfers ?? []) if (cur === 'USD' && !['CANCELED', 'REJECTED', 'RETURNED'].includes(String(t.status))) add(t.created_at, Number(t.amount), t.direction === 'INCOMING' ? 'in' : 'out')
  for (const t of inv.value?.fincra?.txns ?? []) if (t.currency === cur && t.status === 'confirmed') add(t.created_at, Number(t.amount), t.kind === 'deposit' ? 'in' : 'out')
  const ms = Object.keys(by).sort().slice(-12)
  return { cur, labels: ms.map((m) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })), series: [{ name: 'Money in', values: ms.map((m) => by[m]!.in) }, { name: 'Money out', values: ms.map((m) => by[m]!.out), down: true }] }
})
</script>
<template>
  <div class="ca">
    <div class="kp">
      <div class="k"><span>Cash in banks</span><b>{{ banks.length ? brief(money(bankTotal)) : '—' }}</b><em>{{ banks.length ? banks.length + ' linked account' + (banks.length === 1 ? '' : 's') + ', live' : 'link a bank to see it live' }}</em></div>
      <div class="k"><span>Investment accounts</span><b>{{ accounts.length ? brief(money(acctTotal)) : '—' }}</b><em>{{ accounts.length ? accounts.length + ' held elsewhere' : 'none recorded yet' }}</em></div>
      <div v-if="al" class="k"><span>Investing account</span><b>{{ acctLabel }}</b><em>{{ al.trading ? brief(money(al.trading.equity)) + ' invested · ' + brief(money(al.trading.cash)) + ' cash' : staff ? 'Alpaca · stocks, ETFs and crypto' : 'stocks, ETFs and crypto' }}</em></div>
      <div v-if="wallet" class="k"><span>Wallet</span><b>{{ wallet }}</b><em>{{ inv?.fincra?.txns?.length ? inv.fincra.txns.length + ' recent transfers' : 'no transfers yet' }}</em></div>
    </div>
    <div v-if="steps.length" class="card">
      <div class="h"><h3>Investing account</h3><span class="mut">{{ staff ? 'Alpaca · US stocks, ETFs and crypto' : 'US stocks, ETFs and crypto' }}</span></div>
      <ol class="st"><li v-for="x in steps" :key="x.n" :class="x.state"><span class="nb">{{ x.state === 'done' ? '✓' : x.n }}</span><b>{{ x.t }}</b><em>{{ x.sub }}</em></li></ol>
      <div v-if="staff && steps[0]?.state === 'now'" class="inv"><button class="btn sm" @click="emit('invite')">Send the client their invite</button><span class="mut">They open it themselves; you see each step here as it happens.</span></div>
    </div>
    <div class="g2">
      <div class="card">
        <div class="h"><h3>Bank accounts</h3><button v-if="canLinkBank" class="btn sm" @click="emit('linkBank')">Link a bank</button></div>
        <div v-for="b in banks" :key="b.id" class="rw"><span><b>{{ b.institution ?? 'Bank' }}</b> · {{ b.name }}{{ b.mask ? ' ••' + b.mask : '' }}</span><b>{{ money(b.current, b.currency) }}</b></div>
        <p v-if="!banks.length" class="mut">{{ staff ? 'The client links their banks from their portal. Each one then shows its live balance here.' : canLinkBank ? 'Link your bank to see live balances next to your investments.' : 'Bank linking is coming soon for your account.' }}</p>
        <p class="ft">Read-only{{ staff ? ' through Plaid' : '' }}: we never move money from here.</p>
      </div>
      <div class="card">
        <div class="h"><h3>Investment accounts</h3><span class="mut">Held elsewhere, tracked here</span></div>
        <div v-for="a in accounts" :key="a.id" class="rw"><span><b>{{ a.institution }}</b>{{ a.name ? ' · ' + a.name : '' }}<em>{{ KIND[a.kind] ?? a.kind }}{{ a.managed_by ? ' · with ' + a.managed_by : '' }} · as of {{ a.as_of }}</em></span><span class="rr"><b>{{ money(a.balance, a.currency) }}</b><button v-if="staff" class="lk" @click="emit('editAccount', a)">Edit</button></span></div>
        <template v-if="staff"><p class="mut">{{ accounts.length ? 'Add another' : 'Pick where it is held' }}:</p><div class="chips"><button v-for="b in BROKERS" :key="b" @click="emit('addAccount', b === 'Other' ? '' : b)">+ {{ b }}</button></div></template>
        <p v-else-if="!accounts.length" class="mut">None recorded yet.</p>
      </div>
    </div>
    <div v-if="flows.labels.length" class="card"><StackBars title="Money in and out" :sub="'Deposits, withdrawals and fees by month, in ' + flows.cur" :labels="flows.labels" :series="flows.series" unit="money" :currency="flows.cur" /></div>
  </div>
</template>
<style scoped>
.ca { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .k span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { display: block; font-size: 22px; font-weight: 600; margin: 2px 0; } .k em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.card { margin: 0; } .h { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; } .h h3 { margin: 0; font-size: 15px; }
.st { list-style: none; margin: 6px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; } .st li { border-top: 3px solid var(--c-rule); padding-top: 10px; } .st li.done { border-top-color: var(--c-blue-deep); } .st li.now { border-top-color: var(--c-navy); }
.st .nb { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; border: 1px solid var(--c-rule-strong); font-size: 12px; color: var(--c-blue-deep); margin-bottom: 6px; } .st li.now .nb { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .st li.done .nb { border-color: var(--c-blue-deep); }
.st b { display: block; font-size: 13.5px; font-weight: 600; } .st em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); margin-top: 2px; } .st li.todo b { color: var(--c-muted); }
.inv { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--c-rule); }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.rw { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .rw b { font-weight: 600; } .rr { display: flex; gap: 10px; align-items: baseline; white-space: nowrap; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .chips button:hover { border-color: var(--c-navy); }
.mut { color: var(--c-muted); font-size: 12.5px; } .ft { color: var(--c-muted); font-size: 12px; margin: 10px 0 0; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; }
@media (max-width: 900px) { .g2 { grid-template-columns: 1fr; } .st { grid-template-columns: 1fr 1fr; } }
</style>
