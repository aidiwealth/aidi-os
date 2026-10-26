<script setup lang="ts">
// One trust or company: its register (who holds which role, grouped by what they do) and its papers (resolutions,
// minutes, consents, distributions) with approval progress. Adding people and drafting papers open in a dialog.
const id = useRoute().params.id as string
const route = useRoute(), router = useRouter()
interface Party { id: string; name: string; email: string | null; role: string; share_pct: string | null; notes: string | null; start_date: string | null; end_date: string | null; active: boolean; has_account: boolean }
interface Res { id: string; kind: string; title: string; status: string; required_approvals: number; meeting_date: string | null; amount: string | null; currency: string | null; beneficiary: string | null; created_at: string; approvals: number; rejections: number }
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p804_0, __p804_1, __p804_2] = await Promise.all([
  useFetch<{ entity: { id: string; name: string; legal_name: string | null; kind: string; jurisdiction: string | null; status: string }; parties: Party[]; resolutions: Res[]; signers: { name: string; email: string; user_id: string | null }[] }>('/api/governance/entities/' + id),
  useFetch<{ id: string; title: string }[]>('/api/documents'),
  useFetch<{ roles: string[] }>('/api/auth/me')])
const { data, error, refresh } = __p804_0
const { data: docs } = __p804_1
const { data: me } = __p804_2
const canManageParties = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'family'].includes(r)))
useHead({ title: () => (data.value?.entity.name ?? 'Entity') + ' · governance' })
const ROLE: Record<string, string> = { settlor: 'Settlor', trustee: 'Trustee', successor_trustee: 'Successor trustee', protector: 'Protector', beneficiary: 'Beneficiary', director: 'Director', officer: 'Officer', member: 'Member', shareholder: 'Shareholder', signatory: 'Signatory' }
const SIGN = ['trustee', 'protector', 'director', 'signatory', 'member']
const KIND: Record<string, string> = { holding: 'Holding company', operating: 'Operating company', fund: 'Fund', gp: 'General partner', management_company: 'Management company', trust: 'Trust', household: 'Household', spv: 'SPV', other: 'Entity' }
const RK: Record<string, string> = { resolution: 'Resolution', minutes: 'Minutes', distribution: 'Distribution', consent: 'Written consent' }
const ST: Record<string, string> = { draft: 'Draft', circulating: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const isTrust = computed(() => data.value?.entity.kind === 'trust')
const TABS = computed(() => [['people', 'People'], ['papers', 'Papers']] as const)
const tab = computed(() => (route.query.t === 'papers' ? 'papers' : 'people'))
const go = (t: string) => router.replace({ query: { ...route.query, t } })
const msg = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }

// ---- people ----
const current = computed(() => (data.value?.parties ?? []).filter((p) => p.active))
const former = computed(() => (data.value?.parties ?? []).filter((p) => !p.active))
// Groups in the order a reader looks for them: who controls, who oversees, who benefits or owns.
const GROUPS = computed(() => isTrust.value
  ? [{ k: 'control', t: 'Settlor and trustees', roles: ['settlor', 'trustee', 'successor_trustee'] }, { k: 'oversight', t: 'Protector', roles: ['protector'] }, { k: 'benefit', t: 'Beneficiaries', roles: ['beneficiary'] }, { k: 'other', t: 'Others', roles: ['director', 'officer', 'member', 'shareholder', 'signatory'] }]
  : [{ k: 'control', t: 'Directors and officers', roles: ['director', 'officer'] }, { k: 'owners', t: 'Members and shareholders', roles: ['member', 'shareholder'] }, { k: 'sign', t: 'Signatories', roles: ['signatory'] }, { k: 'other', t: 'Others', roles: ['settlor', 'trustee', 'successor_trustee', 'protector', 'beneficiary'] }])
