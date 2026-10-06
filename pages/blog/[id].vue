<script setup lang="ts">
// Blog editor: title, cover, body (rich text saved as Markdown), details and SEO; save as draft or publish.
definePageMeta({ fullBleed: true })
const id = useRoute().params.id as string
interface P { id: string; slug: string; title: string; description: string | null; tag: string | null; body: string; cover_id: string | null; author_name: string | null; status: string; featured: boolean; sort: number; published_at: string | null; seo_title: string | null; seo_description: string | null }
const { data } = await useFetch<P>('/api/blog/' + id)
useHead({ title: () => (data.value?.title ?? 'Article') + ' — Blog' })
const f = reactive({ title: '', slug: '', description: '', tag: '', body: '', cover_id: null as string | null, author_name: '', status: 'draft', featured: false, sort: 0, published_at: '', seo_title: '', seo_description: '' })
watch(data, (p) => { if (p) Object.assign(f, { ...p, description: p.description ?? '', tag: p.tag ?? '', author_name: p.author_name ?? '', published_at: p.published_at ?? '', seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '' }) }, { immediate: true })
const state = ref(''); const msg = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function save(status?: string) { state.value = 'Saving…'; msg.value = ''; try { const r = await $fetch<{ slug: string }>('/api/blog', { method: 'POST', body: { ...f, id, status: status ?? f.status } }); f.slug = r.slug; if (status) f.status = status; state.value = f.status === 'published' ? 'Published' : 'Saved' } catch (e) { state.value = ''; msg.value = err(e) } }
let t: ReturnType<typeof setTimeout> | undefined
watch(() => [f.title, f.body, f.description, f.tag], () => { if (f.status === 'draft') { clearTimeout(t); t = setTimeout(() => save(), 1500) } }, { deep: true })
const words = computed(() => (f.body.match(/\w+/g)?.length ?? 0))
async function upload(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); try { const r = await $fetch<{ id: string }>('/api/blog/media', { method: 'POST', body: fd }); f.cover_id = r.id; await save() } catch (e) { msg.value = err(e) } }
async function uploadImg(file: File): Promise<string> { const fd = new FormData(); fd.append('file', file); try { return (await $fetch<{ url: string }>('/api/blog/media', { method: 'POST', body: fd })).url } catch (e) { msg.value = err(e); throw e } }
const live = computed(() => 'https://theaidigroup.com/insights/' + f.slug)
</script>
<template>
  <div v-if="data" class="be">
    <div class="bar"><NuxtLink to="/blog" class="back">← Blog</NuxtLink><span class="st">{{ state || (f.status === 'published' ? 'Published' : 'Draft') }}</span>
      <div class="acts"><a v-if="f.status === 'published'" :href="live" target="_blank" class="btn secondary">View live</a><button class="btn secondary" @click="save(f.status === 'published' ? 'draft' : 'draft')">{{ f.status === 'published' ? 'Unpublish' : 'Save draft' }}</button><button class="btn" @click="save('published')">{{ f.status === 'published' ? 'Update' : 'Publish' }}</button></div></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="cols">
      <main>
        <div class="cover"><img v-if="f.cover_id" :src="'/api/public/media/' + f.cover_id" alt=""><DropZone compact accept=".png,.jpg,.jpeg,.gif,.webp" :label="f.cover_id ? 'Replace cover image' : 'Add a cover image'" hint="Drop it here or click to choose" @change="upload" /></div>
        <input v-model="f.title" class="title" placeholder="Article title" maxlength="200">
        <textarea v-model="f.description" class="dek" rows="2" maxlength="500" placeholder="A one or two sentence summary shown on the Insights page" />
        <RichEditor v-model="f.body" :min-height="420" placeholder="Write the article…" :image-upload="uploadImg" />
        <p class="meta">{{ words }} words · about {{ Math.max(1, Math.round(words / 220)) }} min read</p>
      </main>
      <aside>
        <div class="card"><h3>Details</h3>
          <label class="label">Category<input v-model="f.tag" maxlength="60" placeholder="e.g. Investing, Founders, AI"></label>
          <label class="label">Author<input v-model="f.author_name" maxlength="120" placeholder="e.g. Emmanuel Gbolade"></label>
          <label class="label">Address<span class="sl">theaidigroup.com/insights/<input v-model="f.slug" maxlength="120"></span></label>
          <label class="label">Publish date<input v-model="f.published_at" type="date"></label>
          <label class="cb"><input v-model="f.featured" type="checkbox"> Feature at the top of Insights</label>
          <label class="label">Order (lower shows first)<input v-model.number="f.sort" type="number"></label></div>
        <div class="card"><h3>Search and sharing</h3>
          <label class="label">SEO title<input v-model="f.seo_title" maxlength="200" :placeholder="f.title"></label>
          <label class="label">SEO description<textarea v-model="f.seo_description" rows="3" maxlength="300" :placeholder="f.description" /></label>
          <div class="serp"><span class="u">{{ live }}</span><b>{{ f.seo_title || f.title }}</b><span>{{ (f.seo_description || f.description).slice(0, 160) }}</span></div></div>
        <div class="card dz"><DeleteButton type="post" :id="id" :name="f.title" to="/blog" /></div>
      </aside>
    </div>
  </div>
</template>
<style scoped>
.be { padding: 0 32px 72px; } .bar { position: sticky; top: var(--topbar-h, 60px); z-index: 3; background: #fff; display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--c-rule); margin-bottom: 18px; } .back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } .st { font-size: 12.5px; color: var(--c-muted); } .acts { margin-left: auto; display: flex; gap: 8px; } .acts a { text-decoration: none; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; max-width: 1240px; } main { min-width: 0; display: flex; flex-direction: column; gap: 12px; max-width: 820px; }
.cover { display: flex; flex-direction: column; gap: 8px; } .cover img { width: 100%; max-height: 340px; object-fit: cover; }
input.title { font: inherit; font-size: 34px !important; font-weight: 700 !important; letter-spacing: -.02em; border: 0; outline: 0; padding: 6px 0; background: none; } textarea.dek { font: inherit; font-size: 17px !important; color: var(--c-ink-soft); border: 0; outline: 0; resize: vertical; background: none; padding: 0; }
.ii { font-size: 13px; color: var(--c-blue-deep); display: flex; gap: 8px; align-items: center; } .ii input { font-size: 12.5px; } .meta { font-size: 12.5px; color: var(--c-muted); margin: 0; }
aside { display: flex; flex-direction: column; gap: 12px; position: sticky; top: calc(var(--topbar-h, 60px) + 70px); align-self: start; } aside h3 { margin: 0 0 10px; font-size: 15px; } aside .card { display: flex; flex-direction: column; gap: 10px; }
label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } input:not([type=checkbox]):not([type=file]), textarea { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .title, .dek { border: 0 !important; padding-left: 0 !important; }
.sl { display: flex; align-items: center; font-size: 12px; color: var(--c-muted); gap: 2px; } .sl input { flex: 1; min-width: 0; } .cb { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.serp { border: 1px solid var(--c-rule); padding: 10px; display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; } .serp .u { color: #1f7a4d; font-size: 12px; word-break: break-all; } .serp b { color: #1a0dab; font-weight: 500; font-size: 15px; } .serp span { color: var(--c-ink-soft); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } aside { position: static; } }
</style>
