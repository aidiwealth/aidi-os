<script setup lang="ts">
// Your public investor page: what investors see at finvry.com/c/your-company. Metrics come from Financials.
useHead({ title: 'Investor page' })
interface Pg { slug: string; published: boolean; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; metrics: string[]; period_type: string; views: number; last_viewed_at: string | null }
const { data, refresh } = await useFetch<{ page: Pg; exists: boolean; base: string; metrics: { key: string; label: string }[]; company: string }>('/api/investor-page')
const f = reactive({ slug: '', published: false, headline: '', about: '', website: '', deck_url: '', contact_email: '', metrics: [] as string[], period_type: 'month' })
watchEffect(() => { const p = data.value?.page; if (p) Object.assign(f, { slug: p.slug, published: p.published, headline: p.headline ?? '', about: p.about ?? '', website: p.website ?? '', deck_url: p.deck_url ?? '', contact_email: p.contact_email ?? '', metrics: [...p.metrics], period_type: p.period_type }) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
async function save(publish?: boolean) {
  busy.value = true; msg.value = ''; ok.value = ''
  if (publish !== undefined) f.published = publish
  try { const r = await $fetch<{ url: string }>('/api/investor-page', { method: 'POST', body: f }); ok.value = f.published ? 'Live at ' + r.url : 'Saved (not published).'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
</script>

<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><h1>Investor page</h1><div class="row"><a v-if="data.page.published" :href="data.base + data.page.slug" target="_blank" rel="noopener" class="btn secondary">View live page</a>
      <button class="btn" type="button" :disabled="busy" @click="save(!f.published)">{{ f.published ? 'Unpublish' : 'Publish' }}</button></div></div>
    <p class="lead">A public page for {{ data.company }}, like the investor relations page of a listed company: your story and your key numbers, updated automatically from Financials. Share the link with investors, put it on your website, or add it to your deck. {{ data.page.published ? data.page.views + ' views so far.' : '' }}</p>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <form class="grid" @submit.prevent="save()">
      <div class="card frm">
        <label class="label">Page address<span class="addr"><span>{{ data.base }}</span><input v-model="f.slug" required maxlength="41"></span></label>
        <label class="label">Headline<input v-model="f.headline" maxlength="200" placeholder="e.g. AI voice infrastructure for Africa"></label>
        <div class="label">About the company<ClientOnly><RichEditor v-model="f.about" compact :min-height="160" :max-length="3000" placeholder="What you do, who you serve, traction, team." /></ClientOnly></div>
        <div class="two"><label class="label">Website<input v-model="f.website" maxlength="300" placeholder="https://"></label><label class="label">Deck link<input v-model="f.deck_url" maxlength="500" placeholder="https://"></label></div>
        <label class="label">Contact email for investors<input v-model="f.contact_email" type="email" maxlength="254"></label>
      </div>
      <div class="card frm">
        <b>Numbers to show</b><p class="muted">Pick up to 8. Investors see the latest value, the change and a trend chart.</p>
        <label v-for="m in data.metrics" :key="m.key" class="chk"><input v-model="f.metrics" type="checkbox" :value="m.key" :disabled="!f.metrics.includes(m.key) && f.metrics.length >= 8"> {{ m.label }}</label>
        <label class="label">Show figures<select v-model="f.period_type"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label>
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
</style>
