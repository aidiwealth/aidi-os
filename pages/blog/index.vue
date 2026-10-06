<script setup lang="ts">
useHead({ title: 'Blog' })
interface P { id: string; slug: string; title: string; description: string | null; tag: string | null; status: string; featured: boolean; published_at: string | null; updated_at: string; chars: number; cover_id: string | null }
const { data } = await useFetch<P[]>('/api/blog')
const filter = ref<'all' | 'published' | 'draft'>('all')
const list = computed(() => (data.value ?? []).filter((p) => filter.value === 'all' || p.status === filter.value))
async function create() { const r = await $fetch<{ id: string }>('/api/blog', { method: 'POST', body: { title: 'Untitled article', slug: 'untitled-' + Date.now().toString(36) } }); await navigateTo('/blog/' + r.id) }
</script>
<template>
  <section>
    <p class="label">Administration</p>
    <div class="head"><div><h1>Blog</h1><p class="lead">Articles published here appear in the Insights section of theaidigroup.com.</p></div><div class="tools"><a href="https://theaidigroup.com/insights" target="_blank" class="btn secondary">View Insights</a><button class="btn" @click="create">New article</button></div></div>
    <div class="chips"><button v-for="[k, l] in [['all', 'All'], ['published', 'Published'], ['draft', 'Drafts']]" :key="k" :class="{ on: filter === k }" @click="filter = k as 'all'">{{ l }} {{ k === 'all' ? data?.length ?? 0 : data?.filter((p) => p.status === k).length ?? 0 }}</button></div>
    <div v-if="list.length" class="grid">
      <NuxtLink v-for="p in list" :key="p.id" :to="'/blog/' + p.id" class="post"><div class="cov"><img v-if="p.cover_id" :src="'/api/public/media/' + p.cover_id" alt=""><span v-else>{{ (p.tag ?? 'Insights').slice(0, 1) }}</span></div>
        <div class="pb"><span class="st" :class="p.status">{{ p.status === 'published' ? 'Published ' + (p.published_at ?? '') : 'Draft' }}{{ p.featured ? ' · Featured' : '' }}</span><b>{{ p.title }}</b><span class="d">{{ p.description }}</span><em>{{ p.tag }} · {{ Math.max(1, Math.round(p.chars / 1300)) }} min read</em></div></NuxtLink>
    </div>
    <EmptyState v-else card icon="documents" title="No articles yet" text="Write your first article. It goes live on theaidigroup.com/insights when you publish."><button class="btn" @click="create">New article</button></EmptyState>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; } .tools { display: flex; gap: 8px; } .tools a { text-decoration: none; }
.chips { display: flex; gap: 6px; margin: 16px 0; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; } .post { background: #fff; border: 1px solid var(--c-rule); text-decoration: none; color: inherit; display: flex; flex-direction: column; transition: border-color .12s, box-shadow .12s; } .post:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); }
.cov { height: 150px; background: linear-gradient(135deg, #0c1a2e, #1c3d63); display: grid; place-items: center; overflow: hidden; } .cov img { width: 100%; height: 100%; object-fit: cover; } .cov span { color: rgba(255,255,255,.5); font-size: 40px; font-weight: 600; }
.pb { padding: 14px 16px; display: flex; flex-direction: column; gap: 5px; } .pb b { font-size: 16px; line-height: 1.3; } .d { font-size: 13px; color: var(--c-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .pb em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.st { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); } .st.published { color: var(--c-ok); }
</style>
