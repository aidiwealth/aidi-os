<script setup lang="ts">
// Create a company document with AI: choose, answer a few questions, review and edit, save as PDF.
useHead({ title: 'Create a document' })
interface T { key: string; name: string; blurb: string; group: string; fields: { key: string; label: string; type?: string; options?: string[]; placeholder?: string; required?: boolean }[] }
const { data: types } = await useFetch<T[]>('/api/docgen/types')
const step = ref(1); const type = ref(''); const answers = reactive<Record<string, string>>({})
const t = computed(() => types.value?.find((x) => x.key === type.value))
const groups = computed(() => { const m = new Map<string, T[]>(); for (const x of types.value ?? []) m.set(x.group, [...(m.get(x.group) ?? []), x]); return [...m.entries()] })
const doc = reactive({ title: '', body: '' }); const view = ref<'preview' | 'edit'>('edit')
const msg = ref(''); const ok = ref(''); const busy = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
function choose(k: string) { type.value = k; for (const key of Object.keys(answers)) delete answers[key]; step.value = 2 }
async function draft() { busy.value = 'ai'; msg.value = ''; try { const r = await $fetch<{ title: string; body: string }>('/api/docgen/draft', { method: 'POST', body: { type: type.value, answers } }); Object.assign(doc, r); step.value = 3; view.value = 'edit' } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function save() { busy.value = 'save'; msg.value = ''; try { await $fetch('/api/docgen/save', { method: 'POST', body: { ...doc } }); ok.value = 'Saved to Documents as a PDF.' } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
async function download() { busy.value = 'dl'; try { const blob = await $fetch<Blob>('/api/docgen/save', { method: 'POST', body: { ...doc, download: true }, responseType: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (doc.title || 'Document') + '.pdf'; a.click() } catch (e) { msg.value = err(e) } finally { busy.value = '' } }
const html = computed(() => renderMarkdown(doc.body))
const blanks = computed(() => (doc.body.match(/\[[A-Z][A-Z0-9 _/-]{1,40}\]/g) ?? []).filter((v, i, a) => a.indexOf(v) === i))
</script>
<template>
  <section v-if="types">
    <NuxtLink to="/documents" class="back">← Documents</NuxtLink>
    <h1>Create a document</h1><p class="lead">Answer a few questions and we draft it with your company details. Review it carefully; this is a starting point, not legal advice.</p>
    <ol class="steps"><li v-for="(s, i) in ['Choose', 'Details', 'Review & save']" :key="s" :class="{ on: step === i + 1, ok: step > i + 1 }"><span>{{ step > i + 1 ? '✓' : i + 1 }}</span>{{ s }}</li></ol>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }} <NuxtLink to="/documents">Open Documents →</NuxtLink></p>
    <template v-if="step === 1"><div v-for="[g, list] in groups" :key="g" class="grp"><h2>{{ g }}</h2><div class="cards"><button v-for="x in list" :key="x.key" type="button" class="tc" @click="choose(x.key)"><b>{{ x.name }}</b><span>{{ x.blurb }}</span><em>Start →</em></button></div></div></template>
    <form v-else-if="step === 2 && t" class="card frm" @submit.prevent="draft"><h2>{{ t.name }}</h2>
      <label v-for="f in t.fields" :key="f.key" class="label">{{ f.label }}{{ f.required ? '' : '' }}
        <textarea v-if="f.type === 'textarea'" v-model="answers[f.key]" rows="4" :placeholder="f.placeholder" :required="f.required" maxlength="4000" />
        <select v-else-if="f.type === 'select'" v-model="answers[f.key]"><option value="">Choose</option><option v-for="o in f.options" :key="o">{{ o }}</option></select>
        <input v-else v-model="answers[f.key]" :type="f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'" :placeholder="f.placeholder" :required="f.required" maxlength="4000"></label>
      <div class="row"><button type="button" class="btn secondary" @click="step = 1">Back</button><button class="btn" type="submit" :disabled="!!busy">{{ busy === 'ai' ? 'Drafting… (about 20 seconds)' : 'Draft with AI' }}</button></div></form>
    <template v-else>
      <div class="bar"><input v-model="doc.title" class="title" maxlength="200" aria-label="Title"><div class="row"><button class="btn secondary" @click="step = 2">Change answers</button><button class="btn secondary" :disabled="!!busy" @click="download">{{ busy === 'dl' ? 'Preparing…' : 'Download PDF' }}</button><button class="btn" :disabled="!!busy" @click="save">{{ busy === 'save' ? 'Saving…' : 'Save to Documents' }}</button></div></div>
      <p v-if="blanks.length" class="warn">Fill in before signing: {{ blanks.join(', ') }}</p>
      <div class="card doc"><div class="vt"><button :class="{ on: view === 'preview' }" @click="view = 'preview'">Preview</button><button :class="{ on: view === 'edit' }" @click="view = 'edit'">Edit</button></div>
        <ClientOnly v-if="view === 'edit'"><RichEditor v-model="doc.body" :min-height="600" placeholder="Your document…" /></ClientOnly><article v-else class="md" v-html="html" /></div>
    </template>
  </section>
</template>
<style scoped>
.back { display: inline-block; margin-bottom: 10px; color: var(--c-muted); } h1 { margin: 0; } .lead { color: var(--c-ink-soft); max-width: 720px; }
.steps { display: flex; gap: 18px; list-style: none; padding: 0; margin: 14px 0 18px; font-size: 13px; color: var(--c-muted); } .steps li { display: flex; gap: 7px; align-items: center; } .steps span { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); font-size: 12px; } .steps .on { color: var(--c-navy); font-weight: 500; } .steps .on span { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .steps .ok span { color: var(--c-ok); border-color: var(--c-ok); }
.grp h2 { font-size: 19px; margin: 16px 0 10px; } .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; } .tc { text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 16px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 5px; } .tc:hover { border-color: var(--c-navy); }
.tc b { font-family: var(--font-heading); font-weight: 500; font-size: 20px; color: var(--c-navy); } .tc span { font-size: 13px; color: var(--c-ink-soft); } .tc em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); margin-top: 4px; }
.frm { max-width: 720px; display: flex; flex-direction: column; gap: 12px; } .frm h2 { margin: 0; } label.label { display: flex; flex-direction: column; gap: 6px; } input, select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.row { display: flex; gap: 8px; flex-wrap: wrap; } .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; } .title { flex: 1; min-width: 260px; font-family: var(--font-heading); font-size: 26px; border: 0; border-bottom: 1px dashed var(--c-rule-strong); background: transparent; color: var(--c-navy); }
.warn { background: rgba(183,121,31,.1); border-left: 3px solid var(--c-warn); padding: 9px 12px; font-size: 13.5px; } .doc { max-width: 860px; } .vt { display: flex; gap: 16px; margin-bottom: 10px; } .vt button { background: none; border: 0; padding: 4px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .vt .on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.body { width: 100%; box-sizing: border-box; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 1.55; } .md { font-family: Georgia, serif; font-size: 15px; line-height: 1.7; } .md :deep(h2) { font-size: 26px; } .md :deep(h3) { font-size: 18px; margin: 18px 0 6px; } .md :deep(p) { margin: 0 0 10px; }
.error { color: var(--c-danger); } .ok { color: var(--c-ok); }
</style>
