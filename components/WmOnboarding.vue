<script setup lang="ts">
// Wealth onboarding for staff: who is waiting for approval, who is still in the conversation, and who has finished;
// each with what they told us, the conversation itself and the documents. Approving a website request opens the
// investing account, emails the client and opens their dashboard.
interface Item { id: string; client_id: string; name: string; email: string | null; country: string; source: string; status: string; step: string; messages: { role: string; text: string; at: string }[]; request: Record<string, any>; account_status: string | null; account_note: string | null; created_at: string; updated_at: string; submitted_at: string | null; decision_note: string | null; docs: number; invited_by: string | null; minutes: number | null; summary: Record<string, any> }
const { data, refresh } = await useFetch<{ items: Item[]; counts: { waiting: number; talking: number; opened: number } }>('/api/wm/onboarding', { key: 'wm-onb' })
const sel = ref(''); const open = computed(() => data.value?.items.find((x) => x.id === sel.value) ?? data.value?.items.find((x) => x.status === 'submitted') ?? null)
const conv = ref<Item | null>(null)
const busy = ref(''), msg = ref(''), ok = ref(''), note = ref('')
const money = (v: number | null | undefined, c = 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(v)))
const AMT: Record<string, string> = { under_50k: 'Under $50k', '50k_250k': '$50k – $250k', '250k_1m': '$250k – $1M', over_1m: 'Over $1M' }
const ACCT: Record<string, string> = { opened: 'Account open', waiting: 'Opens on approval', failed: 'Account not opened', held: 'Disclosure: needs details', not_needed: 'No account step' }
const STEP: Record<string, string> = { household: 'About you', income: 'Money in', spending: 'Money out', assets: 'What they own', debts: 'Debts', goals: 'Goals', risk_level: 'Risk level', identity: 'Account: identity', ssn: 'Account: SSN', address: 'Account: address', funding: 'Account: funding', disclosures: 'Account: checks', agree: 'Account: agreements', bvn: 'Wallet: BVN' }
const statusOf = (x: Item) => (x.status === 'submitted' ? 'Waiting for approval' : x.status === 'in_progress' ? 'At ' + (STEP[x.step] ?? (x.step.startsWith('risk_') ? 'Risk questions' : x.step)) : x.status === 'done' ? 'Dashboard open' : 'Declined')
async function act(x: Item, action: string) {
  if (action === 'decline' && !await askConfirm('Decline ' + x.name + '? They get a kind email and their identity details are deleted.')) return
  busy.value = action + x.id; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ opened?: boolean }>('/api/wm/onboarding/' + x.id, { method: 'POST', body: { action, note: note.value } }); ok.value = action === 'approve' ? (r.opened === false ? 'Approved. The investing account did not open: see the note and retry.' : 'Approved: the client has been emailed and their dashboard is open.') : action === 'decline' ? 'Declined and emailed.' : action === 'resend' ? 'Link sent again.' : r.opened ? 'Account opened.' : 'The account still did not open: see the note.'; note.value = ''; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.' } finally { busy.value = '' }
}
const link = computed(() => (import.meta.client ? location.origin : '') + '/aidi-wealth')
async function copyLink() { try { await navigator.clipboard.writeText(link.value); ok.value = 'Request link copied: ' + link.value } catch { ok.value = link.value } }
const ago = (d: string) => { const m = Math.round((Date.now() - Date.parse(d)) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago' }
</script>
<template>
  <div v-if="data" class="wo">
    <div class="tb"><p class="mut">Clients set up their plan, risk level and account in a conversation. Invited clients go straight to their dashboard; requests from the website wait here for approval.</p><button class="btn secondary sm" @click="copyLink">Copy request link</button></div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div class="kp"><div class="k"><span>Waiting for approval</span><b>{{ data.counts.waiting }}</b></div><div class="k"><span>In the conversation</span><b>{{ data.counts.talking }}</b></div><div class="k"><span>Opened in 30 days</span><b>{{ data.counts.opened }}</b></div></div>
    <div class="card tc"><table v-if="data.items.length" class="table" data-nosearch><thead><tr><th>Client</th><th>To invest</th><th>Risk level</th><th>Status</th><th>Account</th><th /></tr></thead>
      <tbody><tr v-for="x in data.items" :key="x.id" :class="{ sel: open?.id === x.id }" @click="sel = x.id"><td><b>{{ x.name }}</b><span class="s">{{ x.source === 'request' ? 'Website request' : 'Invited' + (x.invited_by ? ' by ' + x.invited_by : '') }} · {{ x.country === 'US' ? 'United States' : 'Nigeria' }} · {{ ago(x.updated_at) }}</span></td>
        <td>{{ AMT[x.request?.amount] ?? '—' }}</td><td>{{ x.summary.risk ?? '—' }}</td><td><span class="tag" :class="{ warn: x.status === 'submitted', blue: x.status === 'done' }">{{ statusOf(x) }}</span></td><td><span :class="{ red: x.account_status === 'failed' || x.account_status === 'held' }">{{ x.account_status ? ACCT[x.account_status] : '—' }}</span></td>
        <td class="n"><button class="lk" @click.stop="conv = x">Conversation</button></td></tr></tbody></table>
      <EmptyState v-else icon="users" title="No one onboarding yet" text="Invite a client from their page, or share the request link." /></div>
    <div v-if="open" class="card rv">
      <div><div class="h"><h3>{{ open.name }}</h3><NuxtLink :to="'/wealth-mgmt/clients/' + open.client_id" class="lk">Open the client →</NuxtLink></div>
        <div class="g3"><div><span>Income a month</span><b>{{ money(open.summary.income, open.summary.currency) }}</b></div><div><span>Savings rate</span><b>{{ open.summary.rate != null ? Math.round(open.summary.rate * 100) + '%' : '—' }}</b></div><div><span>Owns</span><b>{{ money(open.summary.owns, open.summary.currency) }}</b></div></div>
        <p class="mut">{{ open.summary.household ? open.summary.household.adults + ' adult' + (open.summary.household.adults === 1 ? '' : 's') + (open.summary.household.children ? ', ' + open.summary.household.children + ' children' : '') + (open.summary.household.location ? ' · ' + open.summary.household.location : '') + '. ' : '' }}{{ open.summary.goals?.length ? 'Goals: ' + open.summary.goals.join(', ') + '. ' : '' }}{{ open.summary.debts ? 'Debts ' + money(open.summary.debts, open.summary.currency) + '. ' : '' }}{{ open.request?.help?.length ? 'Wants help with ' + open.request.help.join(', ') + '.' : '' }}{{ open.minutes ? ' Took ' + open.minutes + ' min.' : '' }}</p>
        <div class="row"><button class="lk" @click="conv = open">Read the conversation</button><NuxtLink :to="'/wealth-mgmt/clients/' + open.client_id" class="lk">Financial plan</NuxtLink><span class="mut">{{ open.docs }} document{{ open.docs === 1 ? '' : 's' }}</span></div>
        <p v-if="open.account_note" class="note">{{ open.account_note }}</p></div>
      <div class="side">
        <template v-if="open.status === 'submitted'"><b>On approval</b><span>1 · {{ open.country === 'US' && open.account_status === 'waiting' ? 'The investing account is sent for the identity check' : 'Nothing to open' }}</span><span>2 · The client gets their sign-in email</span><span>3 · Their dashboard opens with the plan</span>
          <button class="btn" :disabled="!!busy" @click="act(open, 'approve')">{{ busy === 'approve' + open.id ? 'Approving…' : 'Approve and open' }}</button>
          <textarea v-model="note" rows="2" maxlength="1000" placeholder="A line for the client if you decline (optional)" /><button class="btn secondary" :disabled="!!busy" @click="act(open, 'decline')">Not a fit · send a kind note</button></template>
        <template v-else-if="open.status === 'in_progress'"><b>Still in the conversation</b><span class="mut">Last active {{ ago(open.updated_at) }}.</span><button class="btn secondary" :disabled="!!busy" @click="act(open, 'resend')">Send the link again</button><button class="lk red" :disabled="!!busy" @click="act(open, 'decline')">Decline</button></template>
        <template v-else-if="open.status === 'done'"><b>Dashboard open</b><span class="mut">{{ open.account_status ? ACCT[open.account_status] : '' }}</span><button v-if="open.account_status === 'failed' || open.account_status === 'held'" class="btn" :disabled="!!busy" @click="act(open, 'open_account')">Retry opening the account</button></template>
        <template v-else><b>Declined</b><span class="mut">{{ open.decision_note ?? '' }}</span></template>
      </div>
    </div>
    <AppModal :open="!!conv" :title="'Conversation · ' + (conv?.name ?? '')" wide @close="conv = null"><div class="cv"><template v-for="(m, i) in conv?.messages ?? []" :key="i"><p :class="m.role">{{ m.text.replace(/\*\*/g, '') }}</p></template><p v-if="!conv?.messages.length" class="mut">Not started yet.</p></div></AppModal>
  </div>
</template>
<style scoped>
.wo { display: flex; flex-direction: column; gap: 12px; } .tb { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.kp { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .k span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; }
.card { margin: 0; } .tc { padding: 0; overflow-x: auto; } .table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .table th { text-align: left; padding: 10px 14px; } .table td { padding: 11px 14px; border-top: 1px solid var(--c-rule); vertical-align: middle; } tbody tr { cursor: pointer; } tr.sel { background: var(--c-paper-2); } .s { display: block; font-size: 12.5px; color: var(--c-muted); } .n { text-align: right; }
.tag { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); white-space: nowrap; } .tag.warn { background: #fff6e6; color: #7a4a06; } .tag.blue { background: #e6ecf2; color: var(--c-blue-deep); } .red { color: var(--c-danger); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; } .lk.red { color: var(--c-danger); }
.rv { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; } .h { display: flex; justify-content: space-between; align-items: center; } .h h3 { margin: 0; font-size: 15px; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 12px 0; } .g3 span { display: block; font-size: 12.5px; color: var(--c-muted); } .g3 b { font-size: 22px; font-weight: 600; }
.row { display: flex; gap: 14px; align-items: center; margin-top: 10px; flex-wrap: wrap; } .note { margin: 10px 0 0; padding: 8px 12px; background: #fff6e6; color: #7a4a06; font-size: 13px; }
.side { display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--c-rule); padding-left: 20px; font-size: 13px; } .side b { font-size: 14px; } textarea { font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); resize: vertical; }
.cv { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; } .cv p { margin: 0; padding: 8px 12px; font-size: 13.5px; line-height: 1.5; white-space: pre-line; max-width: 85%; } .cv .ai { background: var(--c-paper-2); } .cv .me { background: #e6ecf2; align-self: flex-end; }
@media (max-width: 900px) { .rv { grid-template-columns: 1fr; } .side { border-left: 0; padding-left: 0; } .kp { grid-template-columns: 1fr; } }
</style>
