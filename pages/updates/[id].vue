<script setup lang="ts">
// Write an investor update: notes, AI draft, edit with preview, publish on the investor page, send to investors.
const id = useRoute().params.id as string
interface D { update: { title: string; period_type: string; period_end: string; highlights: string | null; challenges: string | null; asks: string | null; body: string | null; status: string; published_at: string | null }
  figures: { currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null; months: number }; sends: { investor_id: string; name: string; email: string; sent_at: string; opened_at: string | null; opens: number }[]
  investors: { id: string; name: string; email: string; firm: string | null }[]; page: { slug: string; published: boolean } | null; label: string }
const { data, refresh } = await useFetch<D>('/api/updates/' + id)
useHead({ title: () => data.value?.update.title ?? 'Update' })
const f = reactive({ title: '', highlights: '', challenges: '', asks: '', body: '' })
watchEffect(() => { const u = data.value?.update; if (u) Object.assign(f, { title: u.title, highlights: u.highlights ?? '', challenges: u.challenges ?? '', asks: u.asks ?? '', body: u.body ?? '' }) })
const pick = ref<string[]>([]); const view = ref<'edit' | 'preview'>('edit')
const msg = ref(''); const ok = ref(''); const busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save(status?: string) { busy.value = 'save'; msg.value = ''; ok.value = ''; try { await $fetch('/api/updates/' + id, { method: 'POST', body: { ...f, status } }); ok.value = status === 'published' ? 'Published on your investor page.' : status === 'draft' ? 'Unpublished.' : 'Saved.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function generate() { busy.value = 'ai'; msg.value = ''; try { const r = await $fetch<{ title: string; body: string }>('/api/updates/' + id + '/generate', { method: 'POST', body: { highlights: f.highlights, challenges: f.challenges, asks: f.asks } }); f.title = r.title; f.body = r.body; view.value = 'preview'; ok.value = 'Draft ready. Read it through and edit anything before you publish or send.' } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function send() { busy.value = 'send'; msg.value = ''; try { await save(); const r = await $fetch<{ sent: number }>('/api/updates/' + id + '/send', { method: 'POST', body: { investor_ids: pick.value } }); ok.value = 'Sent to ' + r.sent + ' investor' + (r.sent === 1 ? '' : 's') + '.'; pick.value = []; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/updates" class="back">← Investor updates</NuxtLink>
    <div class="hd"><div><p class="label">{{ data.label }} · {{ data.update.status === 'published' ? 'Published' : 'Draft' }}</p><input v-model="f.title" class="title" maxlength="200" aria-label="Title"></div>
      <div class="row"><button class="btn secondary" :disabled="!!busy" @click="save()">Save</button><button class="btn" :disabled="!!busy" @click="save(data.update.status === 'published' ? 'draft' : 'published')">{{ data.update.status === 'published' ? 'Unpublish' : 'Publish' }}</button></div></div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <p v-if="!data.figures.months" class="card warn">No financials yet for this period. Add your figures in <NuxtLink to="/financials">Financials</NuxtLink> so the update can include your numbers.</p>
    <div class="grid">
      <div class="col">
        <div class="card notes"><h3>Your notes</h3><p class="muted">A few words each. The AI turns these and your numbers into the update.</p>
          <label class="label">Highlights<textarea v-model="f.highlights" rows="3" maxlength="4000" placeholder="e.g. Signed 3 enterprise customers; launched Yoruba voice" /></label>
          <label class="label">Challenges<textarea v-model="f.challenges" rows="2" maxlength="4000" placeholder="e.g. Hiring a senior engineer is slow" /></label>
          <label class="label">How investors can help<textarea v-model="f.asks" rows="2" maxlength="2000" placeholder="e.g. Intros to banks in Kenya" /></label>
          <button class="btn" :disabled="!!busy" @click="generate">{{ busy === 'ai' ? 'Writing…' : f.body ? 'Rewrite with AI' : 'Write the update with AI' }}</button></div>
        <div class="card"><div class="vt"><button :class="{ on: view === 'edit' }" @click="view = 'edit'">Edit</button><button :class="{ on: view === 'preview' }" @click="view = 'preview'">Preview</button></div>
          <textarea v-if="view === 'edit'" v-model="f.body" rows="22" maxlength="30000" class="body" placeholder="## Key metrics&#10;- Revenue …" />
          <UpdateView v-else :title="f.title" :label="data.label" :body="f.body" company="" :currency="data.figures.currency" :current="data.figures.current" :previous="data.figures.previous" /></div>
      </div>
      <div class="col side">
        <div class="card"><h3>Send to investors</h3>
          <p v-if="!data.investors.length" class="muted">No investors yet. <NuxtLink to="/updates">Add your investor list</NuxtLink>.</p>
          <label v-for="i in data.investors" :key="i.id" class="chk"><input v-model="pick" type="checkbox" :value="i.id"> {{ i.name }}<em>{{ i.firm ?? i.email }}</em></label>
          <div v-if="data.investors.length" class="row"><button type="button" class="link" @click="pick = data.investors.map((i) => i.id)">Select all</button><button class="btn" :disabled="!pick.length || !!busy" @click="send">{{ busy === 'send' ? 'Sending…' : 'Send to ' + pick.length }}</button></div></div>
        <div v-if="data.sends.length" class="card"><h3>Opens</h3><div v-for="s in data.sends" :key="s.investor_id" class="li"><span>{{ s.name }}</span><b :class="{ ok: s.opened_at }">{{ s.opened_at ? 'Opened ' + when(s.opened_at) + (s.opens > 1 ? ' · ' + s.opens + '×' : '') : 'Not opened' }}</b></div></div>
        <div class="card"><h3>On your investor page</h3><p class="muted">{{ data.update.status === 'published' ? 'This update is listed on your investor page.' : 'Publish to list it on your investor page.' }}</p>
          <a v-if="data.page?.published" :href="'/c/' + data.page.slug" target="_blank" rel="noopener" class="link">View investor page →</a><NuxtLink v-else to="/investor-page" class="link">Set up your investor page →</NuxtLink></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.back { display: inline-block; margin-bottom: 10px; color: var(--c-muted); } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd > div:first-child { flex: 1; min-width: 280px; }
.title { width: 100%; font-family: var(--font-heading); font-size: 32px; border: 0; border-bottom: 1px dashed var(--c-rule-strong); padding: 4px 0; background: transparent; color: var(--c-navy); } .row { display: flex; gap: 8px; align-items: center; }
.grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 14px; margin-top: 14px; align-items: start; } .col { display: flex; flex-direction: column; gap: 14px; } h3 { margin: 0 0 8px; } .notes { display: flex; flex-direction: column; gap: 10px; } label.label { display: flex; flex-direction: column; gap: 5px; }
textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); width: 100%; box-sizing: border-box; } .body { font-family: ui-monospace, Menlo, monospace; font-size: 13.5px; line-height: 1.55; }
.vt { display: flex; gap: 16px; margin-bottom: 10px; } .vt button { background: none; border: 0; padding: 4px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .vt .on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.chk { display: flex; gap: 8px; align-items: baseline; font-size: 14px; padding: 4px 0; } .chk input { width: auto; } .chk em { font-style: normal; font-size: 12px; color: var(--c-muted); margin-left: auto; }
.li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .li b { font-weight: 400; color: var(--c-muted); } .li b.ok { color: var(--c-ok); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .muted { color: var(--c-muted); font-size: 13px; margin: 0 0 8px; } .warn { border-left: 3px solid var(--c-warn); margin: 12px 0 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
