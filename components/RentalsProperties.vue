<script setup lang="ts">
// Properties and their rooms/units: Airbnb listing (photo, rating, reviews, calendar), the names Airbnb uses for each
// unit, and — for non-Airbnb units — the lease. Admins add or edit properties, units and leases.
interface Pr { id: string; name: string; address: string | null; kind: string; ownership: string; bedrooms: number | null; acquired_on: string | null; image_url: string | null; notes: string | null; entity_id: string | null }
interface Un { id: string; property_id: string; name: string; rental_model: string; source: string; aliases: string[]; airbnb_listing_id: string | null; ical_url: string | null; title: string | null; image_url: string | null; images: string[]; rating: number | null; review_count: number | null; refreshed_at: string | null; ical_synced_at: string | null; refresh_error: string | null }
interface Le { id: string; unit_id: string; tenant_name: string; tenant_email: string | null; tenant_phone: string | null; rent: number; due_day: number; deposit: number | null; starts_on: string; ends_on: string | null; document_id: string | null; status: string; notes: string | null }
interface D { properties: Pr[]; units: Un[]; leases: Le[]; upcoming: { unit_id: string; starts: string; ends: string; confirmation_code: string | null; kind: string; guest: string | null }[]; activity: { unit_id: string; event: string; detail: string | null; created_at: string }[]; entities: { id: string; name: string }[]; admin: boolean }
const { data, refresh } = await useFetch<D>('/api/rentals/properties')
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const KIND: Record<string, string> = { house: 'House', adu: 'ADU', apartment: 'Apartment', condo: 'Condo', other: 'Other' }
const unitsOf = (pid: string) => (data.value?.units ?? []).filter((u) => u.property_id === pid)
const leaseOf = (uid: string) => (data.value?.leases ?? []).find((l) => l.unit_id === uid && l.status === 'active') ?? null
const today = new Date().toISOString().slice(0, 10)
const resv = (uid: string) => (data.value?.upcoming ?? []).filter((x) => x.unit_id === uid && x.kind === 'reserved')
const current = (uid: string) => resv(uid).find((s) => s.starts <= today && s.ends > today) ?? null
const nextStays = (uid: string) => resv(uid).filter((s) => s.starts > today).slice(0, 3)
const nightsOf = (s: { starts: string; ends: string }) => Math.round((new Date(s.ends + 'T00:00:00Z').getTime() - new Date(s.starts + 'T00:00:00Z').getTime()) / 86400000)
const short = (g: string | null) => { if (!g) return 'Guest'; const p = g.trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1]![0] + '.' : p[0]! }
// Next 30 days as a strip: booked, blocked, free.
const strip = (uid: string) => { const t0 = new Date(today + 'T00:00:00Z').getTime(); return (data.value?.upcoming ?? []).filter((x) => x.unit_id === uid).map((s) => { const a = Math.max(0, (new Date(s.starts + 'T00:00:00Z').getTime() - t0) / 86400000), b = Math.min(30, (new Date(s.ends + 'T00:00:00Z').getTime() - t0) / 86400000); return { kind: s.kind, left: (a / 30 * 100) + '%', width: (Math.max(b - a, 0) / 30 * 100) + '%' } }).filter((x) => x.width !== '0%') }
const booked30 = (uid: string) => { const t0 = new Date(today + 'T00:00:00Z').getTime(); let n = 0; for (const s of resv(uid)) n += Math.max(0, Math.min(30, (new Date(s.ends + 'T00:00:00Z').getTime() - t0) / 86400000) - Math.max(0, (new Date(s.starts + 'T00:00:00Z').getTime() - t0) / 86400000)); return Math.round(n) }
const propStats = (pid: string) => { const us = unitsOf(pid); const rated = us.filter((u) => u.rating); const reviews = rated.reduce((t, u) => t + (u.review_count ?? 0), 0); const avg = reviews ? rated.reduce((t, u) => t + Number(u.rating) * (u.review_count ?? 0), 0) / reviews : null; const cal = us.filter((u) => u.ical_url); return { units: us.length, inNow: us.filter((u) => current(u.id)).length, avg, reviews, occ: cal.length ? Math.round(cal.reduce((t, u) => t + booked30(u.id), 0) / (cal.length * 30) * 100) : null } }
// Photos
const gal = reactive({ open: false, title: '', images: [] as string[], i: 0 })
function photos(u: Un) { const im = u.images?.length ? u.images : u.image_url ? [u.image_url] : []; if (im.length) Object.assign(gal, { open: true, title: u.name, images: im, i: 0 }) }
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
      <div class="ph">
        <div class="pt"><h2>{{ p.name }}</h2><span>{{ KIND[p.kind] }}{{ p.bedrooms ? ' · ' + p.bedrooms + ' bedroom' + (p.bedrooms === 1 ? '' : 's') : '' }} · {{ p.ownership === 'owned' ? 'Owned' : 'Leased' }}{{ p.address ? ' · ' + p.address : '' }}</span></div>
        <div class="ps"><div><em>{{ propStats(p.id).units === 1 ? 'Unit' : 'Rooms' }}</em><b>{{ propStats(p.id).units }}</b></div><div><em>Occupied tonight</em><b>{{ propStats(p.id).inNow }} / {{ propStats(p.id).units }}</b></div><div><em>Booked · next 30 days</em><b>{{ propStats(p.id).occ === null ? '—' : propStats(p.id).occ + '%' }}</b></div><div v-if="propStats(p.id).avg"><em>Rating</em><b>★ {{ propStats(p.id).avg!.toFixed(2) }} <small>{{ propStats(p.id).reviews }}</small></b></div></div>
        <div v-if="data.admin" class="pa"><button type="button" class="lk" @click="editUnit(p.id)">+ Room / unit</button><button type="button" class="lk" @click="editProp(p)">Edit</button></div>
      </div>
      <div class="rows">
        <div v-for="u in unitsOf(p.id)" :key="u.id" class="ur">
          <button type="button" class="th" :style="{ backgroundImage: (u.images?.[0] ?? u.image_url) ? 'url(' + (u.images?.[0] ?? u.image_url) + ')' : undefined }" :aria-label="'Photos of ' + u.name" @click="photos(u)"><span v-if="!(u.images?.[0] ?? u.image_url)" class="np">{{ u.rental_model === 'room' ? 'Room' : 'Unit' }}</span><span v-if="(u.images?.length ?? 0) > 1" class="nb">{{ u.images.length }} photos</span></button>
          <div class="um">
            <div class="ut"><b>{{ u.name }}</b><span v-if="u.rating" class="rt">★ {{ Number(u.rating).toFixed(2) }} <em>· {{ u.review_count ?? 0 }}</em></span></div>
            <span class="sub">{{ u.title ?? '' }}{{ u.title ? ' · ' : '' }}{{ u.rental_model === 'room' ? 'Room' : 'Entire place' }} · {{ u.source === 'airbnb' ? 'Airbnb' : 'Direct lease' }}</span>
            <template v-if="u.source === 'airbnb'">
              <span v-if="current(u.id)" class="pill occ">Occupied · {{ short(current(u.id)!.guest) }} until {{ day(current(u.id)!.ends) }}</span>
              <span v-else-if="nextStays(u.id)[0]" class="pill vac">Vacant · next check-in {{ day(nextStays(u.id)[0]!.starts) }}</span>
              <span v-else-if="u.ical_url" class="pill vac">Vacant · nothing booked yet</span>
              <div v-if="u.ical_url" class="strip" :title="booked30(u.id) + ' of the next 30 nights booked'"><span v-for="(b, i) in strip(u.id)" :key="i" :class="b.kind" :style="{ left: b.left, width: b.width }" /></div>
              <span v-if="u.ical_url" class="sl"><span>Next 30 days · {{ booked30(u.id) }} nights booked</span></span>
            </template>
            <template v-else>
              <div v-if="leaseOf(u.id)" class="lease"><span class="pill occ">Leased · {{ leaseOf(u.id)!.tenant_name }}</span><span>${{ leaseOf(u.id)!.rent.toLocaleString('en-US') }}/month, due day {{ leaseOf(u.id)!.due_day }}{{ leaseOf(u.id)!.deposit ? ' · deposit $' + leaseOf(u.id)!.deposit!.toLocaleString('en-US') : '' }} · {{ leaseOf(u.id)!.starts_on }} → {{ leaseOf(u.id)!.ends_on ?? 'open-ended' }}</span>
                <span class="links"><button v-if="leaseOf(u.id)!.document_id" type="button" class="lk" @click="openDoc(leaseOf(u.id)!.document_id!)"><FileBadge name="lease.pdf" size="sm" /> Signed lease</button><label v-if="data.admin" class="lk up">{{ leaseOf(u.id)!.document_id ? 'Replace lease' : 'Upload signed lease' }}<input type="file" accept=".pdf,.png,.jpg,.jpeg" @change="leaseDoc(leaseOf(u.id)!, $event)"></label><button v-if="data.admin" type="button" class="lk" @click="editLease(u.id, leaseOf(u.id))">Edit lease</button></span></div>
              <button v-else-if="data.admin" type="button" class="lk" @click="editLease(u.id)">+ Add lease</button><span v-else class="sub">No lease recorded.</span>
            </template>
          </div>
          <div class="nx">
            <template v-if="u.source === 'airbnb'"><h3>Coming up</h3>
              <div v-for="(s, i) in nextStays(u.id)" :key="i" class="st"><b>{{ day(s.starts) }} – {{ day(s.ends) }}</b><span>{{ short(s.guest) }} · {{ nightsOf(s) }} night{{ nightsOf(s) === 1 ? '' : 's' }}</span></div>
              <p v-if="!nextStays(u.id).length" class="sub">{{ u.ical_url ? 'No check-ins in the next 90 days.' : 'Add the calendar link to see bookings.' }}</p></template>
          </div>
          <div class="ua">
            <a v-if="u.airbnb_listing_id" :href="'https://www.airbnb.com/rooms/' + u.airbnb_listing_id" target="_blank" rel="noopener">Airbnb listing ↗</a>
            <span v-if="u.source === 'airbnb'" :class="u.ical_url ? (u.ical_synced_at ? 'mut' : 'warn') : 'warn'" class="sm">{{ u.ical_url ? (u.ical_synced_at ? '✓ Calendar ' + when(u.ical_synced_at) : 'Calendar not synced yet') : 'No calendar link' }}</span>
            <span v-if="u.refresh_error" class="warn sm">Listing page unreadable</span>
            <button v-if="data.admin" type="button" class="lk" @click="editUnit(p.id, u)">Edit unit</button>
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
    <AppModal :open="gal.open" :title="gal.title" wide @close="gal.open = false">
      <div class="lb"><img :src="gal.images[gal.i]" :alt="gal.title"><div class="lbt"><button v-for="(im, i) in gal.images" :key="i" type="button" :class="{ on: i === gal.i }" :style="{ backgroundImage: 'url(' + im + ')' }" :aria-label="'Photo ' + (i + 1)" @click="gal.i = i" /></div></div>
    </AppModal>
  </div>
