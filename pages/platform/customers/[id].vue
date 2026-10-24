<script setup lang="ts">
const id = useRoute().params.id as string
const invited = useRoute().query.invited === '1'
interface Mem { user_id: string; name: string; email: string; roles: string }
interface Sup { id: string; reason: string; can_edit: boolean; started_at: string; expires_at: string; ended_at: string | null; by_name: string; as_email: string; changes: number }
interface D { ai?: { weekly_used: number; weekly_limit: number | null; credits: number; blocked: boolean; gifts: { tokens: number; at: string }[] } | null; price?: { code: string; name: string; currency: string; list: number; interval: 'month' | 'year'; free: boolean; override: { free?: boolean; amount?: number; interval?: string; note?: string; set_at?: string; set_by?: string } | null } | null; members?: Mem[]; support?: Sup[]; can_support?: boolean; can_edit?: boolean; agreements?: { id: string; title: string; version: number; status: string; signed_at: string | null; signer_name: string | null; signer_email: string | null }[]; grantable?: { code: string; label: string; plans: string[] }[]; storage?: { plan_gb: number | null; addon_gb: number; extra_gb: number; limit_gb: number | null }; org: { extra_modules?: string[]; raise_enabled?: boolean; raise_fee_pct?: number; id: string; name: string; slug: string; kind: string; status: string; plan_code: string; plan: string; trial_ends: string | null; created_at: string; brand: string; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null; price: string | null }
  usage: { seats: number; storage: number; ai: number; last_activity: string | null; modules_off: number }; admins: { name: string; email: string; last_login_at: string | null }[]; log: { action: string; at: string; detail: Record<string, unknown>; by_name: string | null }[]; cards: { provider: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; is_default: boolean }[] }
