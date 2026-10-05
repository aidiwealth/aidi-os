<script setup lang="ts">
// Deal memo: a few notes, an AI draft from your numbers, then edit and share (print to PDF).
const id = useRoute().params.id as string
const { data, refresh } = await useFetch<{ id: string; title: string; notes: Record<string, string>; body: string | null; updated_at: string }>('/api/fundraising/memo/' + id)
useHead({ title: () => data.value?.title ?? 'Deal memo' })
const FIELDS = [['problem', 'The problem you solve'], ['solution', 'Your product'], ['market', 'Market and customers'], ['traction', 'Traction beyond the numbers (customers, pilots, partners)'], ['team', 'Team'], ['competition', 'Competition and why you win'], ['use_of_funds', 'Use of funds']] as const
const f = reactive({ title: '', body: '', notes: {} as Record<string, string> })
watchEffect(() => { if (data.value) Object.assign(f, { title: data.value.title, body: data.value.body ?? '', notes: { ...data.value.notes } }) })
const view = ref<'edit' | 'preview'>('edit'); const msg = ref(''); const ok = ref(''); const busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save() { busy.value = 'save'; msg.value = ''; ok.value = ''; try { await $fetch('/api/fundraising/memo', { method: 'POST', body: { id, ...f } }); ok.value = 'Saved.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function generate() { busy.value = 'ai'; msg.value = ''; try { const r = await $fetch<{ body: string }>('/api/fundraising/memo/generate', { method: 'POST', body: { notes: f.notes } }); f.body = r.body; view.value = 'preview'; await save(); ok.value = 'Draft ready. Fill any [add: …] gaps and edit before sharing.' } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const html = computed(() => renderMarkdown(f.body))
const doPrint = () => window.print()
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/fundraising?t=memo" class="back noprint">← Fundraising</NuxtLink>
    <div class="hd noprint"><input v-model="f.title" class="title" maxlength="200"><div class="row"><button class="btn secondary" :disabled="!!busy" @click="save">Save</button><button class="btn secondary" @click="doPrint">Download PDF</button><DeleteButton type="memo" :id="id" :name="f.title || 'this memo'" to="/fundraising?t=memo" /></div></div>
    <p v-if="msg" class="error noprint">{{ msg }}</p><p v-if="ok" class="ok noprint">{{ ok }}</p>
    <div class="grid">
      <div class="card notes noprint"><h3>Your notes</h3><p class="mut">A sentence or two each. Your financials are added automatically.</p>
        <label v-for="[k, l] in FIELDS" :key="k" class="label">{{ l }}<textarea v-model="f.notes[k]" rows="2" maxlength="3000" /></label>
        <button class="btn" :disabled="!!busy" @click="generate">{{ busy === 'ai' ? 'Writing…' : f.body ? 'Rewrite with AI' : 'Write the memo with AI' }}</button></div>
      <div class="card doc"><div class="vt noprint"><button :class="{ on: view === 'preview' }" @click="view = 'preview'">Preview</button><button :class="{ on: view === 'edit' }" @click="view = 'edit'">Edit</button></div>
        <ClientOnly v-if="view === 'edit'"><RichEditor v-model="f.body" :min-height="560" :max-length="40000" placeholder="Write your memo…" /></ClientOnly>
        <article v-else><h1 class="pt">{{ f.title }}</h1><div v-if="f.body" class="md" v-html="html" /><p v-else class="mut">Add your notes and press "Write the memo with AI", or write it yourself in Edit.</p></article></div>
    </div>
  </section>
</template>
<style scoped>
.back { display: inline-block; margin-bottom: 10px; color: var(--c-muted); } .hd { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; } .row { display: flex; gap: 8px; }
.title { flex: 1; min-width: 280px; font-family: var(--font-heading); font-size: 30px; border: 0; border-bottom: 1px dashed var(--c-rule-strong); padding: 4px 0; background: transparent; color: var(--c-navy); }
.grid { display: grid; grid-template-columns: 360px 1fr; gap: 14px; margin-top: 14px; align-items: start; } .notes { display: flex; flex-direction: column; gap: 10px; } .notes h3 { margin: 0; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); width: 100%; box-sizing: border-box; } .body { font-family: ui-monospace, Menlo, monospace; font-size: 13.5px; }
.vt { display: flex; gap: 16px; margin-bottom: 10px; } .vt button { background: none; border: 0; padding: 4px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .vt .on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.pt { font-size: 30px; margin: 0 0 14px; } .md { font-size: 15px; line-height: 1.7; } .md :deep(h3) { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); margin: 20px 0 6px; } .md :deep(p) { margin: 0 0 10px; } .md :deep(ul) { padding-left: 20px; margin: 0 0 10px; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } } @media print { .noprint { display: none !important; } .grid { display: block; } .doc { border: 0; padding: 0; } }
</style>
