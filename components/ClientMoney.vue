<script setup lang="ts">
// Where a client's money is, in three kinds of account that each do one job: the Aidi investing account (where they
// buy and sell with us; in Nigeria the Aidi wallet), their banks (where money comes from and goes back to) and accounts
// they hold elsewhere (tracked for the plan, not traded). Opening the investing account is a four-step window, not a
// long form on the page. The broker is never named.
const props = defineProps<{ s: Record<string, any>; investApi?: string | null; country: string; contactName?: string | null; canLinkBank?: boolean; preview?: boolean }>()
const emit = defineEmits<{ linkBank: []; refresh: [] }>()
const { data: inv, refresh: refreshInv } = await useFetch<Record<string, any>>(() => props.investApi ?? '', { key: 'inv-' + (props.investApi ?? 'none'), immediate: !!props.investApi })
const money = (v: number | string | null | undefined, c = 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)))
const banks = computed(() => (props.s.banks as Record<string, any>[]) ?? [])
const elsewhere = computed(() => ((props.s.accounts as Record<string, any>[]) ?? []))
const al = computed(() => (inv.value?.enabled?.alpaca ? inv.value.alpaca ?? {} : null))
const opened = computed(() => !!al.value?.account?.external_id)
const status = computed(() => String(al.value?.status ?? al.value?.account?.status ?? '').toUpperCase())
const ready = computed(() => ['APPROVED', 'ACTIVE'].includes(status.value))
const fin = computed(() => (inv.value?.enabled?.fincra ? inv.value.fincra ?? null : null))
const ng = computed(() => props.country === 'NG')
const bankName = computed(() => (banks.value[0] ? (banks.value[0].institution ?? 'Your bank') + (banks.value[0].mask ? ' ••' + banks.value[0].mask : '') : 'Your bank'))
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const msg = ref(''), ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.'
// Open the investing account: four steps.
const STEPS = ['You', 'Address', 'Money source', 'Sign']
const op = reactive({ open: false, step: 0, busy: false, msg: '', given_name: '', family_name: '', date_of_birth: '', phone: '', tax_id: '', street: '', city: '', state: '', postal_code: '', funding_source: 'employment_income', crypto: true, agree: false, terms: false })
function openForm() { if (props.preview) { msg.value = 'Preview only.'; return } const [g, ...f] = String(props.contactName ?? '').split(/\s+/); Object.assign(op, { open: true, step: 0, busy: false, msg: '', given_name: op.given_name || g || '', family_name: op.family_name || f.join(' ') }) }
const stepOk = computed(() => [op.given_name && op.family_name && /^\d{4}-\d{2}-\d{2}$/.test(op.date_of_birth) && op.phone.replace(/\D/g, '').length >= 10 && op.tax_id.replace(/\D/g, '').length === 9, op.street && op.city && /^[A-Za-z]{2}$/.test(op.state) && /^\d{5}/.test(op.postal_code), !!op.funding_source, op.agree && op.terms][op.step])
async function submit() {
  op.busy = true; op.msg = ''
  try { await $fetch(props.investApi!, { method: 'POST', body: { action: 'alpaca_open', given_name: op.given_name, family_name: op.family_name, date_of_birth: op.date_of_birth, phone: op.phone, tax_id: op.tax_id, street: op.street, city: op.city, state: op.state.toUpperCase(), postal_code: op.postal_code, funding_source: op.funding_source, crypto: op.crypto, agree: op.agree } }); op.open = false; ok.value = 'Submitted. The identity check usually takes minutes; this page updates when it is done.'; await refreshInv() }
  catch (e) { op.msg = err(e) } finally { op.busy = false }
}
const FUND: [string, string][] = [['employment_income', 'Salary'], ['business_income', 'Business income'], ['savings', 'Savings'], ['investments', 'Investments'], ['inheritance', 'Inheritance'], ['family', 'Family']]
// Accounts elsewhere: add or update a value.
const FIRMS = ['Robinhood', 'Charles Schwab', 'Fidelity', 'Vanguard', 'Coinbase', 'Other']
const KIND: Record<string, string> = { brokerage: 'Investment account', retirement: 'Retirement plan', crypto: 'Crypto', savings: 'Savings', bank: 'Bank', other: 'Other' }
const ac = reactive({ open: false, busy: false, msg: '', account_id: '', institution: '', kind: 'brokerage', name: '', currency: 'USD', balance: '' as string | number, as_of: new Date().toISOString().slice(0, 10) })
function editAcc(a?: Record<string, any>, firm = '') { if (props.preview) { msg.value = 'Preview only.'; return } Object.assign(ac, { open: true, busy: false, msg: '', account_id: a?.id ?? '', institution: a?.institution ?? (firm === 'Other' ? '' : firm), kind: a?.kind ?? (firm === 'Coinbase' ? 'crypto' : 'brokerage'), name: a?.name ?? '', currency: a?.currency ?? (ng.value ? 'NGN' : 'USD'), balance: a ? Number(a.balance) : '', as_of: new Date().toISOString().slice(0, 10) }) }
async function saveAcc(del = false) { ac.busy = true; ac.msg = ''; try { await $fetch('/api/w/accounts', { method: 'POST', body: del ? { account_id: ac.account_id, delete: true } : { ...ac, balance: Number(ac.balance) } }); ac.open = false; emit('refresh') } catch (e) { ac.msg = err(e) } finally { ac.busy = false } }
</script>
<template>
  <div class="cm">
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <section class="card fl">
      <div class="flow"><div class="nd"><b>{{ bankName }}</b><span>{{ banks.length ? money(banks[0].current, banks[0].currency) : 'link one below' }}</span></div><div class="ar"><span>Add money</span><i>→</i></div>
        <div class="nd dk"><b>{{ ng ? 'Aidi wallet' : 'Aidi investing account' }}</b><span>{{ ng ? 'Naira and dollar accounts, in your name' : opened ? (ready ? 'Open' : 'Being checked') + ' · in your name' : 'Not opened yet' }}</span></div><div class="ar"><span>{{ ng ? 'Save or invest' : 'Buy' }}</span><i>→</i></div>
        <div class="nd"><b>Your investments</b><span>{{ ng ? 'Savings and crypto' : 'Stocks, ETFs and crypto' }}</span></div></div>
      <p class="mut sm">Accounts you hold elsewhere (Robinhood, Schwab…) are tracked for your plan, separately.</p>
    </section>
    <!-- 1 · The Aidi investing account (US) or wallet (Nigeria) -->
    <section class="card">
      <div class="hd"><div><b class="t">1 · {{ ng ? 'Aidi wallet' : 'Aidi investing account' }}</b><span class="mut sm">{{ ng ? 'Where you keep naira and dollars with us, and save.' : 'Where you buy and sell with us.' }}</span></div></div>
      <template v-if="!ng && al">
        <div v-if="!opened" class="intro"><div class="ben"><span>✓ Buy US stocks, ETFs and crypto from your dashboard</span><span>✓ Held in your name; your money stays yours</span><span>✓ Add money from your bank, withdraw any time</span></div>
          <div class="cta"><span class="tag warn">Not opened yet</span><b>About 5 minutes</b><span class="mut sm">Your details, address, where the money comes from, then sign.</span><button class="btn" @click="openForm">Open my investing account</button></div></div>
        <template v-else>
          <div class="k3"><div><span>Invested</span><b>{{ al.trading ? money(Number(al.trading.equity) - Number(al.trading.cash)) : '—' }}</b></div><div><span>Cash ready to invest</span><b>{{ al.trading ? money(al.trading.cash) : '—' }}</b><em>arrives 1–3 days after you add money</em></div><div><span>Account</span><b><span class="tag" :class="ready ? 'blue' : 'warn'">{{ ready ? 'Open' : status === 'ACTION_REQUIRED' ? 'Needs information' : status === 'REJECTED' ? 'Not approved' : 'Being checked' }}</span></b><em>{{ al.account?.detail?.account_number ? '••' + String(al.account.detail.account_number).slice(-4) : '' }}</em></div></div>
          <div v-if="ready" class="row"><button class="btn" @click="go('inv-order')">Invest</button><button class="btn secondary" @click="go('inv-money')">Add money</button><button class="btn secondary" @click="go('inv-money')">Withdraw</button></div>
          <p v-else class="mut sm">{{ status === 'ACTION_REQUIRED' || status === 'REJECTED' ? 'Your adviser will contact you about the identity check.' : 'The identity check usually takes minutes. You can invest once it is done.' }}</p>
        </template>
      </template>
      <template v-else-if="ng && fin"><div class="k3"><div v-for="c in fin.currencies" :key="c"><span>{{ c }} balance</span><b>{{ money(fin.balances[c]?.balance ?? 0, c) }}</b><em v-if="fin.balances[c]?.pending">{{ money(fin.balances[c].pending, c) }} on its way out</em></div></div><div class="row"><button class="btn secondary" @click="go('inv-wallet')">Add money or withdraw</button></div></template>
      <p v-else class="mut">{{ ng ? 'Your wallet is not available on your account yet. Your adviser will tell you when it is.' : 'Investing is not available on your account yet. Your adviser will tell you when it is.' }}</p>
    </section>
    <div class="g2">
      <!-- 2 · Banks -->
      <section class="card">
        <div class="hd"><div><b class="t">2 · Your banks</b><span class="mut sm">Where money comes from and goes back to.</span></div><button v-if="canLinkBank" class="btn secondary sm" @click="emit('linkBank')">{{ banks.length ? 'Link another' : 'Link a bank' }}</button></div>
        <div v-for="b in banks" :key="b.id" class="rw"><span>{{ b.institution ?? 'Bank' }} · {{ b.name }}{{ b.mask ? ' ••' + b.mask : '' }}</span><b>{{ money(b.current, b.currency) }}</b></div>
        <p v-if="!banks.length" class="mut sm">{{ canLinkBank ? 'No bank linked yet. Linking shows its balance here.' : 'Linking a bank is coming soon for your account.' }}</p>
        <p class="ft">Read-only: we never move money from your bank without you.</p>
      </section>
      <!-- 3 · Elsewhere -->
      <section class="card">
        <div class="hd"><div><b class="t">3 · Accounts elsewhere</b><span class="mut sm">Investments you hold with other firms. We track them for your plan; we can't trade them.</span></div></div>
        <div v-for="a in elsewhere" :key="a.id" class="rw"><span>{{ a.institution }}{{ a.name ? ' · ' + a.name : '' }}<em>{{ KIND[a.kind] ?? a.kind }} · as of {{ a.as_of }} · <button class="lk" @click="editAcc(a)">update</button></em></span><b>{{ money(a.balance, a.currency) }}</b></div>
        <p class="mut sm">{{ elsewhere.length ? 'Add another' : 'Add one' }}:</p>
        <div class="chips"><button v-for="f in FIRMS" :key="f" @click="editAcc(undefined, f)">+ {{ f }}</button></div>
      </section>
    </div>
    <AppModal :open="op.open" title="Open your investing account" @close="op.open = false">
      <form id="opf" class="fm" @submit.prevent="op.step < 3 ? (stepOk && op.step++) : submit()">
        <div class="stp"><div v-for="(l, i) in STEPS" :key="l" :class="{ on: i <= op.step }"><i /><span>{{ l }}</span></div></div>
        <template v-if="op.step === 0"><b class="q">About you</b><div class="g2f"><label>First name<input v-model="op.given_name" autocomplete="given-name"></label><label>Last name<input v-model="op.family_name" autocomplete="family-name"></label><label>Date of birth<input v-model="op.date_of_birth" type="date"></label><label>Mobile number<input v-model="op.phone" autocomplete="tel" placeholder="+1 408 555 0100"></label><label class="w2">Social Security number<input v-model="op.tax_id" type="password" inputmode="numeric" autocomplete="off" placeholder="9 digits"></label></div><span class="mut sm">Your Social Security number goes to our brokerage partner for the identity check the law requires. Aidi does not keep it.</span></template>
        <template v-else-if="op.step === 1"><b class="q">Where do you live?</b><div class="g2f"><label class="w2">Street address<input v-model="op.street" autocomplete="street-address"></label><label>City<input v-model="op.city" autocomplete="address-level2"></label><label>State<input v-model="op.state" maxlength="2" placeholder="CA"></label><label>ZIP code<input v-model="op.postal_code" inputmode="numeric" maxlength="10"></label></div></template>
        <template v-else-if="op.step === 2"><b class="q">Where does the money you'll invest come from?</b><div class="opts"><button v-for="[k, l] in FUND" :key="k" type="button" :class="{ on: op.funding_source === k }" @click="op.funding_source = k">{{ l }}</button></div><label class="cb"><input v-model="op.crypto" type="checkbox"> Also let me buy crypto</label></template>
        <template v-else><b class="q">Sign</b><p class="sm">An individual brokerage account for US stocks, ETFs{{ op.crypto ? ' and crypto' : '' }}, in your name.</p><label class="cb"><input v-model="op.agree" type="checkbox"> I have read and accept the brokerage customer agreement{{ op.crypto ? ' and the crypto agreement' : '' }}</label><label class="cb"><input v-model="op.terms" type="checkbox"> I agree to Aidi Wealth's terms and privacy notice</label></template>
        <p v-if="op.msg" class="error">{{ op.msg }}</p>
      </form>
      <template #foot><button v-if="op.step > 0" type="button" class="btn secondary" @click="op.step--">← Back</button><button class="btn" type="submit" form="opf" :disabled="!stepOk || op.busy">{{ op.step < 3 ? 'Continue' : op.busy ? 'Opening…' : 'Open my account' }}</button></template>
    </AppModal>
    <AppModal :open="ac.open" :title="ac.account_id ? 'Update ' + ac.institution : 'Add an account held elsewhere'" @close="ac.open = false">
      <form id="acf" class="fm" @submit.prevent="saveAcc()"><div class="g2f"><label>Where it is held<input v-model="ac.institution" maxlength="120" placeholder="Robinhood, Schwab…"></label><label>Type<select v-model="ac.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
        <label>Value<input v-model="ac.balance" type="number" min="0" step="any"></label><label>Currency<select v-model="ac.currency"><option>USD</option><option>NGN</option></select></label><label>As of<input v-model="ac.as_of" type="date"></label><label>Name (optional)<input v-model="ac.name" maxlength="120" placeholder="e.g. Individual, Roth IRA"></label></div><p v-if="ac.msg" class="error">{{ ac.msg }}</p></form>
      <template #foot><button v-if="ac.account_id" type="button" class="btn secondary danger" @click="saveAcc(true)">Remove</button><button type="button" class="btn secondary" @click="ac.open = false">Cancel</button><button class="btn" type="submit" form="acf" :disabled="ac.busy || !ac.institution || ac.balance === ''">Save</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.cm { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; } .card { margin: 0; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.flow { display: flex; align-items: stretch; } .nd { flex: 1; padding: 14px; border: 1px solid var(--c-rule-strong); background: #fff; } .nd b { display: block; font-size: 14px; } .nd span { font-size: 12.5px; color: var(--c-muted); } .nd.dk { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .nd.dk span { color: rgba(255,255,255,.75); }
