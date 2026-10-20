<script setup lang="ts">
// Console: partners (VCs, incubators, accelerators, communities) and the discount codes their startups redeem.
useHead({ title: 'Finvry · Partners & discounts' })
interface Pt { id: string; name: string; kind: string; website: string | null; logo_url: string | null; contact_name: string | null; contact_email: string | null; note: string | null; code: string | null; discount_pct: number; months: number | null; max_redemptions: number | null; expires_on: string | null; status: string; listed: boolean; created_at: string; redemptions: number }
interface R { partner_id: string; discount_pct: number; until: string | null; redeemed_at: string; org_id: string; org: string }
const { data, refresh } = await useFetch<{ partners: Pt[]; redemptions: R[]; kinds: Record<string, string> }>('/api/platform/partners')
const st = ref('')
const list = computed(() => (data.value?.partners ?? []).filter((p) => !st.value || p.status === st.value))
const n = computed(() => { const l = data.value?.partners ?? []; return { approved: l.filter((p) => p.status === 'approved').length, pending: l.filter((p) => p.status === 'pending').length, red: data.value?.redemptions.length ?? 0 } })
const blank = () => ({ id: '', name: '', kind: 'vc', website: '', logo_url: '', contact_name: '', contact_email: '', note: '', code: '', discount_pct: 20 as number | string, months: 12 as number | string, max_redemptions: '' as number | string, expires_on: '', status: 'approved', listed: true })
const f = reactive({ open: false, ...blank() }); const msg = ref(''); const ok = ref(''); const busy = ref(false)
function edit(p?: Pt) { Object.assign(f, blank(), p ? { ...p, website: p.website ?? '', logo_url: p.logo_url ?? '', contact_name: p.contact_name ?? '', contact_email: p.contact_email ?? '', note: p.note ?? '', code: p.code ?? '', months: p.months ?? '', max_redemptions: p.max_redemptions ?? '', expires_on: p.expires_on ?? '', status: p.status === 'pending' ? 'approved' : p.status } : {}, { open: true }); msg.value = '' }
async function save(del = false) {
  if (del && !await askConfirm('Remove ' + f.name + '? Workspaces keep any discount they already redeemed.')) return
  busy.value = true; msg.value = ''
  try { const { open, ...b } = f; void open; const r = await $fetch<{ code: string | null }>('/api/platform/partners', { method: 'POST', body: del ? { id: f.id, delete: true } : { ...b, id: b.id || undefined } }); f.open = false; ok.value = del ? 'Removed.' : 'Saved' + (r.code ? ' — code ' + r.code : '') + '.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const ST: Record<string, string> = { pending: 'Applied', approved: 'Approved', paused: 'Paused', rejected: 'Rejected' }
async function copy(c: string) { try { await navigator.clipboard.writeText(c); ok.value = 'Copied ' + c } catch { /* ignore */ } }
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><p class="label">Finvry console</p><h1>Partners &amp; discounts</h1><p class="lead">VCs, incubators, accelerators and communities whose startups get a discount on Finvry plans. Approved, listed partners appear on <a href="/partners" target="_blank">app.finvry.com/partners</a> and finvry.com; founders redeem the partner's code at sign-up or in Settings → Plan.</p></div><button class="btn" @click="edit()">+ Add partner</button></div>
    <div class="fx-stats"><StatTile icon="check" tone="g" label="Approved partners" :value="n.approved" clickable :on="st === 'approved'" @click="st = st === 'approved' ? '' : 'approved'" /><StatTile icon="inbox" :tone="n.pending ? 'a' : 'n'" label="Applications" :value="n.pending" note="waiting for review" clickable :on="st === 'pending'" @click="st = st === 'pending' ? '' : 'pending'" /><StatTile icon="users" tone="b" label="Startups redeemed" :value="n.red" /></div>
    <p v-if="ok" class="ok">{{ ok }}</p>
    <div class="box"><table><thead><tr><th>Partner</th><th>Code</th><th>Discount</th><th>Redeemed</th><th>Status</th><th /></tr></thead>
      <tbody><tr v-for="p in list" :key="p.id"><td><b>{{ p.name }}</b><span class="sub">{{ data.kinds[p.kind] ?? p.kind }}{{ p.contact_email ? ' · ' + p.contact_name + ' <' + p.contact_email + '>' : '' }}</span><span v-if="p.note" class="sub nt">{{ p.note }}</span></td>
        <td><button v-if="p.code" type="button" class="code" title="Copy" @click="copy(p.code)">{{ p.code }}</button><span v-else class="sub">—</span></td>
        <td>{{ p.discount_pct }}%<span class="sub">{{ p.months ? p.months + ' months' : 'Ongoing' }}{{ p.expires_on ? ' · code ends ' + p.expires_on : '' }}</span></td>
        <td>{{ p.redemptions }}{{ p.max_redemptions ? ' / ' + p.max_redemptions : '' }}</td>
        <td><span class="fx-pill" :class="{ g: p.status === 'approved', amber: p.status === 'pending', red: p.status === 'rejected' }">{{ ST[p.status] }}</span><span v-if="p.status === 'approved' && !p.listed" class="sub">Not listed publicly</span></td>
        <td class="r"><button type="button" class="lk" @click="edit(p)">{{ p.status === 'pending' ? 'Review' : 'Edit' }}</button></td></tr></tbody></table>
      <EmptyState v-if="!list.length" icon="customers" title="No partners yet" text="Add one, or share app.finvry.com/partners so VCs and incubators can apply." /></div>
    <template v-if="data.redemptions.length"><h2 class="h2">Recent redemptions</h2>
      <div class="box"><table><thead><tr><th>Workspace</th><th>Partner</th><th>Discount</th><th>Redeemed</th></tr></thead><tbody><tr v-for="r in data.redemptions" :key="r.partner_id + r.org_id"><td><NuxtLink :to="'/platform/customers/' + r.org_id">{{ r.org }}</NuxtLink></td><td>{{ data.partners.find((p) => p.id === r.partner_id)?.name ?? '—' }}</td><td>{{ r.discount_pct }}%{{ r.until ? ' until ' + r.until : '' }}</td><td>{{ day(r.redeemed_at) }}</td></tr></tbody></table></div></template>
    <AppModal :open="f.open" :title="f.id ? f.name : 'Add a partner'" wide @close="f.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Name<input v-model="f.name" maxlength="200"></label><label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in data.kinds" :key="k" :value="k">{{ l }}</option></select></label><label class="label">Status<select v-model="f.status"><option value="approved">Approved</option><option value="pending">Applied (pending)</option><option value="paused">Paused (code stops working)</option><option value="rejected">Rejected</option></select></label></div>
        <div class="g3"><label class="label">Discount (%)<input v-model="f.discount_pct" type="number" min="1" max="100"></label><label class="label">For how many months<input v-model="f.months" type="number" min="1" max="60" placeholder="Blank = ongoing"></label><label class="label">Max startups<input v-model="f.max_redemptions" type="number" min="1" placeholder="Blank = no limit"></label></div>
        <div class="g3"><label class="label">Code<input v-model="f.code" maxlength="30" placeholder="Leave blank to generate one" class="up"></label><label class="label">Code ends on<input v-model="f.expires_on" type="date"></label><label class="cb top"><input v-model="f.listed" type="checkbox"> Show on the public partner list</label></div>
        <div class="g3"><label class="label">Website<input v-model="f.website" maxlength="300" placeholder="https://"></label><label class="label">Logo URL<input v-model="f.logo_url" maxlength="500" placeholder="https://…/logo.png"></label><span /></div>
        <div class="g3"><label class="label">Contact name<input v-model="f.contact_name" maxlength="200"></label><label class="label">Contact email<input v-model="f.contact_email" maxlength="254"></label><span /></div>
        <label class="label">Notes<textarea v-model="f.note" rows="2" maxlength="2000" /></label>
        <p class="s">The code is never shown publicly. Send it to the partner so they can share it with their startups. Startups can also open <code>app.finvry.com/start?partner=CODE</code>.</p>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="f.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Remove</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" :disabled="busy || !f.name.trim()" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 840px; } .lead a { color: var(--c-blue-deep); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } td a { color: var(--c-blue-deep); text-decoration: none; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .nt { max-width: 420px; white-space: pre-line; } .r { text-align: right; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: var(--c-paper-2); border: 1px dashed var(--c-rule-strong); padding: 3px 8px; cursor: pointer; } .h2 { font-size: 18px; margin: 24px 0 10px; } .ok { color: var(--c-ok); }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input, .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .up { text-transform: uppercase; }
.cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .cb input { width: auto; } .cb.top { align-self: end; padding-bottom: 8px; } .s { font-size: 12.5px; color: var(--c-muted); margin: 0; } .s code { font-size: 12px; } .sp { flex: 1; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } }
</style>
