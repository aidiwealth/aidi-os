<script setup lang="ts">
// Console: perks for Finvry companies (partner offers). Public ones show on app.finvry.com/rewards; companies claim
// them on their Perks page, where the code, link and how to redeem are revealed.
useHead({ title: 'Finvry · Perks' })
interface Pk { id: string; partner: string; logo_url: string | null; website: string | null; category: string; headline: string; summary: string; details: string | null; redeem: string | null; code: string | null; claim_url: string | null; value_usd: number | null; audience: 'all' | 'paid'; public: boolean; featured: boolean; active: boolean; expires_on: string | null; sort: number; claims: number }
const { data, refresh } = await useFetch<{ categories: Record<string, string>; perks: Pk[]; recent: { partner: string; company: string; claimed_at: string }[] }>('/api/platform/perks')
const blank = () => ({ id: '', partner: '', logo_url: '', website: '', category: 'software', headline: '', summary: '', details: '', redeem: '', code: '', claim_url: '', value_usd: '' as string | number, audience: 'all' as 'all' | 'paid', public: true, featured: false, active: true, expires_on: '', sort: 0 as number | string })
const f = reactive({ open: false, ...blank() }); const msg = ref(''); const ok = ref(''); const busy = ref(false); const up = ref(false)
function edit(p?: Pk) { Object.assign(f, blank(), p ? { ...p, logo_url: p.logo_url ?? '', website: p.website ?? '', details: p.details ?? '', redeem: p.redeem ?? '', code: p.code ?? '', claim_url: p.claim_url ?? '', value_usd: p.value_usd ?? '', expires_on: p.expires_on ?? '' } : {}, { open: true }); msg.value = '' }
async function save(del = false) {
  if (del && !confirm('Remove the ' + f.partner + ' perk? Companies that claimed it keep what they were given.')) return
  busy.value = true; msg.value = ''
  try { const { open, ...b } = f; void open; await $fetch('/api/platform/perks', { method: 'POST', body: del ? { id: f.id, delete: true } : { ...b, id: b.id || undefined, sort: Number(b.sort) || 0 } }); f.open = false; ok.value = del ? 'Removed.' : 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
async function logo(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; up.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', file); try { f.logo_url = (await $fetch<{ url: string }>('/api/platform/perks/logo', { method: 'POST', body: fd })).url } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { up.value = false } }
const n = computed(() => { const l = data.value?.perks ?? []; return { live: l.filter((p) => p.active).length, pub: l.filter((p) => p.active && p.public).length, claims: l.reduce((a, p) => a + p.claims, 0), value: l.filter((p) => p.active).reduce((a, p) => a + (p.value_usd ?? 0), 0) } })
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>
<template>
  <section v-if="data">
    <div class="hd"><div><p class="label">Finvry console</p><h1>Perks</h1><p class="lead">Partner offers for companies on Finvry. Public perks show on <a href="https://app.finvry.com/rewards" target="_blank">app.finvry.com/rewards</a>; companies claim them on their Perks page, where the code and how to redeem are shown.</p></div><button class="btn" @click="edit()">Add a perk</button></div>
    <div class="fx-stats"><StatTile icon="check" tone="g" label="Live perks" :value="n.live" /><StatTile icon="link" label="On the public page" :value="n.pub" /><StatTile icon="users" tone="b" label="Claims" :value="n.claims" /><StatTile icon="money" label="Total value" :value="'$' + n.value.toLocaleString('en-US')" /></div>
    <p v-if="ok" class="ok">{{ ok }}</p>
    <div class="box"><table data-nosearch><thead><tr><th>Partner</th><th>Offer</th><th>Who</th><th>Claims</th><th>Status</th><th /></tr></thead>
      <tbody><tr v-for="p in data.perks" :key="p.id" :class="{ off: !p.active }"><td><span class="pt"><span class="lg"><img v-if="p.logo_url" :src="p.logo_url" alt=""><span v-else>{{ p.partner.slice(0, 2).toUpperCase() }}</span></span><span><b>{{ p.partner }}</b><span class="sub">{{ data.categories[p.category] ?? p.category }}</span></span></span></td>
        <td><b class="hl">{{ p.headline }}</b><span class="sub">{{ p.value_usd ? 'Worth $' + p.value_usd.toLocaleString('en-US') : '' }}{{ p.expires_on ? ' · ends ' + p.expires_on : '' }}</span></td>
        <td>{{ p.audience === 'paid' ? 'Paid plans' : 'Everyone' }}<span class="sub">{{ p.public ? 'Listed publicly' : 'In the app only' }}</span></td><td>{{ p.claims }}</td>
        <td><span class="fx-pill" :class="{ g: p.active }">{{ p.active ? 'Live' : 'Off' }}</span><span v-if="p.featured" class="fx-pill b">Featured</span></td>
        <td class="r"><button type="button" class="lk" @click="edit(p)">Edit</button></td></tr></tbody></table>
      <EmptyState v-if="!data.perks.length" icon="customers" title="No perks yet" text="Add your first partner offer: what companies get, who it is for, and how to redeem it." /></div>
    <template v-if="data.recent.length"><h2 class="h2">Recent claims</h2>
      <div class="box"><table><thead><tr><th>Company</th><th>Perk</th><th>Claimed</th></tr></thead><tbody><tr v-for="(r, i) in data.recent" :key="i"><td>{{ r.company }}</td><td>{{ r.partner }}</td><td>{{ day(r.claimed_at) }}</td></tr></tbody></table></div></template>
    <AppModal :open="f.open" :title="f.id ? f.partner : 'Add a perk'" wide @close="f.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Partner<input v-model="f.partner" maxlength="120" placeholder="e.g. Notion"></label><label class="label">Category<select v-model="f.category"><option v-for="(l, k) in data.categories" :key="k" :value="k">{{ l }}</option></select></label><label class="label">Website<input v-model="f.website" maxlength="500" placeholder="https://"></label></div>
        <div class="lgr"><span class="lg big"><img v-if="f.logo_url" :src="f.logo_url" alt=""><span v-else>{{ (f.partner || '?').slice(0, 2).toUpperCase() }}</span></span><label class="label grow">Logo URL<input v-model="f.logo_url" maxlength="1000" placeholder="https://… or upload"></label><label class="btn secondary sm upl">{{ up ? 'Uploading…' : 'Upload logo' }}<input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" @change="logo"></label></div>
        <div class="g3"><label class="label w2">Offer (headline)<input v-model="f.headline" maxlength="120" placeholder="e.g. 6 months free on the Plus plan"></label><label class="label">Value (US$, optional)<input v-model="f.value_usd" inputmode="decimal" placeholder="e.g. 5000"></label></div>
        <label class="label">Summary (shown on the card)<textarea v-model="f.summary" rows="2" maxlength="400" /></label>
        <label class="label">Details (optional, Markdown: terms, eligibility)<textarea v-model="f.details" rows="3" maxlength="6000" /></label>
        <div class="g3"><label class="label">Code (shown after claiming)<input v-model="f.code" maxlength="80"></label><label class="label w2">Claim link (shown after claiming)<input v-model="f.claim_url" maxlength="1000" placeholder="https://"></label></div>
        <label class="label">How to redeem (shown after claiming, Markdown)<textarea v-model="f.redeem" rows="3" maxlength="4000" placeholder="1. Open the link&#10;2. Enter the code at checkout" /></label>
        <div class="g3"><label class="label">Who can claim<select v-model="f.audience"><option value="all">Every Finvry company</option><option value="paid">Companies on a paid plan</option></select></label><label class="label">Offer ends (optional)<input v-model="f.expires_on" type="date"></label><label class="label">Order<input v-model="f.sort" type="number" min="0" max="9999"></label></div>
        <div class="tg"><label class="chk"><input v-model="f.active" type="checkbox"> Live</label><label class="chk"><input v-model="f.public" type="checkbox"> List on the public rewards page</label><label class="chk"><input v-model="f.featured" type="checkbox"> Featured (shown first, larger)</label></div>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="f.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Remove</button><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" :disabled="busy || !f.partner || !f.headline || !f.summary" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
section { display: flex; flex-direction: column; gap: 18px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 0; } .lead { margin: 6px 0 0; color: var(--c-muted); max-width: 840px; } .lead a { color: var(--c-blue-deep); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tr.off td { opacity: .55; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .r { text-align: right; } .lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .hl { font-weight: 600; color: var(--c-ink); }
.pt { display: flex; gap: 10px; align-items: center; } .lg { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border: 1px solid var(--c-rule); background: #eef0f6; color: #00183A; font-size: 12px; font-weight: 700; overflow: hidden; } .lg.big { width: 52px; height: 52px; } .lg img { max-width: 85%; max-height: 85%; object-fit: contain; background: #fff; }
.h2 { margin: 6px 0 0; font-size: 16px; } .fx-pill + .fx-pill { margin-left: 4px; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .w2 { grid-column: span 2; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ef input:not([type="checkbox"]):not([type="file"]), .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.lgr { display: flex; gap: 12px; align-items: flex-end; } .grow { flex: 1; } .upl { position: relative; overflow: hidden; cursor: pointer; } .upl input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.tg { display: flex; gap: 18px; flex-wrap: wrap; } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } .w2 { grid-column: auto; } }
</style>
