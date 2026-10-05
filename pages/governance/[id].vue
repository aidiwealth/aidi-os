<script setup lang="ts">
const id = useRoute().params.id as string
interface Party { id: string; name: string; email: string | null; role: string; share_pct: string | null; notes: string | null; start_date: string | null; end_date: string | null; active: boolean; has_account: boolean }
interface Res { id: string; kind: string; title: string; status: string; required_approvals: number; meeting_date: string | null; amount: string | null; currency: string | null; beneficiary: string | null; created_at: string; approvals: number; rejections: number }
const { data, error, refresh } = await useFetch<{ entity: { id: string; name: string; kind: string; jurisdiction: string | null }; parties: Party[]; resolutions: Res[]; signers: { name: string; email: string; user_id: string | null }[] }>('/api/governance/entities/' + id)
const { data: docs } = await useFetch<{ id: string; title: string }[]>('/api/documents')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const canManageParties = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'family'].includes(r)))
useHead({ title: () => (data.value?.entity.name ?? 'Entity') + ' — governance' })
const ROLE: Record<string, string> = { settlor: 'Settlor', trustee: 'Trustee', successor_trustee: 'Successor trustee', protector: 'Protector', beneficiary: 'Beneficiary', director: 'Director', officer: 'Officer', member: 'Member', shareholder: 'Shareholder', signatory: 'Signatory' }
const SIGN = ['trustee', 'protector', 'director', 'signatory', 'member']
const RK: Record<string, string> = { resolution: 'Resolution', minutes: 'Minutes', distribution: 'Distribution', consent: 'Written consent' }
const ST: Record<string, string> = { draft: 'Draft', circulating: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const msg = ref(''); const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }

const pf = reactive({ id: '', name: '', email: '', role: 'trustee', share_pct: '', notes: '', start_date: '', end_date: '' })
const partyOpen = ref(false)
function editParty(p?: Party) { Object.assign(pf, p ? { id: p.id, name: p.name, email: p.email ?? '', role: p.role, share_pct: p.share_pct ?? '', notes: p.notes ?? '', start_date: p.start_date ?? '', end_date: p.end_date ?? '' } : { id: '', name: '', email: '', role: 'trustee', share_pct: '', notes: '', start_date: '', end_date: '' }); partyOpen.value = true }
async function saveParty() {
  msg.value = ''
  try { await $fetch('/api/governance/parties', { method: 'POST', body: { ...pf, entity_id: id, id: pf.id || undefined } }); partyOpen.value = false; await refresh() }
  catch (e) { msg.value = errText(e) }
}

