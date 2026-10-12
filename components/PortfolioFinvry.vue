<script setup lang="ts">
// A portfolio company's Finvry workspace: link it, then import figures and notes from each investor update it sends.
const props = defineProps<{ companyId: string }>()
const emit = defineEmits<{ imported: [] }>()
interface U { id: string; title: string; label: string; sent_at: string | null; imported_at: string | null; new: boolean }
const { data, refresh } = await useFetch<{ linked: { id: string; name: string } | null; updates: U[] }>(() => '/api/portfolio/' + props.companyId + '/finvry')
const picking = ref(false); const busy = ref(''); const msg = ref(''); const ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function link(orgId: string | null) { msg.value = ''; ok.value = ''; try { await $fetch('/api/portfolio/' + props.companyId + '/finvry-link', { method: 'POST', body: { org_id: orgId } }); picking.value = false; await refresh() } catch (e) { msg.value = err(e) } }
async function imp(u: U) { busy.value = u.id; msg.value = ''; ok.value = ''; try { const r = await $fetch<{ months: number; values: number }>('/api/portfolio/' + props.companyId + '/finvry-import', { method: 'POST', body: { update_id: u.id } }); ok.value = r.values ? 'Imported ' + r.values + ' figure' + (r.values === 1 ? '' : 's') + ' across ' + r.months + ' month' + (r.months === 1 ? '' : 's') + ' from "' + u.title + '".' : 'Imported the notes from "' + u.title + '". The company has no Financials for that period yet.'; await refresh(); emit('imported') } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
</script>
<template>
  <div v-if="data" class="card pf">
    <div class="ph"><h2>Finvry</h2><template v-if="data.linked"><span class="ln">Linked to <b>{{ data.linked.name }}</b></span><button type="button" class="lk" @click="picking = !picking">Change</button><button type="button" class="lk red" @click="link(null)">Unlink</button></template></div>
    <template v-if="!data.linked || picking">
      <p class="muted">If this company uses Finvry, link its workspace. Each time it sends an investor update you get an email, and can import that update's figures (revenue, gross margin, burn, cash, customers, headcount) and notes here.</p>
      <FinvryPicker @pick="(w) => link(w.id)" />
    </template>
    <template v-else>
      <table v-if="data.updates.length" class="t"><thead><tr><th>Investor update</th><th>Sent</th><th /></tr></thead>
        <tbody><tr v-for="u in data.updates" :key="u.id"><td><b>{{ u.title }}</b><span v-if="u.new" class="nw">New</span><span class="sub">{{ u.label }}</span></td><td class="muted">{{ day(u.sent_at) }}</td>
          <td class="r"><span v-if="u.imported_at && busy !== u.id" class="dn">Imported {{ day(u.imported_at) }} · </span><button type="button" class="btn sm" :class="{ secondary: !!u.imported_at }" :disabled="busy === u.id" @click="imp(u)">{{ busy === u.id ? 'Importing…' : u.imported_at ? 'Re-import' : 'Import figures' }}</button></td></tr></tbody></table>
      <p v-else class="muted">No investor updates sent from Finvry yet. You'll get an email when the first one goes out.</p>
    </template>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.pf { display: flex; flex-direction: column; gap: 10px; } .ph { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; } .ph h2 { margin: 0; } .ln { font-size: 13.5px; color: var(--c-ink-soft); flex: 1; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); } .muted { color: var(--c-muted); font-size: 13.5px; margin: 0; }
.t { width: 100%; border-collapse: collapse; } .t th { text-align: left; font-size: 12px; font-weight: 400; color: var(--c-muted); padding: 8px 6px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 10px 6px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: middle; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .r { text-align: right; white-space: nowrap; } .dn { font-size: 12px; color: var(--c-ok); } .nw { display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 600; padding: 1px 7px; background: #eaf7ef; color: #1d7a45; }
.btn.sm { padding: 6px 12px; font-size: 13px; } .ok { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; }
</style>