const grouped = computed(() => GROUPS.value.map((g) => ({ ...g, people: current.value.filter((p) => g.roles.includes(p.role)) })).filter((g) => g.people.length))
const owners = computed(() => current.value.filter((p) => p.share_pct && Number(p.share_pct) > 0))
const ownedPct = computed(() => owners.value.reduce((s, p) => s + Number(p.share_pct), 0))
const signers = computed(() => data.value?.signers ?? [])
const noAccount = computed(() => signers.value.filter((s) => !s.user_id).length)
const QUICK = computed(() => (isTrust.value ? ['settlor', 'trustee', 'protector', 'beneficiary'] : ['director', 'member', 'signatory', 'officer']))
const pct = (v: string | null) => (v ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%' : '')
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')

const pf = reactive({ id: '', name: '', email: '', role: 'trustee', share_pct: '', notes: '', start_date: '', end_date: '' })
const partyOpen = ref(false)
function editParty(p?: Party, role?: string) {
  msg.value = ''
  Object.assign(pf, p ? { id: p.id, name: p.name, email: p.email ?? '', role: p.role, share_pct: p.share_pct ? String(Number(p.share_pct)) : '', notes: p.notes ?? '', start_date: p.start_date ?? '', end_date: p.end_date ?? '' }
    : { id: '', name: '', email: '', role: role ?? (isTrust.value ? 'trustee' : 'director'), share_pct: '', notes: '', start_date: '', end_date: '' })
  partyOpen.value = true
}
async function saveParty() {
  msg.value = ''
  try { await $fetch('/api/governance/parties', { method: 'POST', body: { ...pf, entity_id: id, id: pf.id || undefined } }); partyOpen.value = false; await refresh() }
  catch (e) { msg.value = errText(e) }
}

// ---- papers ----
const rf = reactive({ kind: 'resolution', title: '', body: '', required_approvals: '', meeting_date: '', amount: '', currency: 'USD', beneficiary_id: '', document_id: '' })
const resOpen = ref(false)
function newPaper() { msg.value = ''; resOpen.value = true }
const beneficiaries = computed(() => (data.value?.parties ?? []).filter((p) => p.role === 'beneficiary' && p.active))
const majority = computed(() => Math.floor((signers.value.length) / 2) + 1)
async function draft() {
  msg.value = ''
  try {
    const r = await $fetch<{ id: string }>('/api/governance/resolutions', { method: 'POST', body: { entity_id: id, kind: rf.kind, title: rf.title, body: rf.body, required_approvals: rf.required_approvals || undefined, meeting_date: rf.meeting_date || undefined, amount: rf.kind === 'distribution' ? rf.amount : undefined, currency: rf.kind === 'distribution' ? rf.currency : undefined, beneficiary_id: rf.kind === 'distribution' ? rf.beneficiary_id : undefined, document_id: rf.document_id || undefined } })
    await navigateTo('/governance/resolutions/' + r.id)
  } catch (e) { msg.value = errText(e) }
}
// AI drafting: the trustee says what it should cover; AI writes the paper from the register (names, roles, amounts).
const ai = reactive({ brief: '', busy: false, err: '' })
async function aiDraft() {
  ai.busy = true; ai.err = ''
  try {
    const r = await $fetch<{ title: string; body: string }>('/api/governance/ai-draft', { method: 'POST', body: { entity_id: id, kind: rf.kind, title: rf.title, brief: ai.brief, current: rf.body, meeting_date: rf.meeting_date || undefined, amount: rf.kind === 'distribution' ? rf.amount : undefined, currency: rf.kind === 'distribution' ? rf.currency : undefined, beneficiary_id: rf.kind === 'distribution' ? rf.beneficiary_id : undefined } })
    if (!rf.title) rf.title = r.title
    rf.body = r.body
  } catch (e) { ai.err = errText(e) } finally { ai.busy = false }
}
const BRIEF: Record<string, string> = { resolution: 'e.g. Approve opening a Chase account for the trust and name Emmanuel and Deborah as signatories', minutes: 'e.g. Quarterly trustee meeting: reviewed investments, approved the 2026 budget, agreed to appoint a new tax adviser', consent: 'e.g. Consent to transfer 10% of Telroi LLC units to the trust', distribution: 'e.g. Education support for the autumn term, paid from the trust\'s Chase account' }
const papers = computed(() => data.value?.resolutions ?? [])
const open = computed(() => papers.value.filter((r) => r.status === 'circulating').length)
const approved = computed(() => papers.value.filter((r) => r.status === 'approved').length)
const money = (v: string | null, c: string | null) => (v && c ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)) : '')
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const place = computed(() => { const j = data.value?.entity.jurisdiction; return j ? ({ 'US-DE': 'Delaware, US', 'US-CA': 'California, US', US: 'United States', NG: 'Nigeria', GB: 'United Kingdom' } as Record<string, string>)[j] ?? j : '' })
</script>