const rf = reactive({ kind: 'resolution', title: '', body: '', required_approvals: '', meeting_date: '', amount: '', currency: 'USD', beneficiary_id: '', document_id: '' })
const resOpen = ref(false)
const beneficiaries = computed(() => (data.value?.parties ?? []).filter((p) => p.role === 'beneficiary' && p.active))
const majority = computed(() => Math.floor((data.value?.signers.length ?? 0) / 2) + 1)
async function draft() {
  msg.value = ''
  try {
    const r = await $fetch<{ id: string }>('/api/governance/resolutions', { method: 'POST', body: { entity_id: id, kind: rf.kind, title: rf.title, body: rf.body, required_approvals: rf.required_approvals || undefined, meeting_date: rf.meeting_date || undefined, amount: rf.kind === 'distribution' ? rf.amount : undefined, currency: rf.kind === 'distribution' ? rf.currency : undefined, beneficiary_id: rf.kind === 'distribution' ? rf.beneficiary_id : undefined, document_id: rf.document_id || undefined } })
    await navigateTo('/governance/resolutions/' + r.id)
  } catch (e) { msg.value = errText(e) }
}
const money = (v: string | null, c: string | null) => (v && c ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: c }).format(Number(v)) : '')
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/governance" class="back">← Trusts &amp; governance</NuxtLink>
    <p class="label">{{ data.entity.kind }}<template v-if="data.entity.jurisdiction"> · {{ data.entity.jurisdiction }}</template></p>
    <h1>{{ data.entity.name }}</h1>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>

    <div class="card">
      <div class="row"><h2>Register</h2><button v-if="canManageParties" class="btn sm" type="button" @click="editParty()">Add person</button></div>
      <p class="muted small">{{ data.signers.length }} current signator{{ data.signers.length === 1 ? 'y' : 'ies' }}<template v-if="data.signers.length"> ({{ data.signers.filter((s) => s.user_id).length }} with an account)</template>. Signatories approve by signing in with the email recorded here.</p>
      <form v-if="partyOpen" class="frm" @submit.prevent="saveParty">
        <label class="label">Name<input v-model="pf.name" required maxlength="200"></label>
        <label class="label">Role<select v-model="pf.role"><option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Email{{ SIGN.includes(pf.role) ? ' (required to sign)' : '' }}<input v-model="pf.email" type="email" maxlength="254"></label>
        <label class="label">Share or interest (%)<input v-model="pf.share_pct" inputmode="decimal" placeholder="optional"></label>
        <label class="label">From<input v-model="pf.start_date" type="date"></label>
        <label class="label">Until (ends the role)<input v-model="pf.end_date" type="date"></label>
        <label class="label wide">Notes<input v-model="pf.notes" maxlength="1000"></label>
        <div class="row"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" @click="partyOpen = false">Cancel</button></div>
      </form>
      <table v-if="data.parties.length" class="table">
        <thead><tr><th>Name</th><th>Role</th><th>Interest</th><th>Since</th><th /></tr></thead>
        <tbody><tr v-for="p in data.parties" :key="p.id" :class="{ off: !p.active }">
          <td><b>{{ p.name }}</b><span class="sub">{{ p.email ?? 'no email' }}<template v-if="SIGN.includes(p.role) && p.email && !p.has_account"> · no account yet</template></span></td>
          <td>{{ ROLE[p.role] }}<span v-if="SIGN.includes(p.role)" class="tag">signs</span></td>
          <td>{{ p.share_pct ? Number(p.share_pct) + '%' : '—' }}</td>
          <td class="muted">{{ day(p.start_date) || '—' }}<span v-if="!p.active" class="sub">until {{ day(p.end_date) }}</span></td>
          <td><button v-if="canManageParties" type="button" class="link" @click="editParty(p)">Edit</button></td>
        </tr></tbody>
      </table>
      <EmptyState v-else compact icon="governance" title="No one recorded yet. Add the settlor, trustees, protector and beneficiaries (or directors and members for a company)" />
    </div>

    <div class="card">
      <div class="row"><h2>Resolutions, minutes and distributions</h2><button class="btn sm" type="button" @click="resOpen = !resOpen">{{ resOpen ? 'Close' : 'New' }}</button></div>
      <form v-if="resOpen" class="frm" @submit.prevent="draft">
        <label class="label">Type<select v-model="rf.kind"><option v-for="(l, k) in RK" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label wide2">Title<input v-model="rf.title" required maxlength="200"></label>
        <template v-if="rf.kind === 'distribution'">
          <label class="label">Beneficiary<select v-model="rf.beneficiary_id" required><option value="" disabled>Choose</option><option v-for="b in beneficiaries" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
          <label class="label">Amount<input v-model="rf.amount" inputmode="decimal" required></label>
          <label class="label">Currency<select v-model="rf.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR']" :key="c" :value="c">{{ c }}</option></select></label>
        </template>
        <label v-if="rf.kind === 'minutes'" class="label">Meeting date<input v-model="rf.meeting_date" type="date"></label>
        <label class="label">Approvals needed<input v-model="rf.required_approvals" type="number" min="1" :max="data.signers.length" :placeholder="'majority (' + majority + ')'"></label>
        <label class="label">Supporting document<select v-model="rf.document_id"><option value="">None</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select></label>
        <label class="label wide">Text<textarea v-model="rf.body" rows="8" required maxlength="20000" placeholder="RESOLVED, that…" /></label>
        <p class="muted small wide">This saves a draft. Circulate it from the next page to email the signatories.</p>
        <div class="row"><button class="btn" type="submit">Save draft</button></div>
      </form>
      <table v-if="data.resolutions.length" class="table">
        <tbody><tr v-for="r in data.resolutions" :key="r.id">
          <td><NuxtLink :to="'/governance/resolutions/' + r.id" class="co">{{ r.title }}</NuxtLink><span class="sub">{{ RK[r.kind] }}<template v-if="r.kind === 'distribution'"> · {{ money(r.amount, r.currency) }} to {{ r.beneficiary }}</template> · {{ day(r.created_at) }}</span></td>
          <td><span class="st" :data-s="r.status">{{ ST[r.status] }}</span><span class="sub">{{ r.approvals }} of {{ r.required_approvals }} approvals<template v-if="r.rejections"> · {{ r.rejections }} rejected</template></span></td>
        </tr></tbody>
      </table>
      <EmptyState v-else compact icon="governance" title="None yet" />
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Not found.' : 'Could not load.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.label { } h1 { margin-bottom: 16px; } h2 { margin: 0; }
.card { margin-bottom: 16px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin: 12px 0 18px; padding: 16px; background: var(--c-paper); border: 1px solid var(--c-rule); border-radius: var(--radius); }
.frm label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; } .wide2 { grid-column: span 2; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; margin-top: 8px; }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); }
td { padding: 11px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } tr.off td { opacity: .5; }
b { color: var(--c-navy); font-weight: 500; } .co { color: var(--c-navy); font-weight: 500; text-decoration: none; }
.sub { display: block; font-size: 12px; color: var(--c-muted); }
.tag { margin-left: 6px; font-size: 10.5px; color: var(--c-blue-deep); background: #eef4f9; padding: 1px 6px; }
.st { font-weight: 500; } .st[data-s="approved"] { color: var(--c-ok); } .st[data-s="rejected"] { color: var(--c-danger); } .st[data-s="circulating"] { color: var(--c-blue-deep); } .st[data-s="withdrawn"], .st[data-s="draft"] { color: var(--c-muted); }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0 0 8px; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .frm { grid-template-columns: 1fr; } .wide2 { grid-column: auto; } }
</style>
