<script setup lang="ts">
// Guarantors (founders/directors) of a borrower and their personal credit. Nigeria: BVN/NIN through CreditChek.
// Elsewhere (e.g. US): enter the score and upload their bureau report (Equifax, Experian, TransUnion, FICO, Credit Karma).
const props = defineProps<{ borrowerId: string }>()
interface Chk { id: string; status: string; score: number | null; band: string | null; note: string | null; source: string | null; document_id: string | null; created_at: string }
interface G { id: string; name: string; email: string | null; relationship: string | null; bvn_last4: string | null; nin_last4: string | null; last_check: Chk | null }
const { data, refresh } = await useFetch<{ country: string | null; nigeria: boolean; rows: G[]; business_reports: Chk[] }>(() => '/api/credit/borrowers/' + props.borrowerId + '/guarantors', { key: 'guar-' + props.borrowerId })
const f = reactive({ open: false, name: '', email: '', phone: '', relationship: 'Founder', bvn: '', nin: '' }); const busy = ref(''); const msg = ref(''); const manual = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function add() { busy.value = 'add'; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/credit/borrowers/' + props.borrowerId + '/guarantors', { method: 'POST', body: { ...f, check: !!data.value?.nigeria } }); Object.assign(f, { open: false, name: '', email: '', phone: '', bvn: '', nin: '' }); await refresh(); if (!data.value?.nigeria) manual.value = r.id } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function act(g: G, action: 'check' | 'delete') { if (action === 'delete' && !confirm('Remove ' + g.name + ' as a guarantor?')) return; busy.value = g.id; msg.value = ''; try { await $fetch('/api/credit/guarantors/' + g.id, { method: 'POST', body: { action } }); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const BAND: Record<string, string> = { Excellent: 'ex', Good: 'gd', Fair: 'fr', Poor: 'pr' }
const stat = (c: Chk | null) => (!c ? 'Not checked' : c.status === 'no_data' ? 'No bureau history' : c.status === 'error' ? (c.note ?? 'Check failed') : c.status === 'manual' ? (c.note ?? 'Manual') : c.status)
</script>
<template>
  <div v-if="data" class="gp"><div class="gh"><h3>Founders &amp; guarantors</h3><button class="btn secondary sm" @click="f.open = !f.open">{{ f.open ? 'Close' : '+ Add guarantor' }}</button></div>
    <p class="mut">{{ data.nigeria ? 'Personal credit is checked with the credit bureaus using the BVN (NIN optional), alongside the business.' : 'Outside Nigeria, ask each guarantor for their credit report (Equifax, Experian, TransUnion, FICO or Credit Karma), then enter the score and upload the report to keep it on record.' }}</p>
    <div v-for="g in data.rows" :key="g.id" class="gw"><div class="gr"><span><b>{{ g.name }}</b><em>{{ g.relationship }}<template v-if="data.nigeria">{{ g.bvn_last4 ? ' · BVN •••' + g.bvn_last4 : ' · no BVN' }}{{ g.nin_last4 ? ' · NIN •••' + g.nin_last4 : '' }}</template><template v-if="g.last_check?.source"> · {{ g.last_check.source }}</template></em></span>
      <span class="gs"><span v-if="g.last_check?.score" class="sc" :class="BAND[g.last_check.band ?? '']"><b>{{ g.last_check.score }}</b> {{ g.last_check.band }}</span><span v-else class="mut sm">{{ stat(g.last_check) }}</span>
        <a v-if="g.last_check?.document_id" :href="'/api/credit/checks/' + g.last_check.id + '/file'" target="_blank" class="lk">Report</a>
        <button v-if="data.nigeria" class="lk" :disabled="!!busy || !g.bvn_last4" @click="act(g, 'check')">{{ busy === g.id ? 'Checking…' : 'Run check' }}</button>
        <button class="lk" @click="manual = manual === g.id ? '' : g.id">{{ data.nigeria ? 'Manual score' : 'Enter score / upload report' }}</button><button class="lk red" :disabled="!!busy" @click="act(g, 'delete')">Remove</button></span></div>
      <BureauUpload v-if="manual === g.id" :borrower-id="borrowerId" :guarantor-id="g.id" @saved="manual = ''; refresh()" /></div>
    <p v-if="!data.rows.length && !f.open" class="mut sm">No guarantors yet.</p>
    <form v-if="f.open" class="gf" @submit.prevent="add"><input v-model="f.name" required maxlength="200" placeholder="Full name"><input v-model="f.relationship" maxlength="60" placeholder="Relationship (e.g. Founder, Director)"><input v-model="f.email" type="email" maxlength="254" placeholder="Email"><input v-model="f.phone" maxlength="30" placeholder="Phone">
      <template v-if="data.nigeria"><input v-model="f.bvn" inputmode="numeric" maxlength="11" placeholder="BVN (11 digits)"><input v-model="f.nin" inputmode="numeric" maxlength="11" placeholder="NIN (11 digits, optional)"></template>
      <button class="btn sm" :disabled="busy === 'add'">{{ busy === 'add' ? 'Saving…' : data.nigeria ? 'Save and run check' : 'Save, then add their score' }}</button></form>
    <p v-if="msg" class="error">{{ msg }}</p></div>
</template>
<style scoped>
.gp { border-top: 1px solid var(--c-rule); margin-top: 16px; padding-top: 12px; display: flex; flex-direction: column; gap: 6px; } .gh { display: flex; justify-content: space-between; align-items: center; } .gh h3 { margin: 0; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .sm { font-size: 12.5px; }
.gw { border-top: 1px solid var(--c-rule); padding: 8px 0; display: flex; flex-direction: column; gap: 8px; } .gr { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; flex-wrap: wrap; } .gr em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .gs { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.sc { font-size: 12.5px; padding: 2px 8px; background: var(--c-paper-2); } .sc.ex, .sc.gd { background: rgba(31,122,77,.1); color: var(--c-ok); } .sc.fr { background: rgba(181,71,8,.09); color: var(--c-warn); } .sc.pr { background: rgba(180,35,24,.07); color: var(--c-danger); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-decoration: none; } .lk.red { color: var(--c-danger); } .lk:disabled { opacity: .4; }
.gf { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; } .gf input { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); } .gf .btn { grid-column: 1 / -1; justify-self: start; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .error { color: var(--c-danger); font-size: 13px; }
/* fields fit */
input, select, textarea { box-sizing: border-box; max-width: 100%; min-width: 0; }
</style>