<template>
  <section v-if="data" class="ge">
    <NuxtLink to="/governance" class="back">← Trusts &amp; governance</NuxtLink>
    <div class="hd">
      <div>
        <p class="label">{{ KIND[data.entity.kind] ?? data.entity.kind }}<template v-if="place"> · {{ place }}</template></p>
        <h1>{{ data.entity.name }}<span v-if="data.entity.status !== 'active'" class="pill">{{ data.entity.status === 'forming' ? 'Being set up' : data.entity.status === 'dormant' ? 'Dormant' : 'Closed' }}</span></h1>
        <p v-if="data.entity.legal_name && data.entity.legal_name !== data.entity.name" class="mut">Legal name: {{ data.entity.legal_name }}</p>
      </div>
      <div class="acts">
        <button v-if="canManageParties" type="button" class="btn secondary" @click="editParty()">Add person</button>
        <button type="button" class="btn" @click="newPaper">New paper</button>
      </div>
    </div>

    <div class="fx-stats four">
      <StatTile icon="users" tone="n" label="People on the register" :value="current.length" full :note="former.length ? former.length + ' former' : (isTrust ? 'Settlor, trustees, beneficiaries' : 'Directors, members, signatories')" />
      <StatTile icon="check" tone="b" label="Can approve papers" :value="signers.length" full :note="!signers.length ? 'Add a ' + (isTrust ? 'trustee' : 'director or member') + ' with an email' : noAccount ? noAccount + ' still need an account' : 'All can sign in'" />
      <StatTile icon="doc" tone="c" label="Papers" :value="papers.length" full :note="papers.length ? approved + ' approved' : 'None yet'" />
      <StatTile icon="clock" tone="a" label="Awaiting approval" :value="open" full :note="open ? 'Circulating now' : 'Nothing open'" />
    </div>

    <nav class="tabs" aria-label="Sections"><button v-for="t in TABS" :key="t[0]" type="button" :class="{ on: tab === t[0] }" @click="go(t[0])">{{ t[1] }}<span class="ct">{{ t[0] === 'people' ? current.length : papers.length }}</span></button></nav>

    <!-- People -->
    <template v-if="tab === 'people'">
      <div v-if="!current.length" class="card setup">
        <h2>Start the register</h2>
        <p class="mut">{{ isTrust ? 'Add the settlor, trustees and beneficiaries. Signers approve with the email you record.' : 'Add who runs and owns this company. Signers approve with the email you record.' }}</p>
        <div v-if="canManageParties" class="qk"><button v-for="r in QUICK" :key="r" type="button" class="btn secondary" @click="editParty(undefined, r)">Add {{ ROLE[r]!.toLowerCase() }}</button></div>
      </div>
      <div v-else class="pp">
        <div class="pl">
          <div v-for="g in grouped" :key="g.k" class="card grp">
            <h3>{{ g.t }}<span class="n">{{ g.people.length }}</span></h3>
            <div v-for="p in g.people" :key="p.id" class="pr">
              <span class="fx-mono av">{{ initials(p.name) }}</span>
              <div class="pb"><b>{{ p.name }}</b><span>{{ p.email ?? 'No email' }}<template v-if="SIGN.includes(p.role) && p.email && !p.has_account"> · needs an account to sign</template><template v-if="SIGN.includes(p.role) && !p.email"> · add an email to sign</template></span></div>
              <div class="pm"><span class="role">{{ ROLE[p.role] }}</span><em>{{ SIGN.includes(p.role) ? 'Approves papers' : p.role === 'beneficiary' ? 'Can receive distributions' : '' }}</em></div>
              <div class="pi"><b v-if="p.share_pct">{{ pct(p.share_pct) }}</b><em>{{ p.start_date ? 'since ' + day(p.start_date) : '' }}</em></div>
              <button v-if="canManageParties" type="button" class="lk" @click="editParty(p)">Edit</button>
            </div>
          </div>
          <details v-if="former.length" class="card grp fm">
            <summary>Former ({{ former.length }})</summary>
            <div v-for="p in former" :key="p.id" class="pr off">
              <span class="fx-mono av">{{ initials(p.name) }}</span>
              <div class="pb"><b>{{ p.name }}</b><span>{{ ROLE[p.role] }} · until {{ day(p.end_date) }}</span></div>
              <button v-if="canManageParties" type="button" class="lk" @click="editParty(p)">Edit</button>
            </div>
          </details>
        </div>
        <aside class="side">
          <div v-if="owners.length" class="card"><DonutChart :title="isTrust ? 'Interests' : 'Ownership'" total-label="Recorded" :segments="owners.map((p) => ({ label: p.name, value: Number(p.share_pct) }))" />
            <p v-if="Math.round(ownedPct) !== 100" class="mut sm">Recorded interests add up to {{ ownedPct.toLocaleString('en-US', { maximumFractionDigits: 2 }) }}%, not 100%.</p></div>
          <div class="card who">
            <h3>Who approves papers</h3>
            <p class="mut sm">{{ signers.length ? 'Majority (' + majority + ' of ' + signers.length + ') unless set per paper.' : 'No one yet. Papers can be drafted, not approved.' }}</p>
            <div v-for="s in signers" :key="s.email" class="sr"><span>{{ s.name }}</span><em :class="{ warn: !s.user_id }">{{ s.user_id ? 'Can sign in' : 'Needs an account' }}</em></div>
          </div>
        </aside>
      </div>
    </template>

    <!-- Papers -->
    <template v-else>
      <div v-if="papers.length" class="card tw">
        <table class="t" data-nosearch>
          <thead><tr><th>Paper</th><th>Type</th><th>Status</th><th>Approvals</th><th>Created</th></tr></thead>
          <tbody><tr v-for="r in papers" :key="r.id" @click="navigateTo('/governance/resolutions/' + r.id)">
            <td><NuxtLink :to="'/governance/resolutions/' + r.id" class="co" @click.stop>{{ r.title }}</NuxtLink><span v-if="r.kind === 'distribution'" class="sub">{{ money(r.amount, r.currency) }} to {{ r.beneficiary }}</span><span v-else-if="r.meeting_date" class="sub">Meeting {{ day(r.meeting_date) }}</span></td>
            <td>{{ RK[r.kind] ?? r.kind }}</td>
            <td><span class="st" :data-s="r.status">{{ ST[r.status] ?? r.status }}</span></td>
            <td>{{ r.approvals }} of {{ r.required_approvals }}<span v-if="r.rejections" class="sub">{{ r.rejections }} rejected</span></td>
            <td class="mut">{{ day(r.created_at) }}</td>
          </tr></tbody>
        </table>
      </div>
      <div v-else class="card setup">
        <h2>No papers yet</h2>
        <p class="mut">Draft a paper, then circulate it for approval.</p>
        <div class="qk"><button v-for="(l, k) in RK" :key="k" type="button" class="btn secondary" @click="rf.kind = k; newPaper()">New {{ l.toLowerCase() }}</button></div>
      </div>
    </template>

    <AppModal :open="partyOpen" :title="pf.id ? 'Edit ' + pf.name : 'Add to the register'" @close="partyOpen = false">
      <form id="pform" class="frm" @submit.prevent="saveParty">
        <label class="lb">Name<input v-model="pf.name" required maxlength="200"></label>
        <label class="lb">Role<select v-model="pf.role"><option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="lb full">Email<input v-model="pf.email" type="email" maxlength="254"><em>{{ SIGN.includes(pf.role) ? 'Needed to approve papers.' : 'Optional.' }}</em></label>
        <label class="lb">{{ isTrust ? 'Interest' : 'Ownership' }} (%)<input v-model="pf.share_pct" inputmode="decimal" placeholder="Optional"></label>
        <span />
        <label class="lb">From<input v-model="pf.start_date" type="date"></label>
        <label class="lb">Until<input v-model="pf.end_date" type="date"><em>Ends the role on this date.</em></label>
        <label class="lb full">Notes<input v-model="pf.notes" maxlength="1000"></label>
        <p v-if="msg" class="error full">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="partyOpen = false">Cancel</button><button class="btn" type="submit" form="pform">Save</button></template>
    </AppModal>

    <AppModal :open="resOpen" wide title="New paper" @close="resOpen = false">
      <form id="rform" class="frm" @submit.prevent="draft">
        <div class="seg full"><button v-for="(l, k) in RK" :key="k" type="button" :class="{ on: rf.kind === k }" @click="rf.kind = k">{{ l }}</button></div>
        <label class="lb full">Title<input v-model="rf.title" required maxlength="200"></label>
        <template v-if="rf.kind === 'distribution'">
          <label class="lb">Beneficiary<select v-model="rf.beneficiary_id" required><option value="" disabled>{{ beneficiaries.length ? 'Choose' : 'Add a beneficiary first' }}</option><option v-for="b in beneficiaries" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
          <div class="two"><label class="lb">Amount<input v-model="rf.amount" inputmode="decimal" required></label><label class="lb">Currency<select v-model="rf.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR']" :key="c" :value="c">{{ c }}</option></select></label></div>
        </template>
        <label v-if="rf.kind === 'minutes'" class="lb">Meeting date<input v-model="rf.meeting_date" type="date"></label>
        <label class="lb">Approvals needed<input v-model="rf.required_approvals" type="number" min="1" :max="signers.length" :placeholder="'Majority (' + majority + ')'"></label>
        <label class="lb">Supporting document<select v-model="rf.document_id"><option value="">None</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select></label>
        <div class="aib full"><b>✦ Write with AI</b><span>Say what it should cover. Gaps show as [brackets].</span>
          <textarea v-model="ai.brief" rows="2" maxlength="4000" :placeholder="BRIEF[rf.kind]" />
          <div class="aia"><button class="btn secondary sm" type="button" :disabled="ai.busy || (!ai.brief.trim() && !rf.body.trim() && !rf.title.trim())" @click="aiDraft"><AiSpark v-if="ai.busy" /> {{ ai.busy ? 'Writing…' : rf.body.trim() ? 'Improve with AI' : 'Draft with AI' }}</button><span v-if="ai.err" class="error">{{ ai.err }}</span></div></div>
        <div class="lb full">Text<ClientOnly><RichEditor v-model="rf.body" :min-height="260" :max-length="20000" placeholder="RESOLVED, that…" /></ClientOnly></div>
        <p class="mut sm full">Saves a draft. Circulate it to {{ signers.length ? signers.length + ' signator' + (signers.length === 1 ? 'y' : 'ies') : 'the signatories' }} on the next page.</p>
        <p v-if="msg" class="error full">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="resOpen = false">Cancel</button><button class="btn" type="submit" form="rform">Save draft</button></template>
    </AppModal>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Not found.' : 'Could not load.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 13.5px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 2px 0 0; display: flex; align-items: center; gap: 12px; } .acts { display: flex; gap: 8px; }