.ar { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px; font-size: 11.5px; color: var(--c-muted); } .ar i { font-style: normal; font-size: 18px; color: var(--c-blue-deep); } .fl p { margin: 10px 0 0; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; } .t { display: block; font-size: 16px; }
.intro { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; align-items: center; } .ben { display: flex; flex-direction: column; gap: 8px; font-size: 14px; } .cta { background: #fafaf8; padding: 16px; display: flex; flex-direction: column; gap: 8px; } .cta b { font-size: 15px; }
.tag { align-self: flex-start; font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); font-weight: 400; } .tag.warn { background: #fff6e6; color: #7a4a06; } .tag.blue { background: #e6ecf2; color: var(--c-blue-deep); }
.k3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .k3 span { display: block; font-size: 12.5px; color: var(--c-muted); } .k3 b { display: block; font-size: 22px; font-weight: 600; margin: 2px 0; } .k3 em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.rw { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 14px; } .rw em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .rw b { font-weight: 600; white-space: nowrap; }
.ft { font-size: 12px; color: var(--c-muted); margin: 10px 0 0; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { font: inherit; font-size: 13px; padding: 6px 11px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .chips button:hover { border-color: var(--c-navy); }
.fm { display: flex; flex-direction: column; gap: 12px; } .q { font-size: 15px; } .stp { display: flex; gap: 6px; } .stp div { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--c-muted); } .stp i { height: 3px; background: #e6ecf2; } .stp .on i { background: var(--c-navy); } .stp .on { color: var(--c-ink); }
.g2f { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .g2f .w2 { grid-column: 1 / -1; } .fm label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } .fm input, .fm select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; box-sizing: border-box; width: 100%; }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; } .opts button { font: inherit; font-size: 13.5px; text-align: left; padding: 10px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .opts button.on { border-color: var(--c-navy); background: #f7f9fb; }
.fm .cb { flex-direction: row; gap: 8px; align-items: flex-start; font-size: 13.5px; color: var(--c-ink); } .fm .cb input { width: auto; margin-top: 3px; }
@media (max-width: 900px) { .flow { flex-direction: column; } .ar { flex-direction: row; gap: 6px; padding: 6px; } .intro, .g2, .k3 { grid-template-columns: 1fr; } }
</style>
