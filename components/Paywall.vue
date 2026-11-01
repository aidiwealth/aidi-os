<script setup lang="ts">
import { PLAN_FOR, PLAN_NAME } from '~/shared/plans'
// A locked page: a blurred preview of what the page holds and the same plan picker everywhere.
const props = defineProps<{ code: string; label: string }>()
interface P { code: string; name: string; description: string; usd: number | null; ngn: number | null; usd_year?: number | null; ngn_year?: number | null }
const { data } = await useFetch<{ currency: string; status: string; trial_used: boolean; plan: string; cycle?: string; last_plan?: string | null; plans: P[] }>('/api/company/profile', { key: 'company-profile' })
const FEAT: Record<string, { title: string; lede: string; points: string[]; kind: string }> = {
  updates: { title: 'Investor updates', lede: 'Keep investors close with polished monthly and quarterly updates, drafted by AI from your numbers.', kind: 'doc',
    points: ['Block editor with charts straight from your Financials', 'AI writes the first draft from your figures and notes', 'Send to lists or pipeline stages, with a test send and preview', 'See who opened, when and how often', 'Templates, duplicates and publishing to your investor page'] },
  fundraising: { title: 'Fundraising', lede: 'Run your raise in one place: pipelines, a tracked data room, an AI deal memo and SAFEs.', kind: 'pipe',
    points: ['Pipelines with custom stages, targets and committed totals', 'Data room with tracked links, NDA and watermarking', 'AI-written deal memo from your numbers', 'SAFE term sheets with ownership worked out', 'Short branded links like app.finvry.com/you/deck'] },
  quickbooks: { title: 'QuickBooks', lede: 'Connect QuickBooks and pull your profit and loss, balance sheet and cash flow for any period in one click.', kind: 'table',
    points: ['Connect each company or entity to its QuickBooks file', 'Pull P&L, balance sheet and cash flow for a month, quarter or year', 'Figures mapped to a standard statement, ready to review', 'Burn, runway and margins worked out for you', 'Boards and investor updates fill in from the same numbers'] },
  forecast: { title: 'Forecast', lede: 'See where cash, revenue and profit are heading, built from your statements and your bank, or from your accountant\'s model.', kind: 'table',
    points: ['Built from Financials and live bank data in one click', 'Import your accountant\'s forecast; AI puts every line in place', 'Base, best and worst case, runway and break-even', 'Several forecasts, each shareable by private link with view tracking', 'Add it to boards, the investor page or the data room'] },
  equity: { title: 'Cap table', lede: 'Who owns what, kept right: built from your lawyer\'s files, with SAFEs, options and the next round modelled.', kind: 'table',
    points: ['Import from Pulley, Carta or your lawyer\'s files; AI builds it', 'E-sign SAFEs, option grants and share purchases; the cap table updates itself', 'Board consents drafted by AI and linked to each grant', 'Electronic share certificates', 'Round and exit modelling, several cap tables, private share links'] },
  fin_customers: { title: 'Customers & retention', lede: 'See which customers stay, grow and leave: net revenue retention, churn, cohorts, top and least performing customers, sectors and lifetime value.', kind: 'table',
    points: ['Net and gross revenue retention, logo and revenue churn', 'Retention by Enterprise, Mid-market and SMB, or your own segments', 'Duplicate customers found by AI before anything is saved', 'Top and least performing customers, sectors and concentration', 'Lifetime value, payback and four key points in plain words'] },
  subsidiaries: { title: 'Subsidiaries', lede: 'Keep separate financials for each subsidiary, each with its own name and currency, plus a consolidated group view.', kind: 'table',
    points: ['A Financials page for every subsidiary, named as you like', 'Each in its own currency', 'Group view adds them up at the latest daily rate', 'Statements, analysis and checks per subsidiary'] },
  fin_report: { title: 'Monthly management report', lede: 'A clear monthly report for your executive team: how the business grew, where the money went, cash and runway, and what to act on.', kind: 'doc',
    points: ['Pick the sections: key numbers, growth, profit and loss, costs, cash, KPIs, customers', 'This month against last month, last year and the year to date', 'Health check and four key points from your own figures', 'Your comments and priorities for next month', 'PDF or Excel with your logo, saved to the data room if you like'] },
  contacts: { title: 'Contacts', lede: 'Your investor CRM: everyone you talk to, what they opened and where they are in your raise.', kind: 'table',
    points: ['Lists, custom properties and subscribe status', 'Engagement chart for every contact', 'Every update open and data room view logged', 'Notes, pipelines and shared items on one page', 'Import your list in one paste'] } }
