<script setup lang="ts">
// Properties and their rooms/units: Airbnb listing (photo, rating, reviews, calendar), the names Airbnb uses for each
// unit, and — for non-Airbnb units — the lease. Admins add or edit properties, units and leases.
interface Pr { id: string; name: string; address: string | null; kind: string; ownership: string; bedrooms: number | null; acquired_on: string | null; image_url: string | null; notes: string | null; entity_id: string | null }
interface Un { id: string; property_id: string; name: string; rental_model: string; source: string; aliases: string[]; airbnb_listing_id: string | null; ical_url: string | null; title: string | null; image_url: string | null; images: string[]; rating: number | null; review_count: number | null; refreshed_at: string | null; ical_synced_at: string | null; refresh_error: string | null }
interface Le { id: string; unit_id: string; tenant_name: string; tenant_email: string | null; tenant_phone: string | null; rent: number; due_day: number; deposit: number | null; starts_on: string; ends_on: string | null; document_id: string | null; status: string; notes: string | null }
interface D { properties: Pr[]; units: Un[]; leases: Le[]; upcoming: { unit_id: string; starts: string; ends: string; confirmation_code: string | null }[]; activity: { unit_id: string; event: string; detail: string | null; created_at: string }[]; entities: { id: string; name: string }[]; admin: boolean }
const { data, refresh } = await useFetch<D>('/api/rentals/properties')
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const KIND: Record<string, string> = { house: 'House', adu: 'ADU', apartment: 'Apartment', condo: 'Condo', other: 'Other' }
const unitsOf = (pid: string) => (data.value?.units ?? []).filter((u) => u.property_id === pid)
const leaseOf = (uid: string) => (data.value?.leases ?? []).find((l) => l.unit_id === uid && l.status === 'active') ?? null
const nextStays = (uid: string) => (data.value?.upcoming ?? []).filter((x) => x.unit_id === uid).slice(0, 3)
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const when = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'never')
async function call(fn: () => Promise<unknown>, done = 'Saved.') { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh(); return true } catch (e) { msg.value = err(e); return false } finally { busy.value = false } }
// Refresh from Airbnb
const refreshing = ref(false)
async function refreshNow() { refreshing.value = true; msg.value = ''; ok.value = ''; try { const r = await $fetch<{ calendars: number; listings: number; errors: { name: string; refresh_error: string }[] }>('/api/rentals/refresh', { method: 'POST' }); ok.value = 'Updated ' + r.listings + ' listing' + (r.listings === 1 ? '' : 's') + ' and ' + r.calendars + ' calendar' + (r.calendars === 1 ? '' : 's') + '.' + (r.errors.length ? ' Could not read: ' + r.errors.map((x) => x.name).join(', ') + ' (rating stays as last known; you can enter it by hand).' : ''); await refresh() } catch (e) { msg.value = err(e) } finally { refreshing.value = false } }
// Property wizard / edit
const pf = reactive({ open: false, id: '', name: '', address: '', kind: 'house', ownership: 'leased', bedrooms: '' as string | number, acquired_on: '', notes: '', entity_id: '', units: [] as { name: string; rental_model: 'room' | 'entire'; source: 'airbnb' | 'direct' | 'other'; airbnb: string }[] })
function editProp(p?: Pr) { Object.assign(pf, { open: true, id: p?.id ?? '', name: p?.name ?? '', address: p?.address ?? '', kind: p?.kind ?? 'house', ownership: p?.ownership ?? 'leased', bedrooms: p?.bedrooms ?? '', acquired_on: p?.acquired_on ?? '', notes: p?.notes ?? '', entity_id: p?.entity_id ?? '', units: p ? [] : [{ name: '', rental_model: 'entire', source: 'airbnb', airbnb: '' }] }) }
const saveProp = () => call(async () => { const { open, ...b } = pf; void open; await $fetch('/api/rentals/properties', { method: 'POST', body: { ...b, id: b.id || undefined, bedrooms: b.bedrooms === '' ? null : b.bedrooms, units: b.id ? undefined : b.units.filter((u) => u.name.trim()) } }); pf.open = false })
const removeProp = (p: Pr) => window.confirm('Remove ' + p.name + '? Its history stays in reports.') && call(async () => { await $fetch('/api/rentals/properties', { method: 'POST', body: { id: p.id, delete: true } }) }, 'Removed.')
// Unit edit
const uf = reactive({ open: false, id: '', property_id: '', name: '', rental_model: 'entire', source: 'airbnb', aliases: '', airbnb: '', ical_url: '', rating: '' as string | number, review_count: '' as string | number })
function editUnit(pid: string, u?: Un) { Object.assign(uf, { open: true, id: u?.id ?? '', property_id: pid, name: u?.name ?? '', rental_model: u?.rental_model ?? 'room', source: u?.source ?? 'airbnb', aliases: (u?.aliases ?? []).join('\n'), airbnb: u?.airbnb_listing_id ? 'https://www.airbnb.com/rooms/' + u.airbnb_listing_id : '', ical_url: u?.ical_url ?? '', rating: '', review_count: '' }) }
const saveUnit = () => call(async () => { await $fetch('/api/rentals/units', { method: 'POST', body: { ...uf, id: uf.id || undefined, aliases: uf.aliases.split('\n').map((x) => x.trim()).filter(Boolean), rating: uf.rating === '' ? null : uf.rating, review_count: uf.review_count === '' ? null : uf.review_count } }); uf.open = false })
const removeUnit = () => window.confirm('Remove ' + uf.name + '?') && call(async () => { await $fetch('/api/rentals/units', { method: 'POST', body: { id: uf.id, delete: true } }); uf.open = false }, 'Removed.')
// Lease edit
const lf = reactive({ open: false, id: '', unit_id: '', tenant_name: '', tenant_email: '', tenant_phone: '', rent: '' as string | number, due_day: 1, deposit: '' as string | number, starts_on: '', ends_on: '', status: 'active', notes: '' })
function editLease(uid: string, l?: Le | null) { Object.assign(lf, { open: true, id: l?.id ?? '', unit_id: uid, tenant_name: l?.tenant_name ?? '', tenant_email: l?.tenant_email ?? '', tenant_phone: l?.tenant_phone ?? '', rent: l?.rent ?? '', due_day: l?.due_day ?? 1, deposit: l?.deposit ?? '', starts_on: l?.starts_on ?? '', ends_on: l?.ends_on ?? '', status: l?.status ?? 'active', notes: l?.notes ?? '' }) }
const removeLease = () => window.confirm('Remove this lease?') && call(async () => { await $fetch('/api/rentals/leases', { method: 'POST', body: { id: lf.id, delete: true } }); lf.open = false }, 'Lease removed.')
const saveLease = () => call(async () => { const { open, ...b } = lf; void open; await $fetch('/api/rentals/leases', { method: 'POST', body: { ...b, id: b.id || undefined } }); lf.open = false })
async function leaseDoc(l: Le, e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); await call(async () => { await $fetch('/api/rentals/leases/' + l.id + '/document', { method: 'POST', body: fd }) }, 'Lease uploaded.') }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = err(e) } }
</script>
<template>
  <div v-if="data" class="pp">
    <div class="bar"><p class="mut">Ratings, reviews, photos and calendars refresh from Airbnb automatically. Add each listing's calendar (iCal) link once to see bookings as they happen.</p><span class="sp" /><button type="button" class="btn secondary" :disabled="refreshing" @click="refreshNow">{{ refreshing ? 'Refreshing…' : 'Refresh from Airbnb' }}</button><button v-if="data.admin" type="button" class="btn" @click="editProp()">+ Add rental</button></div>
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <div v-for="p in data.properties" :key="p.id" class="card prop">
      <div class="ph"><div><h2>{{ p.name }}</h2><span>{{ KIND[p.kind] }}{{ p.bedrooms ? ' · ' + p.bedrooms + ' bedroom' + (p.bedrooms === 1 ? '' : 's') : '' }} · {{ p.ownership === 'owned' ? 'Owned' : 'Leased' }}{{ p.address ? ' · ' + p.address : '' }}</span></div>
        <template v-if="data.admin"><button type="button" class="lk" @click="editUnit(p.id)">+ Room / unit</button><button type="button" class="lk" @click="editProp(p)">Edit</button></template></div>
      <div class="units">
        <div v-for="u in unitsOf(p.id)" :key="u.id" class="unit">
          <a v-if="u.images?.length || u.image_url" class="gal" :class="{ one: (u.images?.length ?? 0) < 3 }" :href="u.airbnb_listing_id ? 'https://www.airbnb.com/rooms/' + u.airbnb_listing_id : undefined" target="_blank" rel="noopener">
            <span class="gm" :style="{ backgroundImage: 'url(' + (u.images?.[0] ?? u.image_url) + ')' }" /><span v-if="(u.images?.length ?? 0) >= 3" class="gs"><span v-for="(im, i) in u.images.slice(1, 3)" :key="i" :style="{ backgroundImage: 'url(' + im + ')' }" /></span></a>
          <div v-else class="ph2"><span>{{ u.rental_model === 'room' ? 'Room' : 'Unit' }}</span></div>
          <div class="ub">
            <div class="ut"><b>{{ u.name }}</b><span v-if="u.rating" class="rt">★ {{ Number(u.rating).toFixed(2) }} <em>· {{ u.review_count ?? 0 }} reviews</em></span></div>
            <span class="sub">{{ u.title ?? '' }}{{ u.title ? ' · ' : '' }}{{ u.rental_model === 'room' ? 'Rented by the room' : 'Entire place' }} · {{ u.source === 'airbnb' ? 'Airbnb' : 'Direct' }}</span>
            <template v-if="u.source === 'airbnb'">
              <span class="links"><a v-if="u.airbnb_listing_id" :href="'https://www.airbnb.com/rooms/' + u.airbnb_listing_id" target="_blank" rel="noopener">Airbnb listing ↗</a><span :class="u.ical_url ? 'okt' : 'warn'">{{ u.ical_url ? 'Calendar synced ' + when(u.ical_synced_at) : 'No calendar link yet' }}</span></span>
              <span v-if="nextStays(u.id).length" class="stays">Upcoming: <template v-for="(s, i) in nextStays(u.id)" :key="i"><template v-if="i"> · </template>{{ day(s.starts) }}–{{ day(s.ends) }}</template></span>
              <span v-if="u.refresh_error" class="warn sm">Listing page could not be read last time.</span>
            </template>
            <template v-else>
              <div v-if="leaseOf(u.id)" class="lease"><b>{{ leaseOf(u.id)!.tenant_name }}</b> · ${{ leaseOf(u.id)!.rent.toLocaleString('en-US') }}/month, due day {{ leaseOf(u.id)!.due_day }}{{ leaseOf(u.id)!.deposit ? ' · deposit $' + leaseOf(u.id)!.deposit!.toLocaleString('en-US') : '' }}<span class="sub">{{ leaseOf(u.id)!.starts_on }} → {{ leaseOf(u.id)!.ends_on ?? 'open-ended' }}</span>
                <span class="links"><button v-if="leaseOf(u.id)!.document_id" type="button" class="lk" @click="openDoc(leaseOf(u.id)!.document_id!)"><FileBadge name="lease.pdf" size="sm" /> Signed lease</button><label v-if="data.admin" class="lk up">{{ leaseOf(u.id)!.document_id ? 'Replace lease' : 'Upload signed lease' }}<input type="file" accept=".pdf,.png,.jpg,.jpeg" @change="leaseDoc(leaseOf(u.id)!, $event)"></label><button v-if="data.admin" type="button" class="lk" @click="editLease(u.id, leaseOf(u.id))">Edit lease</button></span></div>
              <button v-else-if="data.admin" type="button" class="lk" @click="editLease(u.id)">+ Add lease</button><span v-else class="sub">No lease recorded.</span>
            </template>
            <button v-if="data.admin" type="button" class="lk ed" @click="editUnit(p.id, u)">Edit unit</button>
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-if="!data.properties.length" card icon="entities" title="No rentals yet" :text="data.admin ? 'Add each rental once: name, address, units and whether it is on Airbnb.' : 'An admin adds each rental once.'" />

    <AppModal :open="pf.open" :title="pf.id ? 'Edit ' + pf.name : 'Add a rental'" wide @close="pf.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Name<input v-model="pf.name" maxlength="160" placeholder="e.g. 3 Bedroom House"></label><label class="label">Type<select v-model="pf.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label><label class="label">Owned or leased<select v-model="pf.ownership"><option value="owned">Owned</option><option value="leased">Leased</option></select></label></div>
        <label class="label">Address<input v-model="pf.address" maxlength="500"></label>
        <div class="g3"><label class="label">Bedrooms<input v-model="pf.bedrooms" inputmode="numeric"></label><label class="label">Acquired / leased from<input v-model="pf.acquired_on" type="date"></label><label class="label">Entity<select v-model="pf.entity_id"><option value="">Aidi Haven LLC (default)</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label></div>
        <template v-if="!pf.id"><p class="label">Rooms or units</p>
          <div v-for="(u, i) in pf.units" :key="i" class="g4"><input v-model="u.name" placeholder="Name, e.g. Room 1" maxlength="160"><select v-model="u.rental_model"><option value="room">A room</option><option value="entire">Entire place</option></select><select v-model="u.source"><option value="airbnb">Airbnb</option><option value="direct">Direct / lease</option><option value="other">Other</option></select><input v-model="u.airbnb" :disabled="u.source !== 'airbnb'" placeholder="Airbnb link (optional)"></div>
          <button type="button" class="lk" @click="pf.units.push({ name: '', rental_model: 'room', source: 'airbnb', airbnb: '' })">+ Another room / unit</button></template>
        <label class="label">Notes<textarea v-model="pf.notes" rows="2" maxlength="4000" /></label>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="pf.id" class="btn secondary danger" @click="removeProp(data.properties.find((x) => x.id === pf.id)!)">Remove</button><span class="sp" /><button class="btn secondary" @click="pf.open = false">Cancel</button><button class="btn" :disabled="busy || !pf.name.trim()" @click="saveProp">Save</button></template>
    </AppModal>

    <AppModal :open="uf.open" :title="uf.id ? 'Edit ' + uf.name : 'Add a room or unit'" wide @close="uf.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Name<input v-model="uf.name" maxlength="160"></label><label class="label">Rented as<select v-model="uf.rental_model"><option value="room">A room</option><option value="entire">Entire place</option></select></label><label class="label">Source<select v-model="uf.source"><option value="airbnb">Airbnb</option><option value="direct">Direct / lease</option><option value="other">Other</option></select></label></div>
        <template v-if="uf.source === 'airbnb'">
          <label class="label">Airbnb listing link<input v-model="uf.airbnb" placeholder="https://www.airbnb.com/rooms/…"></label>
          <label class="label">Calendar (iCal) link<input v-model="uf.ical_url" placeholder="https://www.airbnb.com/calendar/ical/….ics"><em class="hint">Airbnb → Listings → this listing → Availability → Connect calendars → Export calendar.</em></label>
          <label class="label">Names Airbnb uses for it (one per line)<textarea v-model="uf.aliases" rows="3" placeholder="The listing title in the CSV, and the home name in the Earnings report" /><em class="hint">Imports match on these, so they keep working when a title changes.</em></label>
          <div class="g3"><label class="label">Rating (if not read automatically)<input v-model="uf.rating" inputmode="decimal" placeholder="e.g. 4.91"></label><label class="label">Reviews<input v-model="uf.review_count" inputmode="numeric"></label><span /></div>
        </template>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="uf.id" class="btn secondary danger" @click="removeUnit">Remove</button><span class="sp" /><button class="btn secondary" @click="uf.open = false">Cancel</button><button class="btn" :disabled="busy || !uf.name.trim()" @click="saveUnit">Save</button></template>
    </AppModal>

    <AppModal :open="lf.open" :title="lf.id ? 'Edit lease' : 'Add a lease'" wide @close="lf.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Tenant<input v-model="lf.tenant_name" maxlength="200"></label><label class="label">Email<input v-model="lf.tenant_email" maxlength="254"></label><label class="label">Phone<input v-model="lf.tenant_phone" maxlength="40"></label></div>
        <div class="g3"><label class="label">Rent per month ($)<input v-model="lf.rent" inputmode="decimal"></label><label class="label">Due day of month<input v-model="lf.due_day" type="number" min="1" max="28"></label><label class="label">Deposit held ($)<input v-model="lf.deposit" inputmode="decimal"></label></div>
        <div class="g3"><label class="label">Lease start<input v-model="lf.starts_on" type="date"></label><label class="label">Lease end<input v-model="lf.ends_on" type="date"></label><label class="label">Status<select v-model="lf.status"><option value="active">Active</option><option value="ended">Ended</option></select></label></div>
        <label class="label">Notes<textarea v-model="lf.notes" rows="2" maxlength="2000" /></label>
        <p class="mut">Rent is added to Money each month on the due day; mark it paid there.</p>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="lf.id" class="btn secondary danger" @click="removeLease">Remove</button><span class="sp" /><button class="btn secondary" @click="lf.open = false">Cancel</button><button class="btn" :disabled="busy || !lf.tenant_name.trim()" @click="saveLease">Save</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.pp { display: flex; flex-direction: column; gap: 14px; } .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .bar .mut { max-width: 640px; } .sp { flex: 1; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .okm { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; }
.prop { display: flex; flex-direction: column; gap: 14px; } .ph { display: flex; gap: 14px; align-items: flex-start; } .ph > div { flex: 1; } .ph h2 { margin: 0; font-size: 18px; } .ph span { font-size: 13px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; } .lk.up { position: relative; overflow: hidden; } .lk.up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.units { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; } .unit { border: 1px solid var(--c-rule); display: flex; flex-direction: column; }
.gal { display: grid; grid-template-columns: 2fr 1fr; gap: 3px; height: 170px; overflow: hidden; } .gal.one { grid-template-columns: 1fr; } .gal span { background: var(--c-paper-2) center / cover no-repeat; transition: transform .9s cubic-bezier(.2, .7, .2, 1); } .gs { display: flex; flex-direction: column; gap: 3px; background: none !important; } .gs span { flex: 1; } .unit:hover .gal span { transform: scale(1.04); } .gs span:hover { transform: none; }
.ph2 { height: 120px; background: var(--c-paper-2) center / cover no-repeat; display: grid; place-items: center; color: var(--c-muted); font-size: 12px; } .ub { display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; flex: 1; }
.ut { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; } .ut b { font-size: 14.5px; } .rt { font-size: 13px; white-space: nowrap; } .rt em { font-style: normal; color: var(--c-muted); }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .links { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px; align-items: center; } .links a { color: var(--c-blue-deep); text-decoration: none; }
.okt { color: var(--c-ok); } .warn { color: #a5650b; } .sm { font-size: 12px; } .stays { font-size: 12.5px; color: var(--c-ink-soft); } .lease { font-size: 13px; display: flex; flex-direction: column; gap: 4px; } .ed { align-self: flex-start; margin-top: auto; padding-top: 6px; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g4 { display: grid; grid-template-columns: 1.3fr .8fr .8fr 1.6fr; gap: 8px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; margin: 0; } .ef input, .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .hint { font-style: normal; font-size: 12px; color: var(--c-muted); }
@media (max-width: 800px) { .g3, .g4 { grid-template-columns: 1fr; } }
</style>
