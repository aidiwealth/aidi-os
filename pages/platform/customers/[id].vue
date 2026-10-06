<script setup lang="ts">
const id = useRoute().params.id as string
const invited = useRoute().query.invited === '1'
interface D { org: { raise_enabled?: boolean; raise_fee_pct?: number; id: string; name: string; slug: string; kind: string; status: string; plan_code: string; plan: string; trial_ends: string | null; created_at: string; brand: string; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null; price: string | null }
  usage: { seats: number; storage: number; ai: number; last_activity: string | null; modules_off: number }; admins: { name: string; email: string; last_login_at: string | null }[]; log: { action: string; at: string; detail: Record<string, unknown>; by_name: string | null }[]; cards: { provider: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; is_default: boolean }[] }
const { data, refresh } = await useFetch<D>('/api/platform/orgs/' + id)
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean }[] }>('/api/platform/plans')
useHead({ title: () => 'Finvry · ' + (data.value?.org.name ?? 'Customer') })
const f = reactive({ name: '', plan_code: '', status: '', trial_ends_at: '' })
watchEffect(() => { const o = data.value?.org; if (o) Object.assign(f, { name: o.name, plan_code: o.plan_code, status: o.status, trial_ends_at: o.trial_ends ?? '' }) })
const busy = ref(false); const msg = ref(''); const ok = ref(invited ? 'Workspace created and the admin has been invited.' : '')
async function save() {
  if ((f.status === 'suspended' || f.status === 'closed') && f.status !== data.value?.org.status && !confirm('This signs everyone in ' + f.name + ' out and blocks access until reactivated. Continue?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/platform/orgs/' + id, { method: 'PATCH', body: { name: f.name, plan_code: f.plan_code, status: f.status, trial_ends_at: f.status === 'trial' ? (f.trial_ends_at || null) : undefined } }); ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(2)
const pct = (v: number, max: number | null) => (max ? Math.min(100, (v / max) * 100) : 0)
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never')
const ACT: Record<string, string> = { 'platform.workspace_create': 'Workspace created', 'platform.workspace_update': 'Workspace updated', 'platform.plan_save': 'Plan saved' }
async function delOrg() { const n = data.value?.org.name ?? ''; const typed = prompt('This permanently deletes ' + n + ' and all its data. Type the workspace name to confirm:'); if (typed === null) return; try { await $fetch('/api/platform/orgs/' + id, { method: 'DELETE', body: { confirm: typed } }); await navigateTo('/platform/customers') } catch (e) { alert((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.') } }
const inv = reactive({ open: false, full_name: '', email: '', subject: '', message: '', send: true, busy: false, msg: '', ok: false })
function openInvite() {
  const n = data.value?.org.name ?? 'your company'
  Object.assign(inv, { open: true, msg: '', ok: false, send: true, full_name: inv.full_name || '', email: inv.email || '', subject: 'Your Finvry workspace for ' + n + ' is ready',
    message: 'Hi,\n\nWe have moved ' + n + "'s company services from Aidi Ventures to Finvry. Your filings, renewals, compliance calendar and invoices are now in one place, and you can message our team from there.\n\nSign in at https://app.finvry.com/login with this email address. We will send you a one-time code; there is no password.\n\nThe Aidi team" })
}
async function sendInvite() { inv.busy = true; inv.msg = ''; try { const r = await $fetch<{ emailed: boolean }>('/api/platform/orgs/' + id + '/invite', { method: 'POST', body: { full_name: inv.full_name, email: inv.email, subject: inv.subject, message: inv.message, send: inv.send } }); inv.ok = true; inv.msg = inv.send ? (r.emailed ? 'Access given and invitation sent.' : 'Access given, but the email could not be sent. Try again later.') : 'Access given. Send the invitation whenever you are ready.' } catch (e) { inv.ok = false; inv.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not invite.' } finally { inv.busy = false } }
async function supportSignIn() { if (!confirm('Sign in to ' + (data.value?.org.name ?? 'this workspace') + ' as its owner? You will act as them until you return to the console. This is recorded.')) return; try { await $fetch('/api/platform/orgs/' + id + '/impersonate', { method: 'POST' }); window.location.href = '/' } catch (e) { alert((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not sign in.') } }
const raiseFee = ref(4)
watchEffect(() => { if (data.value?.org.raise_fee_pct != null) raiseFee.value = data.value.org.raise_fee_pct })
async function setRaise(enabled: boolean) { await $fetch('/api/platform/orgs/' + id + '/raise', { method: 'POST', body: { enabled, fee_pct: raiseFee.value } }); await refresh() }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/platform/customers" class="back">← Customers</NuxtLink>
    <p class="label">{{ data.org.slug }} · {{ data.org.brand === 'aidi' ? 'Aidi' : 'Finvry' }}</p>
    <div class="cuh"><h1>{{ data.org.name }}</h1><div class="cua"><button v-if="data.org.kind === 'company'" type="button" class="btn secondary" @click="supportSignIn">Sign in as owner</button><button v-if="data.org.plan_code !== 'internal'" type="button" class="btn" @click="openInvite">Invite owner</button><button v-if="data.org.plan_code !== 'internal'" type="button" class="btn secondary danger" @click="delOrg">Delete workspace</button></div></div>
    <div v-if="data.org.kind === 'company'" class="card raisec"><div><b>Managed fundraising</b><p>We run the raise for this company: investor list, outreach, meetings and closing. The founder sees progress in Finvry. Success fee on money closed.</p></div>
      <div class="rr"><label class="sw"><input type="checkbox" :checked="data.org.raise_enabled" @change="setRaise(($event.target as HTMLInputElement).checked)"> {{ data.org.raise_enabled ? 'On' : 'Off' }}</label><label class="fee">Fee %<input v-model.number="raiseFee" type="number" min="0" max="30" step="0.5" @change="data.org.raise_enabled && setRaise(true)"></label><NuxtLink v-if="data.org.raise_enabled" to="/services/raise" class="lk">Open in the desk →</NuxtLink></div></div>
    <AppModal :open="inv.open" title="Invite the owner" wide @close="inv.open = false">
      <form id="invf" class="invf" @submit.prevent="sendInvite">
        <label class="label">Name<input v-model="inv.full_name" required maxlength="200"></label>
        <label class="label">Email<input v-model="inv.email" type="email" required maxlength="254"></label>
        <label class="label w">Subject<input v-model="inv.subject" required maxlength="200"></label>
        <label class="label w">Message<textarea v-model="inv.message" rows="10" maxlength="5000" /></label>
        <label class="cb w"><input v-model="inv.send" type="checkbox"> Send the email now (untick to give access only, and send later)</label>
        <p class="hint w">They get admin access to {{ data.org.name }} and sign in with a one-time code sent to this email. No password.</p>
        <p v-if="inv.msg" :class="inv.ok ? 'okm w' : 'error w'">{{ inv.msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="inv.open = false">Close</button><button class="btn" type="submit" form="invf" :disabled="inv.busy">{{ inv.busy ? 'Working…' : inv.send ? 'Give access and send' : 'Give access' }}</button></template>
    </AppModal>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="grid">
      <div class="col">
        <form class="card frm" @submit.prevent="save">
          <h2>Subscription</h2>
          <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
          <label class="label">Plan<select v-model="f.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.code === f.plan_code || x.code.startsWith('company_') || (data!.org.brand === 'aidi' && x.code === 'internal'))" :key="p.code" :value="p.code">{{ p.name }}{{ p.active ? '' : ' (inactive)' }}</option></select></label>
          <label class="label">Status<select v-model="f.status"><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label>
          <label v-if="f.status === 'trial'" class="label">Trial ends<input v-model="f.trial_ends_at" type="date"></label>
          <button class="btn" type="submit" :disabled="busy">Save</button>
          <p class="hint">List price {{ data.org.price ? '$' + Number(data.org.price).toLocaleString() + ' / month' : 'not set' }}. <NuxtLink :to="'/platform/billing?org=' + data.org.id">Subscription and invoices →</NuxtLink></p>
        </form>
        <div class="card">
          <h2>Platform actions</h2>
          <ul class="log"><li v-for="(l, i) in data.log" :key="i"><b>{{ ACT[l.action] ?? l.action }}</b><span>{{ l.by_name ?? 'Platform' }} · {{ when(l.at) }}</span></li></ul>
          <p class="hint">These also appear in the customer's own audit trail.</p>
        </div>
      </div>
      <div class="col">
        <div class="card">
          <h2>Usage</h2>
          <div class="u"><span>Seats</span><b>{{ data.usage.seats }}{{ data.org.seat_limit ? ' of ' + data.org.seat_limit : '' }}</b><i><s :style="{ width: pct(data.usage.seats, data.org.seat_limit) + '%' }" /></i></div>
          <div class="u"><span>Storage</span><b>{{ gb(data.usage.storage) }} GB{{ data.org.storage_gb ? ' of ' + data.org.storage_gb : '' }}</b><i><s :style="{ width: pct(data.usage.storage / 1024 ** 3, data.org.storage_gb) + '%' }" /></i></div>
          <div class="u"><span>AI runs this month</span><b>{{ data.usage.ai }}{{ data.org.ai_runs_month ? ' of ' + data.org.ai_runs_month : '' }}</b><i><s :style="{ width: pct(data.usage.ai, data.org.ai_runs_month) + '%' }" /></i></div>
          <p class="meta">Last activity {{ when(data.usage.last_activity) }} · created {{ when(data.org.created_at) }}<template v-if="data.usage.modules_off"> · {{ data.usage.modules_off }} module{{ data.usage.modules_off === 1 ? '' : 's' }} switched off</template></p>
        </div>
        <div class="card">
          <h2>Admins</h2>
          <ul class="log"><li v-for="a in data.admins" :key="a.email"><b>{{ a.name }}</b><span>{{ a.email }} · last sign-in {{ when(a.last_login_at) }}</span></li></ul>
          <p class="hint">Contact details for account management. The customer's own data is not visible here.</p>
          <template v-if="data.cards.length"><h2 class="mt2">Saved cards</h2>
            <ul class="log"><li v-for="(c, i) in data.cards" :key="i"><b>{{ c.brand ?? 'Card' }} •••• {{ c.last4 ?? '????' }}<template v-if="c.is_default"> · default</template></b><span>{{ c.provider === 'stripe' ? 'Stripe' : 'Paystack' }}<template v-if="c.exp_month"> · expires {{ c.exp_month }}/{{ c.exp_year }}</template></span></li></ul></template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 16px; } h2 { margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 20px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .frm .btn { align-self: flex-start; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.u { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; margin-bottom: 12px; font-size: 13px; } .u b { font-weight: 500; }
.u i { grid-column: 1 / -1; height: 6px; background: var(--c-paper); display: block; } .u s { display: block; height: 100%; background: var(--c-blue); text-decoration: none; }
.meta { font-size: 12.5px; color: var(--c-muted); margin: 6px 0 0; }
.log { list-style: none; padding: 0; margin: 0; } .log li { padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .log b { display: block; font-weight: 500; color: var(--c-navy); font-size: 14px; } .log span { font-size: 12px; color: var(--c-muted); }
.hint { font-size: 12px; color: var(--c-muted); margin: 8px 0 0; } .mt2 { margin-top: 18px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
.cuh { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .danger { color: var(--c-danger); }
.cua { display: flex; gap: 8px; } .invf { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .invf .w { grid-column: 1 / -1; } .invf label.label { display: flex; flex-direction: column; gap: 6px; } .invf input, .invf textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .invf .cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .invf .cb input { width: auto; } .hint { font-size: 12.5px; color: var(--c-muted); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.raisec { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin: 12px 0; } .raisec p { margin: 4px 0 0; font-size: 13px; color: var(--c-muted); max-width: 560px; } .rr { display: flex; gap: 14px; align-items: center; } .sw { display: flex; gap: 6px; align-items: center; font-weight: 600; } .sw input { width: 18px; height: 18px; } .fee { display: flex; gap: 6px; align-items: center; font-size: 13px; } .fee input { width: 64px; font: inherit; padding: 5px 7px; border: 1px solid var(--c-rule-strong); } .lk { color: var(--c-blue-deep); text-decoration: none; font-size: 13px; }
</style>