</template>
<style scoped>
.pp { display: flex; flex-direction: column; gap: 14px; } .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .bar .mut { max-width: 640px; } .sp { flex: 1; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .okm { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; }
.prop { display: flex; flex-direction: column; gap: 0; padding: 0; } .ph { display: flex; gap: 18px; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--c-rule); flex-wrap: wrap; } .pt { flex: 1; min-width: 240px; } .ph h2 { margin: 0; font-size: 18px; } .pt span { font-size: 13px; color: var(--c-muted); }
.ps { display: flex; gap: 0; border: 1px solid var(--c-rule); } .ps > div { padding: 6px 14px; border-left: 1px solid var(--c-rule); display: flex; flex-direction: column; } .ps > div:first-child { border-left: 0; } .ps em { font-style: normal; font-size: 11.5px; color: var(--c-muted); white-space: nowrap; } .ps b { font-size: 15px; color: var(--c-navy); white-space: nowrap; } .ps small { font-weight: 400; font-size: 11.5px; color: var(--c-muted); }
.pa { display: flex; gap: 14px; }
.rows { display: flex; flex-direction: column; } .ur { display: grid; grid-template-columns: 168px minmax(0, 1.5fr) minmax(0, 1fr) 170px; gap: 18px; padding: 14px 18px; border-top: 1px solid var(--c-rule); align-items: start; } .ur:first-child { border-top: 0; }
.th { width: 168px; height: 112px; border: 0; padding: 0; background: var(--c-paper-2) center / cover no-repeat; position: relative; cursor: pointer; } .th .nb { position: absolute; right: 6px; bottom: 6px; background: rgba(12,26,46,.75); color: #fff; font-size: 11px; padding: 2px 6px; } .np { color: var(--c-muted); font-size: 12px; }
.um { display: flex; flex-direction: column; gap: 6px; min-width: 0; } .ut { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; } .ut b { font-size: 15px; } .rt { font-size: 13px; white-space: nowrap; } .rt em { font-style: normal; color: var(--c-muted); }
.pill { align-self: flex-start; font-size: 12.5px; padding: 3px 8px; } .pill.occ { background: #e8eef5; color: var(--c-navy); } .pill.vac { background: #eef3f7; color: #1f496b; }
.strip { position: relative; height: 8px; background: var(--c-paper-2); } .strip span { position: absolute; top: 0; bottom: 0; } .strip .reserved { background: var(--c-blue, #1c547d); border-right: 1px solid #fff; } .strip .blocked { background: repeating-linear-gradient(135deg, #cfd4db 0 3px, #eceef1 3px 6px); } .sl { font-size: 11.5px; color: var(--c-muted); }
.nx h3 { margin: 0 0 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; } .st { display: flex; flex-direction: column; padding: 5px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .st:first-of-type { border-top: 0; padding-top: 0; } .st b { font-weight: 600; } .st span { color: var(--c-ink-soft); font-size: 12.5px; }
.ua { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; text-align: right; font-size: 13px; } .ua a { color: var(--c-blue-deep); text-decoration: none; }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .links { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px; align-items: center; } .links a { color: var(--c-blue-deep); text-decoration: none; }
.okt { color: var(--c-ok); } .warn { color: #a5650b; } .sm { font-size: 12px; } .lease { font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.lb { display: flex; flex-direction: column; gap: 10px; } .lb img { width: 100%; max-height: 62vh; object-fit: contain; background: var(--c-paper-2); } .lbt { display: flex; gap: 6px; overflow-x: auto; } .lbt button { flex: none; width: 84px; height: 56px; border: 2px solid transparent; padding: 0; background: center / cover no-repeat; cursor: pointer; } .lbt button.on { border-color: var(--c-navy); }
@media (max-width: 1100px) { .ur { grid-template-columns: 140px minmax(0, 1fr) minmax(0, 1fr); } .th { width: 140px; height: 96px; } .ua { grid-column: 2 / -1; flex-direction: row; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 14px; } }
@media (max-width: 700px) { .ur { grid-template-columns: 1fr; } .th { width: 100%; height: 180px; } .ua { grid-column: auto; } .ps { flex-wrap: wrap; } }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; } .lk.up { position: relative; overflow: hidden; } .lk.up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g4 { display: grid; grid-template-columns: 1.3fr .8fr .8fr 1.6fr; gap: 8px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; margin: 0; } .ef input, .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .hint { font-style: normal; font-size: 12px; color: var(--c-muted); }
@media (max-width: 800px) { .g3, .g4 { grid-template-columns: 1fr; } }
</style>