const { data, refresh } = await useFetch<D>('/api/platform/orgs/' + id)
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean }[] }>('/api/platform/plans')
useHead({ title: () => 'Finvry · ' + (data.value?.org.name ?? 'Customer') })
const f = reactive({ name: '', plan_code: '', status: '', trial_ends_at: '' })
// What this company pays: list price, its own price (yearly or monthly) or free.
const pr = reactive({ kind: 'list' as 'list' | 'custom' | 'free', amount: 0, interval: 'year' as 'year' | 'month', note: '' }), prMsg = ref('')
watchEffect(() => { const p = data.value?.price; if (p) Object.assign(pr, { kind: p.free ? 'free' : p.override ? 'custom' : 'list', amount: p.override?.amount ?? p.list, interval: p.interval, note: p.override?.note ?? '' }) })
const money = (v: number, c: string) => (c === 'NGN' ? '₦' : '$') + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
async function savePrice() { prMsg.value = ''; try { await $fetch('/api/platform/orgs/' + id + '/price', { method: 'POST', body: pr }); prMsg.value = 'Saved; the plan subscription is updated.'; await refresh() } catch (e) { prMsg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
watchEffect(() => { const o = data.value?.org; if (o) Object.assign(f, { name: o.name, plan_code: o.plan_code, status: o.status, trial_ends_at: o.trial_ends ?? '' }) })
const busy = ref(false); const msg = ref(''); const ok = ref(invited ? 'Workspace created and the admin has been invited.' : '')
async function save() {
  if ((f.status === 'suspended' || f.status === 'closed') && f.status !== data.value?.org.status && !await askConfirm('This signs everyone in ' + f.name + ' out and blocks access until reactivated. Continue?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/platform/orgs/' + id, { method: 'PATCH', body: { name: f.name, plan_code: f.plan_code, status: f.status, trial_ends_at: f.status === 'trial' ? (f.trial_ends_at || null) : undefined } }); ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(2)
const pct = (v: number, max: number | null) => (max ? Math.min(100, (v / max) * 100) : 0)
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never')
const ACT: Record<string, string> = { 'platform.workspace_create': 'Workspace created', 'platform.workspace_update': 'Workspace updated', 'platform.plan_save': 'Plan saved', 'platform.support_signin': 'Logged in as a user (support access)' }
async function delOrg() { const n = data.value?.org.name ?? ''; const typed = await askPrompt('This permanently deletes ' + n + ' and all its data. Type the workspace name to confirm.', '', { ok: 'Delete', required: true, placeholder: n }); if (typed === null) return; try { await $fetch('/api/platform/orgs/' + id, { method: 'DELETE', body: { confirm: typed } }); await navigateTo('/platform/customers') } catch (e) { notify((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.') } }
const inv = reactive({ open: false, full_name: '', email: '', subject: '', message: '', send: true, busy: false, msg: '', ok: false })
function openInvite() {
  const n = data.value?.org.name ?? 'your company'
  Object.assign(inv, { open: true, msg: '', ok: false, send: true, full_name: inv.full_name || '', email: inv.email || '', subject: 'Your Finvry workspace for ' + n + ' is ready',
    message: 'Hi,\n\nWe have moved ' + n + "'s company services from Aidi Ventures to Finvry. Your filings, renewals, compliance calendar and invoices are now in one place, and you can message our team from there.\n\nSign in at https://app.finvry.com/login with this email address. We will send you a one-time code; there is no password.\n\nThe Aidi team" })
}
async function sendInvite() { inv.busy = true; inv.msg = ''; try { const r = await $fetch<{ emailed: boolean }>('/api/platform/orgs/' + id + '/invite', { method: 'POST', body: { full_name: inv.full_name, email: inv.email, subject: inv.subject, message: inv.message, send: inv.send } }); inv.ok = true; inv.msg = inv.send ? (r.emailed ? 'Access given and invitation sent.' : 'Access given, but the email could not be sent. Try again later.') : 'Access given. Send the invitation whenever you are ready.' } catch (e) { inv.ok = false; inv.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not invite.' } finally { inv.busy = false } }
const la = reactive({ open: false, user_id: '', reason: '', can_edit: false, busy: false, msg: '' })
function openLoginAs() { Object.assign(la, { open: true, user_id: data.value?.members?.[0]?.user_id ?? '', reason: '', can_edit: false, msg: '' }) }
async function loginAs() {
  la.busy = true; la.msg = ''
  try { const r = await $fetch<{ redirect?: string }>('/api/platform/orgs/' + id + '/impersonate', { method: 'POST', body: { user_id: la.user_id || null, reason: la.reason, can_edit: la.can_edit } }); window.location.href = r.redirect || '/' }
  catch (e) { la.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open the account.' } finally { la.busy = false }
}
const supState = (x: Sup) => (x.ended_at ? 'ended ' + when(x.ended_at) : Date.parse(x.expires_at) > Date.now() ? 'open until ' + when(x.expires_at) : 'timed out ' + when(x.expires_at))
const raiseFee = ref(4)
watchEffect(() => { if (data.value?.org.raise_fee_pct != null) raiseFee.value = data.value.org.raise_fee_pct })
const featBusy = ref(false)
async function openAgreement(aid: string) { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/platform/agreements/' + aid + '/pdf'); if (w) w.location.href = r.url } catch { w?.close() } }
async function toggleFeature(code: string, on: boolean) { const cur = new Set(data.value?.org.extra_modules ?? []); if (on) cur.add(code); else cur.delete(code); featBusy.value = true; try { await $fetch('/api/platform/orgs/' + id + '/features', { method: 'POST', body: { modules: [...cur] } }); await refresh() } finally { featBusy.value = false } }
async function setRaise(enabled: boolean) { await $fetch('/api/platform/orgs/' + id + '/raise', { method: 'POST', body: { enabled, fee_pct: raiseFee.value } }); await refresh() }
const extraGb = ref(0)
watchEffect(() => { if (data.value?.storage) extraGb.value = data.value.storage.extra_gb })
// Gift AI: tokens added to the workspace's AI credits at no charge.
const gift = reactive({ tokens: 1_000_000, busy: false, msg: '' })
const tk = (n: number) => (n >= 1e6 ? Math.round(n / 1e5) / 10 + 'M' : Math.round(n / 1e3) + 'k')
async function giftAi() {
  if (!await askConfirm('Add ' + tk(gift.tokens) + ' AI tokens to ' + (data.value?.org.name ?? 'this workspace') + ' at no charge? They are used once the plan\'s allowance runs out.', { title: 'Gift AI', ok: 'Gift' })) return
  gift.busy = true; gift.msg = ''
  try { const r = await $fetch<{ credits: number }>('/api/platform/orgs/' + id + '/ai-gift', { method: 'POST', body: { tokens: gift.tokens } }); gift.msg = 'Gifted. ' + tk(r.credits) + ' tokens of credit now.'; await refresh() }
  catch (e) { gift.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not gift. Try again.' } finally { gift.busy = false }
}
async function saveExtra() { await $fetch('/api/platform/orgs/' + id + '/storage', { method: 'POST', body: { extra_gb: Number(extraGb.value) || 0 } }); await refresh() }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/platform/customers" class="back">← Customers</NuxtLink>
    <p class="label">{{ data.org.slug }} · {{ data.org.brand === 'aidi' ? 'Aidi' : 'Finvry' }}</p>
    <div class="cuh"><h1>{{ data.org.name }}</h1><div class="cua"><button v-if="data.can_support && data.org.kind === 'company' && data.org.brand !== 'aidi' && data.members?.length" type="button" class="btn secondary" @click="openLoginAs">Log in as…</button><template v-if="data.can_edit"><button v-if="data.org.plan_code !== 'internal'" type="button" class="btn" @click="openInvite">Invite owner</button><button v-if="data.org.plan_code !== 'internal'" type="button" class="btn secondary danger" @click="delOrg">Delete workspace</button></template></div></div>
    <div v-if="data.org.kind === 'company' && data.can_edit" class="card raisec"><div><b>Managed fundraising</b><p>We run the raise for this company: investor list, outreach, meetings and closing. The founder sees progress in Finvry. Success fee on money closed.</p></div>
      <div class="rr"><label class="sw"><input type="checkbox" :checked="data.org.raise_enabled" @change="setRaise(($event.target as HTMLInputElement).checked)"> {{ data.org.raise_enabled ? 'On' : 'Off' }}</label><label class="fee">Fee %<input v-model.number="raiseFee" type="number" min="0" max="30" step="0.5" @change="data.org.raise_enabled && setRaise(true)"></label><NuxtLink v-if="data.org.raise_enabled" to="/services/raise" class="lk">Open in the desk →</NuxtLink></div></div>
    <div v-if="data.org.kind === 'company' && data.grantable?.length && data.can_edit" class="card feats"><div class="fh"><b>Extra features</b><p>Switch on features from the Startup or Scale plan for this workspace without changing its plan or billing. They stay on if the plan changes.</p></div>
      <div class="fl"><label v-for="g in data.grantable" :key="g.code" class="fi" :class="{ on: data.org.extra_modules?.includes(g.code) }"><input type="checkbox" :disabled="featBusy" :checked="data.org.extra_modules?.includes(g.code)" @change="toggleFeature(g.code, ($event.target as HTMLInputElement).checked)"><span><b>{{ g.label }}</b><em>In {{ g.plans.join(' and ') }}</em></span></label></div></div>
    <div v-if="data.agreements?.length" class="card agr"><b>Signed agreements</b>
      <div v-for="a in data.agreements" :key="a.id" class="agl"><FileBadge name="x.pdf" size="sm" /><span><button type="button" class="lk" :disabled="a.status !== 'signed'" @click="openAgreement(a.id)">{{ a.title }}</button><em>{{ a.status === 'signed' ? 'Signed by ' + a.signer_name + (a.signer_email ? ' (' + a.signer_email + ')' : '') + ' · ' + new Date(a.signed_at!).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Waiting for signature' }} · v{{ a.version }}</em></span></div></div>
    <AppModal :open="la.open" :title="'Log in as someone at ' + data.org.name" @close="la.open = false">
      <form id="laf" class="laf" @submit.prevent="loginAs">
        <label class="label">Person<select v-model="la.user_id" required><option v-for="m in data.members" :key="m.user_id" :value="m.user_id">{{ m.name }} · {{ m.email }}{{ m.roles ? ' (' + m.roles + ')' : '' }}</option></select></label>
        <label class="label">Why you need access<textarea v-model="la.reason" rows="3" required minlength="3" maxlength="500" placeholder="e.g. They asked us why the retention page shows no figures for June" /></label>
        <label class="cb"><input v-model="la.can_edit" type="checkbox" :disabled="!data.can_edit"> Allow changes <span class="hint">{{ data.can_edit ? 'Off: you can look but not change anything.' : 'Support staff can only look.' }}</span></label>
        <p class="hint">Opens Finvry as this person for 30 minutes, in a new session; your console stays signed in. Money, plan and billing, keys, team and sign-in settings and signing documents are never available. The visit, your reason{{ la.can_edit ? ' and every change' : '' }} are recorded here under Support access; the customer is not shown it.</p>
        <p v-if="la.msg" class="error">{{ la.msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="la.open = false">Cancel</button><button class="btn" type="submit" form="laf" :disabled="la.busy || la.reason.trim().length < 3">{{ la.busy ? 'Opening…' : la.can_edit ? 'Log in, changes allowed' : 'Log in, view only' }}</button></template>
    </AppModal>
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
        <p v-if="!data.can_edit" class="ro">View only. Ask a Finvry console owner to change this account.</p>
        <form class="card frm" @submit.prevent="save"><fieldset :disabled="!data.can_edit" class="fs">
          <h2>Subscription</h2>
          <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
          <label class="label">Plan<select v-model="f.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.code === f.plan_code || x.code.startsWith('company_') || (data!.org.brand === 'aidi' && x.code === 'internal'))" :key="p.code" :value="p.code">{{ p.name }}{{ p.active ? '' : ' (inactive)' }}</option></select></label>
          <label class="label">Status<select v-model="f.status"><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label>
          <label v-if="f.status === 'trial'" class="label">Trial ends<input v-model="f.trial_ends_at" type="date"></label>
          <button v-if="data.can_edit" class="btn" type="submit" :disabled="busy">Save</button>
          <p class="hint">List price {{ data.org.price ? '$' + Number(data.org.price).toLocaleString() + ' / month' : 'not set' }}. <NuxtLink :to="'/platform/billing?org=' + data.org.id">Subscription and invoices →</NuxtLink></p>
        </fieldset></form>
        <form v-if="data.price" class="card frm" @submit.prevent="savePrice"><fieldset :disabled="!data.can_edit" class="fs">
          <h2>Price</h2>
          <p class="hint">Pays now: <b>{{ data.price.free ? 'Free' : money(data.price.list, data.price.currency) + (data.price.interval === 'year' ? ' a year' : ' a month') }}</b>{{ data.price.override ? ' · own price' + (data.price.override.note ? ': ' + data.price.override.note : '') + (data.price.override.set_by ? ' (' + data.price.override.set_by + ', ' + data.price.override.set_at + ')' : '') : ' · ' + data.price.name + ' list price, billed ' + (data.price.interval === 'year' ? 'yearly' : 'monthly') }}</p>
          <div class="pk"><label><input v-model="pr.kind" type="radio" value="list"> Plan list price</label><label><input v-model="pr.kind" type="radio" value="custom"> Its own price</label><label><input v-model="pr.kind" type="radio" value="free"> Free</label></div>
          <div v-if="pr.kind === 'custom'" class="two"><label class="label">Amount ({{ data.price.currency }})<input v-model.number="pr.amount" type="number" min="0.01" step="0.01" required></label><label class="label">Billed<select v-model="pr.interval"><option value="year">Yearly</option><option value="month">Monthly</option></select></label></div>
          <label v-if="pr.kind !== 'list'" class="label">Why (shown here only)<input v-model="pr.note" maxlength="200" placeholder="e.g. Founding customer, partner programme"></label>
          <button v-if="data.can_edit" class="btn" type="submit" :disabled="busy">Save price</button><p v-if="prMsg" class="hint">{{ prMsg }}</p>
        </fieldset></form>
        <div class="card">
          <h2>Platform actions</h2>
          <ul class="log"><li v-for="(l, i) in data.log" :key="i"><b>{{ ACT[l.action] ?? l.action }}</b><span>{{ l.by_name ?? 'Platform' }} · {{ when(l.at) }}</span></li></ul>
          <p class="hint">These also appear in the customer's own audit trail.</p>
        </div>
        <div v-if="data.support?.length" class="card">
          <h2>Support access</h2>
          <ul class="log"><li v-for="x in data.support" :key="x.id"><b>{{ x.by_name }} as {{ x.as_email }} · {{ x.can_edit ? 'changes allowed' + (x.changes ? ', ' + x.changes + ' made' : ', none made') : 'view only' }}</b><span>{{ when(x.started_at) }} · {{ supState(x) }} · {{ x.reason }}</span></li></ul>
          <p class="hint">Kept for the Finvry team only; the customer is not shown these visits.</p>
        </div>
      </div>
      <div class="col">
        <div class="card">
          <h2>Usage</h2>
          <div class="u"><span>Seats</span><b>{{ data.usage.seats }}{{ data.org.seat_limit ? ' of ' + data.org.seat_limit : '' }}</b><i><s :style="{ width: pct(data.usage.seats, data.org.seat_limit) + '%' }" /></i></div>
          <div class="u"><span>Storage</span><b>{{ gb(data.usage.storage) }} GB{{ data.storage?.limit_gb != null ? ' of ' + data.storage.limit_gb : '' }}</b><i><s :style="{ width: pct(data.usage.storage / 1024 ** 3, data.storage?.limit_gb ?? data.org.storage_gb) + '%' }" /></i></div>
          <p v-if="data.storage" class="meta">Plan {{ data.storage.plan_gb ?? 'unlimited' }}{{ data.storage.plan_gb != null ? ' GB' : '' }}<template v-if="data.storage.addon_gb"> · packs +{{ data.storage.addon_gb }} GB</template> · extra <input v-model.number="extraGb" type="number" min="0" class="xg"> GB <button class="lk" type="button" @click="saveExtra">Save</button></p>
          <div class="u"><span>AI runs this month</span><b>{{ data.usage.ai }}{{ data.org.ai_runs_month ? ' of ' + data.org.ai_runs_month : '' }}</b><i><s :style="{ width: pct(data.usage.ai, data.org.ai_runs_month) + '%' }" /></i></div>
          <template v-if="data.ai">
            <div class="u"><span>AI this week</span><b>{{ tk(data.ai.weekly_used) }}{{ data.ai.weekly_limit ? ' of ' + tk(data.ai.weekly_limit) : '' }} tokens</b><i><s :style="{ width: pct(data.ai.weekly_used, data.ai.weekly_limit) + '%' }" /></i></div>
            <p class="meta">Credits {{ tk(data.ai.credits) }}{{ data.ai.blocked ? ' · AI paused until the allowance resets' : '' }}{{ data.ai.gifts.length ? ' · last gift ' + tk(data.ai.gifts[0].tokens) + ' on ' + when(data.ai.gifts[0].at) : '' }}
              <template v-if="data.can_edit"> · gift <select v-model.number="gift.tokens" class="xg" aria-label="Tokens to gift"><option :value="500000">500k</option><option :value="1000000">1M</option><option :value="5000000">5M</option><option :value="15000000">15M</option></select> <button class="lk" type="button" :disabled="gift.busy" @click="giftAi">{{ gift.busy ? 'Gifting…' : 'Gift AI' }}</button></template></p>
            <p v-if="gift.msg" class="meta">{{ gift.msg }}</p>
          </template>
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
.cua { display: flex; gap: 8px; } .laf { display: flex; flex-direction: column; gap: 12px; } .laf label.label { display: flex; flex-direction: column; gap: 6px; } .laf textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .laf .cb { display: flex; gap: 8px; align-items: baseline; font-size: 14px; flex-wrap: wrap; } .laf .cb input { width: auto; } .invf { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .invf .w { grid-column: 1 / -1; } .invf label.label { display: flex; flex-direction: column; gap: 6px; } .invf input, .invf textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); } .invf .cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .invf .cb input { width: auto; } .hint { font-size: 12.5px; color: var(--c-muted); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.raisec { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin: 12px 0; } .raisec p { margin: 4px 0 0; font-size: 13px; color: var(--c-muted); max-width: 560px; } .rr { display: flex; gap: 14px; align-items: center; } .sw { display: flex; gap: 6px; align-items: center; font-weight: 600; } .sw input { width: 18px; height: 18px; } .fee { display: flex; gap: 6px; align-items: center; font-size: 13px; } .fee input { width: 64px; font: inherit; padding: 5px 7px; border: 1px solid var(--c-rule-strong); } .lk { color: var(--c-blue-deep); text-decoration: none; font-size: 13px; }
.xg { width: 64px; font: inherit; font-size: 12.5px; padding: 2px 6px; border: 1px solid var(--c-rule-strong); } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; }
.feats { margin: 12px 0; display: flex; flex-direction: column; gap: 12px; } .fh p { margin: 4px 0 0; font-size: 13px; color: var(--c-muted); max-width: 720px; } .fl { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; } .fi { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--c-rule); padding: 10px 12px; cursor: pointer; } .fi.on { border-color: var(--c-ok); background: #f1f6fa; } .fi input { margin-top: 3px; } .fi span { display: flex; flex-direction: column; } .fi b { font-size: 14px; font-weight: 500; } .fi em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.agr { margin: 12px 0; display: flex; flex-direction: column; gap: 4px; } .agl { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--c-rule); } .agl span { display: flex; flex-direction: column; } .agl em { font-style: normal; font-size: 12px; color: var(--c-muted); } .agr .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; text-align: left; }
.fs { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; } .fs label { display: flex; flex-direction: column; gap: 6px; } .ro { margin: 0; font-size: 13px; color: var(--c-muted); }
.pk { display: flex; gap: 16px; font-size: 14px; } .pk label { display: flex; gap: 6px; align-items: center; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
