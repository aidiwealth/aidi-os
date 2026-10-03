<script setup lang="ts">
const id = useRoute().params.id as string
interface Res { id: string; entity_id: string; entity: string; kind: string; title: string; body: string; status: string; required_approvals: number; meeting_date: string | null; amount: string | null; currency: string | null; beneficiary: string | null; created_by_name: string | null; created_at: string; circulated_at: string | null; decided_at: string | null }
const { data, error, refresh } = await useFetch<{ resolution: Res; approvals: { decision: string; note: string | null; decided_at: string; name: string; role: string }[]; signers: { name: string; email: string; user_id: string | null }[]; canSign: boolean; canManage: boolean; document: { id: string; title: string } | null }>('/api/governance/resolutions/' + id)
useHead({ title: () => (data.value?.resolution.title ?? 'Resolution') })
const RK: Record<string, string> = { resolution: 'Resolution', minutes: 'Minutes', distribution: 'Distribution', consent: 'Written consent' }
const ST: Record<string, string> = { draft: 'Draft', circulating: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const note = ref('')
const busy = ref(false); const msg = ref(''); const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function act(action: 'circulate' | 'withdraw' | 'approve' | 'reject') {
  if (action === 'withdraw' && !confirm('Withdraw this? It will no longer be open for approval.')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ status?: string }>('/api/governance/resolutions/' + id + '/action', { method: 'POST', body: { action, note: note.value || undefined } })
    ok.value = action === 'circulate' ? 'Circulated. The signatories have been emailed.' : action === 'withdraw' ? 'Withdrawn.' : r.status === 'approved' ? 'Recorded. This is now approved.' : r.status === 'rejected' ? 'Recorded. This can no longer pass and is rejected.' : 'Your response is recorded.'
    note.value = ''; await refresh()
  } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { msg.value = errText(e) } }
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const money = (v: string | null, c: string | null) => (v && c ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: c }).format(Number(v)) : '')
const approvals = computed(() => (data.value?.approvals ?? []).filter((a) => a.decision === 'approve').length)
</script>

<template>
  <section v-if="data">
    <NuxtLink :to="'/governance/' + data.resolution.entity_id" class="back">← {{ data.resolution.entity }}</NuxtLink>
    <p class="label">{{ RK[data.resolution.kind] }} · {{ data.resolution.entity }}</p>
    <h1>{{ data.resolution.title }}</h1>
    <div class="status card" :data-s="data.resolution.status">
      <b>{{ ST[data.resolution.status] }}</b>
      <span>{{ approvals }} of {{ data.resolution.required_approvals }} approvals needed · {{ data.signers.length }} signatories</span>
      <span class="muted">Drafted by {{ data.resolution.created_by_name ?? '—' }} {{ when(data.resolution.created_at) }}<template v-if="data.resolution.circulated_at"> · circulated {{ when(data.resolution.circulated_at) }}</template><template v-if="data.resolution.decided_at"> · decided {{ when(data.resolution.decided_at) }}</template></span>
    </div>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <div class="grid">
      <div class="card doc">
        <p v-if="data.resolution.kind === 'distribution'" class="dist">Distribution of <b>{{ money(data.resolution.amount, data.resolution.currency) }}</b> to <b>{{ data.resolution.beneficiary }}</b></p>
        <p v-if="data.resolution.meeting_date" class="muted">Meeting held {{ data.resolution.meeting_date }}</p>
        <div class="body">{{ data.resolution.body }}</div>
        <p v-if="data.document" class="att">Supporting document: <button type="button" class="link" @click="openDoc(data.document.id)">{{ data.document.title }}</button></p>
      </div>
      <div class="col">
        <div v-if="data.canSign" class="card">
          <h2>Your response</h2>
          <textarea v-model="note" rows="3" maxlength="2000" placeholder="Note (required if you reject)" />
          <div class="row"><button class="btn" type="button" :disabled="busy" @click="act('approve')">Approve</button><button class="btn secondary" type="button" :disabled="busy" @click="act('reject')">Reject</button></div>
        </div>
        <div v-if="data.canManage && ['draft', 'circulating'].includes(data.resolution.status)" class="card">
          <h2>Manage</h2>
          <div class="row">
            <button v-if="data.resolution.status === 'draft'" class="btn" type="button" :disabled="busy" @click="act('circulate')">Circulate for approval</button>
            <button class="btn secondary" type="button" :disabled="busy" @click="act('withdraw')">Withdraw</button>
          </div>
          <p class="muted small">Circulating emails each signatory who has an account.</p>
        </div>
        <div class="card">
          <h2>Signatories</h2>
          <ul class="sig">
            <li v-for="s in data.signers" :key="s.email">
              <span>{{ s.name }}<em v-if="!s.user_id">no account yet</em></span>
              <b v-if="data.approvals.find((a) => a.name === s.name)" :class="data.approvals.find((a) => a.name === s.name)!.decision">{{ data.approvals.find((a) => a.name === s.name)!.decision === 'approve' ? 'Approved' : 'Rejected' }}</b>
              <b v-else class="pend">{{ data.resolution.status === 'circulating' ? 'Waiting' : '—' }}</b>
            </li>
          </ul>
          <ul v-if="data.approvals.some((a) => a.note)" class="notes"><li v-for="(a, i) in data.approvals.filter((x) => x.note)" :key="i"><b>{{ a.name }}:</b> {{ a.note }}</li></ul>
        </div>
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Not found.' : 'Could not load.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 16px; } h2 { margin-bottom: 10px; }
.status { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; border-left: 4px solid var(--c-rule-strong); }
.status b { font-weight: 500; letter-spacing: -0.02em; font-size: 26px; color: var(--c-navy); }
.status[data-s="circulating"] { border-left-color: var(--c-blue); } .status[data-s="approved"] { border-left-color: var(--c-ok); } .status[data-s="approved"] b { color: var(--c-ok); }
.status[data-s="rejected"] { border-left-color: var(--c-danger); } .status[data-s="rejected"] b { color: var(--c-danger); }
.grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 16px; }
.body { white-space: pre-wrap; font-size: 15px; line-height: 1.65; color: var(--c-ink); }
.dist { font-size: 15px; } .att { margin-top: 18px; font-size: 14px; }
textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); width: 100%; resize: vertical; margin-bottom: 10px; }
.row { display: flex; gap: 10px; }
.sig { list-style: none; padding: 0; margin: 0; } .sig li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--c-rule); }
.sig em { display: block; font-style: normal; font-size: 12px; color: var(--c-warn); }
.sig b { font-weight: 500; } .sig b.approve { color: var(--c-ok); } .sig b.reject { color: var(--c-danger); } .sig b.pend { color: var(--c-muted); }
.notes { list-style: none; padding: 0; margin: 12px 0 0; font-size: 13px; } .notes li { padding: 4px 0; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 8px 0 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