const f = computed(() => FEAT[props.code] ?? { title: props.label, lede: '', kind: 'table', points: [] })
// One paywall for every locked feature: the plans, the one you are on (and the one you were last on), and Upgrade or
// Downgrade on each. The plans that include this feature are marked.
const ORDER = ['company_free', 'company_startup', 'company_medium', 'company_scale']
const need = computed(() => PLAN_FOR[props.code] ?? 'company_startup')
const cur = computed(() => data.value?.plan ?? 'company_free')
const ngn = computed(() => data.value?.currency === 'NGN')
const yearly = computed(() => data.value?.cycle === 'year')
const rows = computed(() => (data.value?.plans ?? []).filter((p) => ORDER.includes(p.code)).sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code)).map((p) => {
  const m = ngn.value ? p.ngn : p.usd, y = ngn.value ? p.ngn_year : p.usd_year, sym = ngn.value ? '₦' : '$'
  const price = !m ? sym + '0' : yearly.value && y ? sym + y.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' / year' : sym + m.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' / month'
  const d = ORDER.indexOf(p.code) - ORDER.indexOf(cur.value)
  return { ...p, price, has: ORDER.indexOf(p.code) >= ORDER.indexOf(need.value), mine: d === 0, last: p.code === data.value?.last_plan, act: d > 0 ? 'Upgrade' : d < 0 ? 'Downgrade' : '' }
}))
const curName = computed(() => PLAN_NAME[cur.value] ?? 'Free')
const lastName = computed(() => (data.value?.last_plan ? PLAN_NAME[data.value.last_plan] ?? null : null))
const trial = computed(() => !!data.value && !data.value.trial_used && data.value.status !== 'trial')
const busy = ref(''); const msg = ref(''); const billing = ref(false); const sure = ref('')
async function move(code: string, act: string) {
  if (act === 'Downgrade' && sure.value !== code) { sure.value = code; return }
  busy.value = code; msg.value = ''; billing.value = false
  try { await $fetch('/api/company/plan', { method: 'POST', body: { plan: code } }); await refreshNuxtData(); window.location.reload() }
  catch (e) { const er = (e as { data?: { data?: { error?: { code?: string; message?: string } } } }).data?.data?.error; msg.value = er?.message ?? 'Could not change your plan.'; billing.value = er?.code === 'billing' || er?.code === 'insufficient'; busy.value = ''; sure.value = '' }
}
</script>
<template>
  <section class="pw">
    <p class="label">{{ f.title }}</p>
    <div class="stage">
      <div class="ghost" aria-hidden="true">
        <div class="gh"><i class="t w40" /><i class="b w12" /></div>
        <template v-if="f.kind === 'doc'"><div class="gcard"><i class="t w60" /><i class="l" /><i class="l w80" /><div class="bars"><i v-for="n in 6" :key="n" :style="{ width: 30 + n * 10 + '%' }" /></div><i class="l w70" /><i class="l w50" /></div><div class="grow"><div v-for="n in 4" :key="n" class="gcard sm"><i class="t w50" /><i class="l w80" /></div></div></template>
        <template v-else-if="f.kind === 'pipe'"><div class="cols"><div v-for="n in 5" :key="n" class="col"><i class="t w60" /><div v-for="k in (n % 3) + 1" :key="k" class="gcard sm"><i class="l w70" /><i class="l w40" /></div></div></div></template>
        <template v-else><div class="gcard"><div v-for="n in 7" :key="n" class="row"><span class="av" /><i class="l w30" /><i class="l w20" /><i class="chip" /></div></div></template>
      </div>
      <div class="veil" />
      <div class="card">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div>
        <p class="ey">{{ f.title }} · {{ PLAN_NAME[need] }} plan and above</p>
        <h2>You're on the {{ curName }} plan</h2>
        <p class="lede">{{ lastName ? 'You were last on ' + lastName + '. ' : '' }}{{ data?.status === 'trial' ? 'You are on a free trial; change plan any time.' : trial ? 'Your first paid plan starts with a 14-day free trial.' : 'Upgrade or downgrade below.' }}</p>
        <div class="pl">
          <div v-for="r in rows" :key="r.code" class="pr" :class="{ mine: r.mine }">
            <div class="nm"><b>{{ r.name }}<em v-if="r.mine">Your plan</em><em v-else-if="r.last" class="ls">Last plan</em></b><span>{{ r.price }}</span><small v-if="r.has" class="ok"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 10.5l4 4 8-9" /></svg>Includes {{ f.title }}</small><small v-else>Without {{ f.title }}</small></div>
            <button v-if="r.act" type="button" class="btn" :class="{ secondary: r.act === 'Downgrade' }" :disabled="!!busy" @click="move(r.code, r.act)">{{ busy === r.code ? 'Moving…' : sure === r.code ? 'Confirm downgrade' : r.act }}</button>
          </div>
        </div>
        <p v-if="sure" class="warn">Downgrading takes effect now. {{ f.title }} and other paid features lock again, and the rest of this period is not refunded.</p>
        <p v-if="msg" class="error">{{ msg }} <NuxtLink v-if="billing" to="/settings?s=plan&b=wallet">Top up or add a card →</NuxtLink></p>
        <span class="sub">{{ trial ? 'No card needed for the trial. Cancel any time.' : 'Paid from your wallet, or your card on file when the wallet is short.' }}</span>
        <NuxtLink to="/settings?s=plan" class="cmp">Compare what each plan includes →</NuxtLink>
      </div>
    </div>
  </section>
