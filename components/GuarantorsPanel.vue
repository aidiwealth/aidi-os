<script setup lang="ts">
// Guarantors (founders) of a borrower: BVN/NIN on file (last 4 only), latest credit score, run a check, add or remove.
const props = defineProps<{ borrowerId: string }>()
interface G { id: string; name: string; email: string | null; relationship: string | null; bvn_last4: string | null; nin_last4: string | null; last_check: { status: string; score: number | null; band: string | null; note: string | null; created_at: string } | null }
const { data, refresh } = await useFetch<G[]>(() => '/api/credit/borrowers/' + props.borrowerId + '/guarantors', { key: 'guar-' + props.borrowerId })
const f = reactive({ open: false, name: '', email: '', phone: '', relationship: 'Founder', bvn: '', nin: '' }); const busy = ref(''); const msg = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function add() { busy.value = 'add'; msg.value = ''; try { await $fetch('/api/credit/borrowers/' + props.borrowerId + '/guarantors', { method: 'POST', body: { ...f, check: true } }); Object.assign(f, { open: false, name: '', email: '', phone: '', bvn: '', nin: '' }); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function act(g: G, action: 'check' | 'delete') { if (action === 'delete' && !confirm('Remove ' + g.name + ' as a guarantor?')) return; busy.value = g.id; msg.value = ''; try { await $fetch('/api/credit/guarantors/' + g.id, { method: 'POST', body: { action } }); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const BAND: Record<string, string> = { Excellent: 'ex', Good: 'gd', Fair: 'fr', Poor: 'pr' }
</script>
<template>
  <div class="gp"><div class="gh"><h3>Guarantors</h3><button class="btn secondary sm" @click="f.open = !f.open">{{ f.open ? 'Close' : '+ Add guarantor' }}</button></div>
    <p class="mut">Founders and directors who guarantee the loan. Their personal credit (BVN through CreditChek) is checked alongside the business.</p>
    <div v-for="g in data ?? []" :key="g.id" class="gr"><span><b>{{ g.name }}</b><em>{{ g.relationship }}{{ g.bvn_last4 ? ' · BVN •••' + g.bvn_last4 : ' · no BVN' }}{{ g.nin_last4 ? ' · NIN •••' + g.nin_last4 : '' }}</em></span>
      <span class="gs"><span v-if="g.last_check?.score" class="sc" :class="BAND[g.last_check.band ?? '']"><b>{{ g.last_check.score }}</b> {{ g.last_check.band }}</span><span v-else-if="g.last_check" class="mut sm">{{ g.last_check.status === 'no_data' ? 'No bureau history' : g.last_check.status === 'error' ? 'Check failed' : g.last_check.status }}</span><span v-else class="mut sm">Not checked</span>
        <button class="lk" :disabled="!!busy || !g.bvn_last4" @click="act(g, 'check')">{{ busy === g.id ? 'Checking…' : 'Run check' }}</button><button class="lk red" :disabled="!!busy" @click="act(g, 'delete')">Remove</button></span></div>
    <p v-if="!data?.length && !f.open" class="mut sm">No guarantors yet.</p>
    <form v-if="f.open" class="gf" @submit.prevent="add"><input v-model="f.name" required maxlength="200" placeholder="Full name"><input v-model="f.relationship" maxlength="60" placeholder="Relationship (e.g. Founder, Director)"><input v-model="f.email" type="email" maxlength="254" placeholder="Email"><input v-model="f.phone" maxlength="30" placeholder="Phone">
      <input v-model="f.bvn" inputmode="numeric" maxlength="11" placeholder="BVN (11 digits)"><input v-model="f.nin" inputmode="numeric" maxlength="11" placeholder="NIN (11 digits, optional)"><button class="btn sm" :disabled="busy === 'add'">{{ busy === 'add' ? 'Saving and checking…' : 'Save and run check' }}</button></form>
    <p v-if="msg" class="error">{{ msg }}</p></div>
</template>
<style scoped>
.gp { border-top: 1px solid var(--c-rule); margin-top: 16px; padding-top: 12px; display: flex; flex-direction: column; gap: 6px; } .gh { display: flex; justify-content: space-between; align-items: center; } .gh h3 { margin: 0; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .sm { font-size: 12.5px; }
.gr { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .gr em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .gs { display: flex; gap: 10px; align-items: center; }
.sc { font-size: 12.5px; padding: 2px 8px; background: var(--c-paper-2); } .sc.ex, .sc.gd { background: rgba(31,122,77,.1); color: var(--c-ok); } .sc.fr { background: rgba(181,71,8,.09); color: var(--c-warn); } .sc.pr { background: rgba(180,35,24,.07); color: var(--c-danger); }
.lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; } .lk.red { color: var(--c-danger); } .lk:disabled { opacity: .4; }
.gf { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .gf input { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); } .gf .btn { grid-column: 1 / -1; justify-self: start; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .error { color: var(--c-danger); font-size: 13px; }
</style>
