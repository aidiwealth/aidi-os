<script setup lang="ts">
const { canPath } = useModuleAccess()
// Your public investor page: what investors see at finvry.com/c/your-company. Metrics come from Financials.
useHead({ title: 'Investor page' })
interface Pg { forecast_id?: string | null; captable_id?: string | null; captable_detail?: 'summary' | 'holders'; deck_id?: string | null; board_id?: string | null; logo_id?: string | null; cover_id?: string | null; slug: string; published: boolean; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; metrics: string[]; period_type: string; views: number; last_viewed_at: string | null }
const { data, refresh } = await useFetch<{ room?: { available: boolean; files?: number; on?: boolean; views?: number }; page: Pg; exists: boolean; base: string; metrics: { key: string; label: string }[]; company: string }>('/api/investor-page')
const f = reactive({ forecast_id: null as string | null, captable_id: null as string | null, captable_detail: 'summary' as 'summary' | 'holders', deck_id: null as string | null, board_id: null as string | null, logo_id: null as string | null, cover_id: null as string | null, slug: '', published: false, headline: '', about: '', website: '', deck_url: '', contact_email: '', metrics: [] as string[], period_type: 'month' })
watchEffect(() => { const p = data.value?.page; if (p) Object.assign(f, { forecast_id: p.forecast_id ?? null, captable_id: p.captable_id ?? null, captable_detail: p.captable_detail ?? 'summary', deck_id: p.deck_id ?? null, board_id: p.board_id ?? null, logo_id: p.logo_id ?? null, cover_id: p.cover_id ?? null, slug: p.slug, published: p.published, headline: p.headline ?? '', about: p.about ?? '', website: p.website ?? '', deck_url: p.deck_url ?? '', contact_email: p.contact_email ?? '', metrics: [...p.metrics], period_type: p.period_type }) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const { data: deckList } = await useFetch<{ decks: { id: string; title: string; primary_deck: boolean; stats: { total: number } }[] }>('/api/documents/decks', { key: 'page-decks' })
const { data: boards } = await useFetch<{ boards: { id: string; name: string; audience: string }[] }>('/api/financials/boards', { key: 'page-boards', immediate: canPath('/financials/boards'), default: () => ({ boards: [] }) })
const { data: fcs } = await useFetch<{ forecasts: { id: string; name: string }[] }>('/api/forecast', { key: 'page-fcs', immediate: canPath('/forecast'), default: () => ({ forecasts: [] }) })
const { data: cts } = await useFetch<{ captables: { id: string; name: string }[] }>('/api/equity', { key: 'page-cts', immediate: canPath('/cap-table'), default: () => ({ captables: [] }) })
const { data: mainDeck } = await useFetch<{ url: string | null; title: string | null }>('/api/documents/decks/primary', { key: 'main-deck' })
async function upImg(kind: 'cover_id', ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); try { f[kind] = (await $fetch<{ id: string }>('/api/investor-page/media', { method: 'POST', body: fd })).id; await save() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } }
async function save(publish?: boolean) {
  busy.value = true; msg.value = ''; ok.value = ''
  if (publish !== undefined) f.published = publish
  try { const r = await $fetch<{ url: string }>('/api/investor-page', { method: 'POST', body: { ...f, logo_id: undefined } }); ok.value = f.published ? 'Live at ' + r.url : 'Saved (not published).'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
async function setRoom(on: boolean) { busy.value = true; msg.value = ''; try { await $fetch('/api/investor-page', { method: 'POST', body: { ...f, room: on } }); await refresh(); ok.value = on ? 'Data room button added.' : 'Data room button removed.' } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false } }
</script>

<template>
  <section v-if="data">
    <p class="label">Investor relations</p>
    <InvestorTabs />
    <div class="hd"><h1>Investor page</h1><div class="row"><a v-if="data.page.published" :href="data.base + data.page.slug" target="_blank" rel="noopener" class="btn secondary">View live page</a>
      <button class="btn" type="button" :disabled="busy" @click="save(!f.published)">{{ f.published ? 'Unpublish' : 'Publish' }}</button></div></div>
    <p class="lead">A public page for {{ data.company }}, like the investor relations page of a listed company: your story and your key numbers, updated automatically from Financials. Share the link with investors, put it on your website, or add it to your deck. {{ data.page.published ? data.page.views + ' views so far.' : '' }}</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <form class="grid" @submit.prevent="save()">
      <div class="card frm">
        <div class="imgs"><div class="label">Logo<CompanyLogo :company="data.company" note="Your logo is set once in Settings." /></div>
          <div class="label">Cover image<div class="cv"><img v-if="f.cover_id" :src="'/api/public/media/' + f.cover_id" alt=""><DropZone compact accept=".png,.jpg,.jpeg,.webp" :label="f.cover_id ? 'Replace cover image' : 'Upload a cover image'" hint="Wide image, e.g. 1600 × 600" @change="upImg('cover_id', $event)" /><button v-if="f.cover_id" type="button" class="lk" @click="f.cover_id = null; save()">Remove</button></div></div></div>
        <label class="label">Page address<span class="addr"><span>{{ data.base }}</span><input v-model="f.slug" required maxlength="41"></span></label>
        <div class="label"><span class="lh">Headline<AiWrite v-model="f.headline" purpose="investor_page" field="headline" :context="{ about: f.about, website: f.website }" /></span><input v-model="f.headline" maxlength="200" placeholder="e.g. AI voice infrastructure for Africa"></div>
        <div class="label"><span class="lh">About the company<AiWrite v-model="f.about" purpose="investor_page" field="about" :context="{ headline: f.headline, website: f.website }" /></span><ClientOnly><RichEditor v-model="f.about" :min-height="280" :max-length="60000" placeholder="What you do, who you serve, traction, team." /></ClientOnly></div>
        <div class="two"><label class="label">Website<input v-model="f.website" maxlength="300" placeholder="https://"></label><label class="label">Deck<select v-model="f.deck_id"><option :value="null">{{ deckList?.decks.length ? 'Main deck (★ in Decks)' : 'No deck yet' }}</option><option v-for="d in deckList?.decks ?? []" :key="d.id" :value="d.id">{{ d.title }}{{ d.primary_deck ? ' ★' : '' }} · {{ d.stats.total }} views</option></select>
          <span class="muted">Shown with viewer analytics. <NuxtLink v-if="canPath('/decks')" to="/decks">Upload or manage decks</NuxtLink>{{ deckList?.decks.length ? '' : ' (none yet)' }}.</span></label>
        <label v-if="!deckList?.decks.length" class="label">Or a deck link<input v-model="f.deck_url" maxlength="500" placeholder="https://"></label></div>
        <label class="label">Contact email for investors<input v-model="f.contact_email" type="email" maxlength="254"></label>
        <div v-if="data.room?.available" class="room"><label class="chk"><input type="checkbox" :checked="data.room.on" :disabled="busy" @change="setRoom(($event.target as HTMLInputElement).checked)"> Show an “Open data room” button</label>
          <span class="muted">{{ data.room.files ? data.room.files + ' file' + (data.room.files === 1 ? '' : 's') + ' in your data room.' : 'Your data room is empty.' }} Investors give their email to open it; your NDA applies and you are notified, like any data room link.{{ data.room.on ? ' ' + data.room.views + ' views so far.' : '' }} <NuxtLink to="/fundraising">Manage the data room</NuxtLink></span></div>
      </div>
      <div class="card frm">
        <b>Numbers to show</b>
        <label v-if="canPath('/financials/boards')" class="label">Source<select v-model="f.board_id"><option :value="null">Choose metrics here</option><option v-for="b in boards?.boards ?? []" :key="b.id" :value="b.id">{{ b.name }} board (same figures and charts)</option></select></label>
        <p v-if="f.board_id && canPath('/financials/boards')" class="muted">The page shows this board exactly as in <NuxtLink v-if="canPath('/financials/boards')" to="/financials/boards">Boards</NuxtLink><template v-else>Boards</template>. Change its figures and charts there.</p>
        <template v-else><p class="muted">Pick up to 8. Investors see the latest value, the change and a trend chart.</p>
        <label v-for="m in data.metrics" :key="m.key" class="chk"><input v-model="f.metrics" type="checkbox" :value="m.key" :disabled="!f.metrics.includes(m.key) && f.metrics.length >= 8"> {{ m.label }}</label>
        <label class="label">Show figures<select v-model="f.period_type"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label></template>
        <template v-if="canPath('/forecast') || canPath('/cap-table')"><b class="sb">Forecast and ownership</b>
          <label v-if="canPath('/forecast')" class="label">Forecast<select v-model="f.forecast_id"><option :value="null">Don't show a forecast</option><option v-for="x in fcs?.forecasts ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
          <template v-if="canPath('/cap-table')"><label class="label">Cap table<select v-model="f.captable_id"><option :value="null">Don't show ownership</option><option v-for="x in cts?.captables ?? []" :key="x.id" :value="x.id">{{ x.name }}</option></select></label>
            <label v-if="f.captable_id" class="label">Show<select v-model="f.captable_detail"><option value="summary">Ownership by group only (founders, investors, team, pool)</option><option value="holders">Every holder, with shares and SAFEs</option></select></label>
            <p v-if="f.captable_id" class="muted">The page is public{{ f.captable_detail === 'holders' ? ': everyone who opens it sees each holder by name. For named holders, a private link from Cap table → Share is usually better.' : '. Names are not shown.' }}</p></template></template>
        <button class="btn" type="submit" :disabled="busy">Save</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.hd { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; } .row { display: flex; gap: 8px; } .row a { text-decoration: none; } .lead { color: var(--c-ink-soft); max-width: 780px; }
.grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; align-items: start; } .frm { display: flex; flex-direction: column; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, textarea, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.addr { display: flex; align-items: center; border: 1px solid var(--c-rule-strong); } .addr span { padding: 0 8px; font-size: 13px; color: var(--c-muted); background: var(--c-paper-2); align-self: stretch; display: flex; align-items: center; } .addr input { border: 0; flex: 1; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; } .muted { color: var(--c-muted); font-size: 13px; margin: 0; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 900px) { .grid, .two { grid-template-columns: 1fr; } }
.imgs { display: grid; grid-template-columns: 1fr 1.6fr; gap: 14px; } .lg { display: flex; gap: 12px; align-items: center; } .lg img, .ph { width: 64px; height: 64px; object-fit: contain; border: 1px solid var(--c-rule); background: #fff; flex: none; } .ph { display: grid; place-items: center; font-size: 26px; font-weight: 600; color: var(--c-muted); } .cv { display: flex; flex-direction: column; gap: 6px; } .cv img { width: 100%; height: 110px; object-fit: cover; } .lk { background: none; border: 0; color: var(--c-danger); cursor: pointer; font: inherit; font-size: 12.5px; align-self: flex-start; } @media (max-width: 900px) { .imgs { grid-template-columns: 1fr; } }
.room { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; background: var(--c-signal-soft); }
.sb { margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--c-rule); }
div.label { display: flex; flex-direction: column; gap: 6px; } .lh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
</style>