.pill { font-family: var(--font-body); font-size: 12px; font-weight: 600; padding: 3px 9px; background: var(--c-paper-2); color: var(--c-muted); letter-spacing: 0; }
.four { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 18px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; font-size: 14.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ct { font-size: 11px; font-weight: 600; padding: 0 6px; background: var(--c-paper-2); color: var(--c-muted); }
.setup { display: flex; flex-direction: column; gap: 8px; padding: 26px 28px; } .setup h2 { font-size: 18px; margin: 0; } .setup .mut { max-width: 70ch; font-size: 14px; } .qk { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pp { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; } .pl { display: flex; flex-direction: column; gap: 16px; } .side { display: flex; flex-direction: column; gap: 16px; }
.grp { padding: 4px 20px; } .grp h3 { font-size: 13px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .05em; margin: 14px 0 4px; display: flex; gap: 8px; align-items: center; } .grp .n { font-size: 11px; background: var(--c-paper-2); padding: 0 6px; letter-spacing: 0; }
.pr { display: grid; grid-template-columns: 40px minmax(0, 1.4fr) minmax(0, 1fr) 120px 40px; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--c-rule); } .grp h3 + .pr { border-top: 0; }
.av { width: 38px; height: 38px; font-size: 13px; }
.pb { display: flex; flex-direction: column; min-width: 0; } .pb b { font-size: 14.5px; color: var(--c-ink); font-weight: 600; } .pb span { font-size: 12.5px; color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm { display: flex; flex-direction: column; } .role { font-size: 13.5px; color: var(--c-ink); } .pm em, .pi em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.pi { display: flex; flex-direction: column; text-align: right; } .pi b { font-size: 15px; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; }
.pr.off { grid-template-columns: 40px minmax(0, 1fr) 40px; opacity: .65; }
.fm summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--c-muted); padding: 14px 0; list-style: none; } .fm summary::-webkit-details-marker { display: none; }
.who { display: flex; flex-direction: column; gap: 6px; } .who h3 { font-size: 15px; } .sr { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; color: var(--c-ink); } .sr em { font-style: normal; font-size: 12px; color: var(--c-muted); } .sr em.warn { color: var(--c-warn); }
.tw { padding: 0; overflow-x: auto; }
.t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 10px 18px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.t td { padding: 12px 18px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t tbody tr { cursor: pointer; } .t tbody tr:hover { background: var(--c-paper-3); } .t tbody tr:last-child td { border-bottom: 0; }
.co { color: var(--c-navy); font-weight: 600; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); margin-top: 2px; }
.st { font-size: 12px; font-weight: 600; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .st[data-s="circulating"] { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st[data-s="approved"] { background: var(--c-navy); color: #fff; } .st[data-s="rejected"] { background: #fdecef; color: var(--c-danger); } .st[data-s="withdrawn"], .st[data-s="draft"] { color: var(--c-muted); }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; } .full { grid-column: 1 / -1; } .two { display: grid; grid-template-columns: 1fr 110px; gap: 12px; }
.lb { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .lb em { font-style: normal; font-size: 12px; }
.frm input, .frm select, .frm textarea { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .frm textarea { resize: vertical; }
.seg { display: flex; } .seg button { flex: 1; background: #fff; border: 1px solid var(--c-rule-strong); padding: 8px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 0; } .seg .on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.aib { border: 1px solid var(--c-rule); background: var(--c-paper-2); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--c-muted); } .aib b { color: var(--c-blue-deep); font-size: 13px; } .aia { display: flex; align-items: center; gap: 10px; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 1100px) { .pp { grid-template-columns: 1fr; } }
@media (max-width: 800px) { .four { grid-template-columns: 1fr 1fr !important; } .pr { grid-template-columns: 40px minmax(0, 1fr) 40px; } .pm, .pi { display: none; } .frm { grid-template-columns: 1fr; } }
</style>
