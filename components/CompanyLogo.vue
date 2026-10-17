<script setup lang="ts">
// The company logo. In Settings it can be dropped in, replaced or removed (saved straight away); elsewhere it is shown
// with a link to change it in Settings, so there is one logo for every feature.
const props = withDefaults(defineProps<{ edit?: boolean; company?: string; note?: string }>(), { edit: false, company: '', note: '' })
const { data, refresh } = await useFetch<{ id: string | null; url: string | null; pdf_ok: boolean }>('/api/company/logo', { key: 'company-logo', default: () => ({ id: null, url: null, pdf_ok: false }) })
const busy = ref(false); const msg = ref('')
async function up(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return
  busy.value = true; msg.value = ''
  try { const fd = new FormData(); fd.append('file', file); await $fetch('/api/company/logo', { method: 'POST', body: fd }); await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { busy.value = false }
}
async function remove() { busy.value = true; try { await $fetch('/api/company/logo', { method: 'DELETE' }); await refresh() } finally { busy.value = false } }
</script>

<template>
  <div class="cl" :class="{ ro: !props.edit }">
    <span class="pv"><img v-if="data?.url" :src="data.url" alt="Company logo"><em v-else>{{ (company || 'Logo').slice(0, company ? 1 : 4) }}</em></span>
    <div class="bd">
      <template v-if="props.edit">
        <DropZone compact accept=".png,.jpg,.jpeg,.webp" :disabled="busy" :label="busy ? 'Uploading…' : data?.url ? 'Drop a new logo to replace it' : 'Drag and drop your logo here'" hint="PNG or JPG works everywhere, including PDFs · up to 3 MB · or click" @change="up" />
        <span class="rw"><span class="mut">Used on your investor page, data room, shared links, updates and financial statements.</span><button v-if="data?.url" type="button" class="lk" :disabled="busy" @click="remove">Remove</button></span>
        <span v-if="data?.url && !data.pdf_ok" class="warn">WebP logos do not show on PDF and Excel files. Use PNG or JPG for those.</span>
        <span v-if="msg" class="err">{{ msg }}</span>
      </template>
      <template v-else>
        <b>{{ data?.url ? 'Your company logo' : 'No logo yet' }}</b>
        <span class="mut">{{ note || 'Set once in Settings and used everywhere.' }} <NuxtLink to="/settings?s=company">{{ data?.url ? 'Change in Settings' : 'Add it in Settings' }} →</NuxtLink></span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cl { display: flex; gap: 14px; align-items: center; }
.pv { width: 64px; height: 64px; flex: 0 0 64px; border: 1px solid var(--c-rule); background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pv img { max-width: 100%; max-height: 100%; object-fit: contain; } .pv em { font-style: normal; font-family: var(--font-heading); font-size: 20px; color: var(--c-muted); }
.ro .pv { width: 48px; height: 48px; flex-basis: 48px; }
.bd { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; } .bd b { font-weight: 500; font-size: 14px; }
.rw { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
.mut { color: var(--c-muted); font-size: 12.5px; } .mut a { color: var(--c-blue-deep); text-decoration: none; white-space: nowrap; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-danger); cursor: pointer; }
.warn { font-size: 12.5px; color: var(--c-warn); } .err { font-size: 12.5px; color: var(--c-danger); }
</style>