</template>
<style scoped>
.pw { position: relative; } .stage { position: relative; display: grid; min-height: 560px; overflow: hidden; border-radius: 0; } .stage > * { grid-area: 1 / 1; }
.ghost { filter: blur(6px); opacity: .75; pointer-events: none; user-select: none; display: flex; flex-direction: column; gap: 14px; padding: 4px; }
.ghost i { display: block; background: #dedbd2; height: 10px; margin: 7px 0; } .ghost .t { height: 16px; background: #c9c5ba; } .ghost .b { height: 34px; background: var(--c-navy); opacity: .55; }
.w12 { width: 12%; } .w20 { width: 20%; } .w30 { width: 30%; } .w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; }
.gh { display: flex; justify-content: space-between; align-items: center; } .gcard { background: #fff; border: 1px solid var(--c-rule); padding: 18px; } .gcard.sm { padding: 12px; } .grow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.bars i { height: 14px; background: linear-gradient(90deg, #1c3d63, #5b8fd1); margin: 6px 0; } .cols { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .col { background: var(--c-paper-2); padding: 10px; min-height: 360px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .row .av { width: 28px; height: 28px; border-radius: 50%; background: #e3def7; flex: none; } .row .chip { width: 70px; height: 18px; background: #d8e3ec; margin-left: auto; }
.veil { position: relative; background: linear-gradient(180deg, rgba(251,250,247,.35) 0%, rgba(251,250,247,.82) 55%, rgba(251,250,247,.96) 100%); }
.card { position: relative; justify-self: center; align-self: start; margin: 40px 0; width: min(540px, calc(100% - 32px)); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 18px 60px rgba(12, 26, 46, .14); padding: 32px 34px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.ic { width: 48px; height: 48px; border-radius: 0; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; margin-bottom: 16px; } .ic svg { width: 22px; height: 22px; }
.ey { font-size: 12.5px; color: var(--c-blue-deep); margin: 0 0 6px; } .card h2 { font-size: 26px; margin: 0 0 6px; color: var(--c-ink); } .lede { font-size: 14.5px; color: var(--c-ink-soft); line-height: 1.55; margin: 0 0 18px; }
.pl { width: 100%; border: 1px solid var(--c-rule); text-align: left; margin-bottom: 14px; } .pr { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--c-rule); } .pr:first-child { border-top: 0; } .pr.mine { background: var(--c-paper-2); }
.nm { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .nm b { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; } .nm b em { font-style: normal; font-weight: 500; font-size: 11.5px; padding: 1px 7px; border: 1px solid var(--c-rule-strong); color: var(--c-ink-soft); } .nm b em.ls { border-color: var(--c-blue-deep); color: var(--c-blue-deep); } .nm span { font-size: 13px; color: var(--c-ink-soft); } .nm small { font-size: 12px; color: var(--c-muted); display: flex; align-items: center; gap: 4px; } .nm small.ok { color: var(--c-blue-deep); } .nm small svg { width: 13px; height: 13px; }
.pr .btn { min-width: 132px; padding: 9px 14px; } .warn { font-size: 13px; color: var(--c-ink-soft); margin: 0 0 10px; text-align: left; width: 100%; }
.sub { font-size: 12.5px; color: var(--c-muted); margin-top: 8px; } .cmp { font-size: 13.5px; margin-top: 14px; color: var(--c-blue-deep); } .error { color: var(--c-danger); margin: 0 0 10px; font-size: 13px; text-align: left; width: 100%; } .error a { color: var(--c-blue-deep); white-space: nowrap; }
@media (max-width: 760px) { .grow, .cols { grid-template-columns: 1fr 1fr; } .card { padding: 24px 16px; } .pr .btn { min-width: 0; } }
</style>
