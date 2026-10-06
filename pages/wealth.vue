<script setup lang="ts">
// Investments & AUM: family NAV, Aidi Wealth AUM and client assets, venture positions, real estate and liabilities.
useHead({ title: 'Investments & AUM' })
interface R { id: string; entity_id: string | null; entity: string | null; client_name: string | null; section: string; category: string; name: string; platform: string | null; currency: string; cost: string | null; current_value: string | null; realized: string | null; ownership_pct: string | null; status: string; as_of: string | null; notes: string | null; meta: Record<string, unknown>; in_nav: boolean; in_aum: boolean }
interface T { assets: number; liabilities: number; nav: number; mgmtNav: number; wealthAum: number; clientAssets: number; ventureCost: number; ventureValue: number; ventureRealized: number; realEstate: number; flags: number }
const { data, refresh } = await useFetch<{ rows: R[]; totals: T; byCat: Record<string, number> }>('/api/wealth')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => !!me.value?.roles?.some((r) => ['admin', 'gp'].includes(r)))
const CAT: Record<string, string> = { venture: 'Venture', private_stake: 'Private stakes', public_securities: 'Public securities', fund: 'Funds', bonds: 'Bonds & bills', retirement: 'Retirement', cash: 'Cash', crypto: 'Digital assets', precious_metals: 'Precious metals', real_estate: 'Real estate', other: 'Other', liability: 'Liabilities' }
const SEC: [string, string, string][] = [['family', 'Family NAV', 'What the family owns across the group, less liabilities (conservative basis).'], ['wealth', 'Aidi Wealth: Main Fund', 'The family portfolio managed by Aidi Wealth.'], ['client', 'Aidi Wealth: client assets', 'Third-party assets advised or managed by Aidi Wealth. Not part of family NAV.'], ['venture', 'Venture positions', 'Aidi Angel Fund portfolio, by company (full positions).'], ['real_estate', 'Real estate', 'Property interests and estimated market values.']]
const tab = ref('family'); const onlyFlags = ref(false)
const usd = (v: number | string | null, c = 'USD') => (v === null || v === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: Math.abs(Number(v)) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(Number(v)) >= 1e6 ? 2 : 0 }).format(Number(v)))
const list = computed(() => (data.value?.rows ?? []).filter((r) => (tab.value === 'family' ? r.in_nav || (r.category === 'liability' && r.section === 'family') : r.section === tab.value) && (!onlyFlags.value || /FLAG:/.test(r.notes ?? ''))))
const groups = computed(() => { const m = new Map<string, R[]>(); for (const r of list.value) { const k = r.category === 'liability' ? 'liability' : r.category; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) } return [...m.entries()].sort((a, b) => (a[0] === 'liability' ? 1 : b[0] === 'liability' ? -1 : 0)) })
const mix = computed(() => Object.entries(data.value?.byCat ?? {}).filter(([, v]) => v > 0).map(([k, v]) => ({ label: CAT[k] ?? k, value: Math.round(v) })))
const flagText = (n: string | null) => (n ?? '').split('FLAG:').slice(1).map((s) => s.trim()).filter(Boolean)
const plain = (n: string | null) => (n ?? '').split('FLAG:')[0]!.trim()
const blank = () => ({ last_valuation: '' as string | number, cap: null as number | null, id: '', entity_id: '' as string | null, client_name: '', section: tab.value, category: tab.value === 'venture' ? 'venture' : tab.value === 'real_estate' ? 'real_estate' : 'other', name: '', platform: '', currency: 'USD', cost: '' as string | number, current_value: '' as string | number, realized: '' as string | number, ownership_pct: '' as string | number, status: 'active', as_of: new Date().toISOString().slice(0, 10), notes: '', in_nav: tab.value !== 'client' && tab.value !== 'venture' && tab.value !== 'real_estate', in_aum: true })
const f = reactive(blank()); const open = ref(false); const msg = ref('')
function edit(r?: R) { Object.assign(f, blank(), r ? { last_valuation: (r.meta?.last_valuation as number | undefined) ?? '', cap: (r.meta?.post_money_cap as number | undefined) ?? null, ...r, entity_id: r.entity_id ?? '', client_name: r.client_name ?? '', platform: r.platform ?? '', cost: r.cost ?? '', current_value: r.current_value ?? '', realized: r.realized ?? '', ownership_pct: r.ownership_pct ?? '', as_of: r.as_of ?? '', notes: r.notes ?? '' } : {}); open.value = true; msg.value = '' }
function markToValuation() { if (f.cap && Number(f.cost) > 0 && Number(f.last_valuation) > 0) { f.current_value = Math.round(Number(f.cost) * Number(f.last_valuation) / f.cap * 100) / 100; f.as_of = new Date().toISOString().slice(0, 10) } }
async function save() { msg.value = ''; try { await $fetch('/api/wealth', { method: 'POST', body: { ...f, id: f.id || undefined, entity_id: f.entity_id || null, as_of: f.as_of || null } }); open.value = false; await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
const moic = (r: R) => (Number(r.cost) > 0 ? ((Number(r.current_value ?? 0) + Number(r.realized ?? 0)) / Number(r.cost)).toFixed(2) + 'x' : '—')
const ST: Record<string, string> = { active: 'Active', realized: 'Realized', at_cost: 'At cost', nil: 'Held at nil', written_off: 'Written off', sold: 'Sold' }
</script>
<template>
  <section v-if="data">
    <p class="label">Family Office</p>
    <div class="head"><div><h1>Investments &amp; AUM</h1><p class="lead">Every holding across the group and Aidi Wealth, with family NAV. Update values as statements arrive; each change is kept in the history.</p></div><button v-if="canEdit" class="btn" @click="edit()">Add holding</button></div>
    <div class="kp">
      <div class="k hero"><em>Family NAV (conservative)</em><b>{{ usd(data.totals.nav) }}</b><i>Management basis {{ usd(data.totals.mgmtNav) }}</i></div>
      <div class="k"><em>Total assets</em><b>{{ usd(data.totals.assets) }}</b><i>less {{ usd(data.totals.liabilities) }} liabilities</i></div>
      <div class="k"><em>Aidi Wealth AUM</em><b>{{ usd(data.totals.wealthAum) }}</b><i>{{ usd(data.totals.clientAssets) }} client assets advised</i></div>
      <div class="k"><em>Venture positions</em><b>{{ usd(data.totals.ventureValue + data.totals.ventureRealized) }}</b><i>{{ usd(data.totals.ventureCost) }} invested · {{ data.totals.ventureCost ? ((data.totals.ventureValue + data.totals.ventureRealized) / data.totals.ventureCost).toFixed(2) + 'x' : '—' }}</i></div>
      <button class="k fl" :class="{ on: onlyFlags }" @click="onlyFlags = !onlyFlags"><em>Need attention</em><b :class="{ r: data.totals.flags }">{{ data.totals.flags }}</b><i>{{ onlyFlags ? 'Showing flagged only' : 'Show flagged only' }}</i></button>
    </div>
    <div class="top2"><div class="card"><DonutChart title="Family assets by type" total-label="Assets" currency="USD" :segments="mix" /></div>
      <div class="card secs"><button v-for="[k, l, d] in SEC" :key="k" type="button" class="sb" :class="{ on: tab === k }" @click="tab = k"><b>{{ l }}</b><span>{{ d }}</span></button></div></div>
    <div v-for="[cat, rows] in groups" :key="cat" class="grp">
      <p class="gh">{{ CAT[cat] ?? cat }} <span>{{ usd(rows.reduce((a, r) => a + Number(r.current_value ?? 0), 0)) }}</span></p>
      <div class="box"><table><thead><tr><th>Holding</th><th>{{ tab === 'client' ? 'Client' : 'Held by' }}</th><th class="n">{{ tab === 'venture' ? 'Invested' : 'Cost' }}</th><th class="n">Value</th><th v-if="tab === 'venture'" class="n">Multiple</th><th>As of</th><th /></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.id"><td><b class="nm">{{ r.name }}</b><span class="sub">{{ [r.platform, r.status !== 'active' ? ST[r.status] : '', r.ownership_pct ? Number(r.ownership_pct) + '%' : '', plain(r.notes)].filter(Boolean).join(' · ') }}</span><span v-for="(fl, i) in flagText(r.notes)" :key="i" class="flag">{{ fl }}</span></td>
          <td class="mut">{{ r.client_name ?? r.entity ?? '—' }}</td><td class="n mut">{{ usd(r.cost, r.currency) }}</td><td class="n"><b :class="{ neg: r.category === 'liability' }">{{ r.category === 'liability' ? '−' : '' }}{{ usd(r.current_value, r.currency) }}</b><span v-if="r.realized && Number(r.realized)" class="sub">+ {{ usd(r.realized, r.currency) }} realized</span><span v-if="r.meta?.mgmt_value" class="sub">mgmt {{ usd(r.meta.mgmt_value as number) }}</span><span v-if="r.meta?.last_valuation" class="sub">at {{ usd(r.meta.last_valuation as number) }} valuation</span></td>
          <td v-if="tab === 'venture'" class="n">{{ moic(r) }}</td><td class="mut">{{ r.as_of ? new Date(r.as_of + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—' }}</td>
          <td class="n"><button v-if="canEdit" class="link" @click="edit(r)">Edit</button></td></tr></tbody></table></div>
    </div>
    <EmptyState v-if="!groups.length" card icon="portfolio" :title="onlyFlags ? 'Nothing flagged here' : 'No holdings yet'" text="Add a holding with its value and date. Update the value whenever a statement arrives."><button v-if="canEdit && !onlyFlags" class="btn" @click="edit()">Add holding</button></EmptyState>
    <AppModal :open="open" :title="f.id ? 'Edit holding' : 'Add a holding'" wide @close="open = false">
      <form id="hf" class="frm" @submit.prevent="save">
        <label class="label w">Name<input v-model="f.name" required maxlength="200"></label>
        <label class="label">Section<select v-model="f.section"><option v-for="[k, l] in SEC" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Type<select v-model="f.category"><option v-for="(l, k) in CAT" :key="k" :value="k">{{ l }}</option></select></label>
        <label v-if="f.section === 'client'" class="label">Client<input v-model="f.client_name" maxlength="200"></label>
        <label v-else class="label">Held by<select v-model="f.entity_id"><option value="">—</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <label class="label">Platform or custodian<input v-model="f.platform" maxlength="120"></label>
        <label class="label">Currency<select v-model="f.currency"><option v-for="c in ['USD', 'NGN', 'GBP', 'EUR']" :key="c">{{ c }}</option></select></label>
        <label class="label">Cost / invested<input v-model="f.cost" inputmode="decimal"></label>
        <label class="label">Current value<input v-model="f.current_value" inputmode="decimal"></label>
        <label class="label">Realized proceeds<input v-model="f.realized" inputmode="decimal"></label>
        <label class="label">Ownership %<input v-model="f.ownership_pct" inputmode="decimal"></label>
        <template v-if="f.section === 'venture'"><label class="label">Last known valuation<input v-model="f.last_valuation" inputmode="decimal" placeholder="e.g. 15000000"></label>
          <div class="label mtv"><span>{{ f.cap ? 'SAFE cap ' + usd(f.cap) : 'No cap on file' }}</span><button type="button" class="btn secondary" :disabled="!f.cap || !Number(f.last_valuation) || !Number(f.cost)" @click="markToValuation">Mark to valuation</button></div></template>
        <label class="label">Status<select v-model="f.status"><option v-for="(l, k) in ST" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Value as of<input v-model="f.as_of" type="date"></label>
        <label class="cb"><input v-model="f.in_nav" type="checkbox"> Count in family NAV</label><label class="cb"><input v-model="f.in_aum" type="checkbox"> Count in reported AUM</label>
        <label class="label w">Notes (start a line with FLAG: to mark something to resolve)<textarea v-model="f.notes" rows="3" maxlength="3000" /></label>
        <p v-if="msg" class="error w">{{ msg }}</p>
      </form>
      <template #foot><DeleteButton v-if="f.id" type="holding" :id="f.id" :name="f.name" @deleted="open = false; refresh()" /><button class="btn secondary" type="button" @click="open = false">Cancel</button><button class="btn" type="submit" form="hf">Save</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 720px; }
.kp { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 12px; margin: 18px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; text-align: left; font: inherit; } .k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; letter-spacing: -.02em; } .k i { font-style: normal; font-size: 12px; color: var(--c-muted); }
.k.hero { background: linear-gradient(135deg, #0c1a2e, #1c3d63); border: 0; } .k.hero em, .k.hero i { color: rgba(255,255,255,.7); } .k.hero b { color: #fff; font-size: 28px; } .k.fl { cursor: pointer; } .k.fl.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .r { color: var(--c-danger); }
.top2 { display: grid; grid-template-columns: 1fr 1.3fr; gap: 12px; margin-bottom: 8px; } .secs { display: flex; flex-direction: column; gap: 6px; } .sb { text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 10px 12px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 2px; } .sb span { font-size: 12.5px; color: var(--c-muted); } .sb.on { border-color: var(--c-navy); background: #f6f8fb; box-shadow: inset 3px 0 0 var(--c-navy); }
.gh { font-size: 12px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .07em; margin: 18px 0 8px; display: flex; justify-content: space-between; } .gh span { color: var(--c-ink); letter-spacing: 0; }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 9px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tr:last-child td { border-bottom: 0; }
.nm { font-weight: 600; } .sub { display: block; font-size: 12px; color: var(--c-muted); margin-top: 2px; } .flag { display: inline-block; font-size: 11.5px; background: rgba(181,71,8,.09); color: var(--c-warn); padding: 2px 8px; margin: 4px 4px 0 0; } .n { text-align: right; white-space: nowrap; } .mut { color: var(--c-muted); } .neg { color: var(--c-danger); } .link { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .frm .w { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .cb { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .cb input { width: auto; } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kp { grid-template-columns: 1fr 1fr; } .top2 { grid-template-columns: 1fr; } .frm { grid-template-columns: 1fr 1fr; } }
.mtv { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--c-muted); justify-content: flex-end; }
</style>
