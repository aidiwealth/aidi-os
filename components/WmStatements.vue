<script setup lang="ts">
// Staff: generate a client's monthly / quarterly / annual statement (figures prefilled, editable), preview the PDF,
// publish it to the client's portal (they are emailed), and see whether they viewed or downloaded it.
const props = defineProps<{ clientId: string }>()
const api = '/api/wm/clients/' + props.clientId + '/statements'
const { data: list, refresh } = await useFetch<Record<string, any>[]>(api, { key: 'stm-' + props.clientId, default: () => [] })
const f = reactive({ period_kind: 'quarterly', ref: new Date().toISOString().slice(0, 10), period_start: '', period_end: '' })
const d = ref<Record<string, any> | null>(null); const msg = ref(''); const ok = ref(''); const busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.'
async function preview() { busy.value = 'p'; msg.value = ''; ok.value = ''; try { d.value = (await $fetch<{ data: Record<string, any> }>(api, { method: 'POST', body: { action: 'preview', ...f } })).data } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
function recalc() { const s = d.value!.summary; for (const k of ['beginning', 'deposits', 'withdrawals', 'interest', 'transfers', 'expenses', 'ending']) s[k] = Number(s[k]) || 0; s.appreciation = Math.round((s.ending - s.beginning - s.deposits + s.withdrawals - s.interest - s.transfers + s.expenses) * 100) / 100 }
async function pdf() { busy.value = 'pdf'; try { const blob = await $fetch<Blob>('/api/wm/statements/preview', { method: 'POST', body: { data: d.value }, responseType: 'blob' }); window.open(URL.createObjectURL(blob), '_blank') } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function publish() { if (!confirm('Publish this statement to the client\'s portal and email them?')) return; busy.value = 'pub'; try { await $fetch(api, { method: 'POST', body: { action: 'publish', data: d.value } }); d.value = null; ok.value = 'Published. The client has been emailed.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function del(id: string) { if (!confirm('Delete this statement? The client will no longer see it.')) return; await $fetch(api, { method: 'POST', body: { action: 'delete', statement_id: id } }); await refresh() }
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v ?? 0)
const LBL: Record<string, string> = { beginning: 'Beginning value', deposits: 'Deposits', withdrawals: 'Withdrawals', interest: 'Dividends and interest', transfers: 'Transfer of securities', expenses: 'Expenses', ending: 'Ending value' }
</script>
<template>
  <div class="ws">
    <div class="card"><h3>New statement</h3><div class="row"><select v-model="f.period_kind"><option value="monthly">Monthly (last month)</option><option value="quarterly">Quarterly (last quarter)</option><option value="annual">Annual (last year)</option><option value="custom">Custom period</option></select>
        <template v-if="f.period_kind === 'custom'"><input v-model="f.period_start" type="date"><input v-model="f.period_end" type="date"></template><label v-else class="lb">relative to <input v-model="f.ref" type="date"></label>
        <button class="btn secondary" :disabled="!!busy" @click="preview">{{ busy === 'p' ? 'Working…' : 'Prepare figures' }}</button></div>
      <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
      <template v-if="d"><p class="mut">{{ d.client.name }} · {{ d.period.label }} · figures are prefilled from holdings, wallet, savings, fees and net-worth history. Adjust anything before publishing.</p>
        <div class="g4"><label v-for="(l, k) in LBL" :key="k">{{ l }}<input v-model.number="d.summary[k]" type="number" step="0.01" @change="recalc"></label><label>Market appreciation (calculated)<input :value="d.summary.appreciation" disabled></label></div>
        <h4>Holdings ({{ d.holdings.length }})</h4><div v-for="(h, i) in d.holdings" :key="i" class="hr"><input v-model="h.item" class="sm"><input v-model="h.description"><input v-model.number="h.value" type="number" step="0.01" class="md"><button class="x" @click="d.holdings.splice(i, 1)">×</button></div>
        <h4>Expenses</h4><div v-for="(e, i) in d.expenses" :key="'e' + i" class="hr"><input v-model="e.date" class="sm"><input v-model="e.description"><input v-model.number="e.amount" type="number" step="0.01" class="md"><button class="x" @click="d.expenses.splice(i, 1); d.summary.expenses = d.expenses.reduce((a: number, x: any) => a + Number(x.amount), 0); recalc()">×</button></div>
        <button class="lk" @click="d.expenses.push({ date: '', description: '', amount: 0 })">+ Add expense</button>
        <label class="full">Custodian note<textarea v-model="d.custodian" rows="2" /></label>
        <div class="acts"><button class="btn secondary" :disabled="!!busy" @click="pdf">{{ busy === 'pdf' ? 'Rendering…' : 'Preview PDF' }}</button><button class="btn" :disabled="!!busy" @click="publish">{{ busy === 'pub' ? 'Publishing…' : 'Publish to client' }}</button></div></template></div>
    <div class="card tc"><table v-if="list.length" class="table"><thead><tr><th>Period</th><th>Type</th><th class="n">Ending value</th><th>Published</th><th>Client</th><th /></tr></thead><tbody>
      <tr v-for="s in list" :key="s.id"><td>{{ s.period_start }} – {{ s.period_end }}</td><td>{{ s.period_kind }}</td><td class="n">{{ money(s.ending) }}</td><td>{{ new Date(s.published_at).toLocaleDateString('en-GB') }}</td>
        <td><span :class="s.views || s.downloads ? 'okm' : 'mut'">{{ s.views ? 'Viewed ' + s.views + '×' : 'Not viewed' }}{{ s.downloads ? ' · downloaded ' + s.downloads + '×' : '' }}</span><span v-if="s.last_seen" class="s">last {{ new Date(s.last_seen).toLocaleString('en-GB') }}</span></td>
        <td><a :href="'/api/w/statements/' + s.id + '?mode=view'" target="_blank" class="lk">Open</a> <button class="lk red" @click="del(s.id)">Delete</button></td></tr></tbody></table><p v-else class="mut pad">No statements yet.</p></div>
  </div>
</template>
<style scoped>
.ws { display: flex; flex-direction: column; gap: 12px; } .ws * { box-sizing: border-box; } h3 { margin: 0 0 8px; font-size: 15px; } h4 { margin: 12px 0 4px; font-size: 13.5px; } .mut { color: var(--c-muted); font-size: 12.5px; } .s { display: block; font-size: 11.5px; color: var(--c-muted); } .okm { color: var(--c-ok); } .error { color: var(--c-danger); }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .lb { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--c-muted); }
.g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 8px; } .g4 label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--c-muted); } .g4 input { width: 100%; }
.hr { display: grid; grid-template-columns: 110px minmax(0, 1fr) 140px 26px; gap: 6px; margin: 3px 0; } .x { background: none; border: 0; color: var(--c-muted); font-size: 17px; cursor: pointer; } .full { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--c-muted); margin-top: 10px; } .full textarea { width: 100%; }
.acts { display: flex; gap: 8px; margin-top: 10px; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12.5px; padding: 0; text-decoration: none; } .lk.red { color: var(--c-danger); }
.tc { padding: 0; overflow-x: auto; } .table { width: 100%; border-collapse: collapse; font-size: 13px; } .table th { text-align: left; padding: 9px 12px; } .table td { padding: 10px 12px; border-top: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; } .pad { padding: 14px; margin: 0; }
@media (max-width: 900px) { .g4 { grid-template-columns: 1fr 1fr; } }
</style>
