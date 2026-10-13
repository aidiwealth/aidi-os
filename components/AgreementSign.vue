<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
// Read an agreement and sign it: type your name (shown in a signature style), draw it, or upload an image of it.
// v-model: { name, kind, png, agree } — png is always a PNG data URL, whichever way it was made.
export interface SignValue { name: string; kind: 'typed' | 'drawn' | 'uploaded'; png: string; agree: boolean }
const props = withDefaults(defineProps<{ title: string; md: string; compact?: boolean; agreeText?: string; docs?: { title: string; md: string }[] }>(), { compact: false, agreeText: '', docs: () => [] })
const model = defineModel<SignValue>({ required: true })
const tab = ref<'typed' | 'drawn' | 'uploaded'>(model.value.kind || 'typed')
const drawn = ref(''); const uploaded = ref(''); const upErr = ref(''); const open = ref(!props.compact)
const all = computed(() => (props.docs.length ? props.docs : [{ title: props.title, md: props.md }]))
// The signer's name shows as they type it (a blank line until then), never as a {{placeholder}}.
const shown = (md: string) => md.replace(/\{\{\s*signer_name\s*\}\}/g, model.value.name.trim() || '____________').replace(/\{\{\s*[a-z_]+\s*\}\}/g, '')
const pick = ref(0)
// Typed: the name rendered in a handwriting-style font onto a transparent PNG.
function typedPng(name: string): string {
  if (!name.trim() || typeof document === 'undefined') return ''
  const c = document.createElement('canvas'); c.width = 600; c.height = 160
  const x = c.getContext('2d')!; let size = 64
  x.fillStyle = '#0c1a2e'; x.textBaseline = 'middle'
  const font = (s: number) => 'italic ' + s + 'px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive'
  x.font = font(size); while (x.measureText(name).width > 560 && size > 24) { size -= 4; x.font = font(size) }
  x.fillText(name, 20, 84)
  return c.toDataURL('image/png')
}
// Uploaded: any image, redrawn onto a PNG (keeps the file small and the format consistent).
function onUpload(ev: Event) {
  upErr.value = ''; const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return
  if (!f.type.startsWith('image/')) { upErr.value = 'Choose an image (PNG or JPG) of your signature.'; return }
  if (f.size > 5 * 1024 * 1024) { upErr.value = 'That image is over 5 MB.'; return }
  const img = new Image(); const url = URL.createObjectURL(f)
  img.onload = () => { const r = Math.min(600 / img.width, 200 / img.height, 1); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r)); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); uploaded.value = c.toDataURL('image/png'); URL.revokeObjectURL(url) }
  img.onerror = () => { upErr.value = 'That image could not be read.'; URL.revokeObjectURL(url) }
  img.src = url
}
watch([tab, () => model.value.name, drawn, uploaded], () => {
  const png = tab.value === 'typed' ? typedPng(model.value.name) : tab.value === 'drawn' ? drawn.value : uploaded.value
  model.value = { ...model.value, kind: tab.value, png }
}, { immediate: true })
const ready = computed(() => model.value.name.trim().length > 1 && !!model.value.png && model.value.agree)
defineExpose({ ready })
</script>
<template>
  <div class="ags" :class="{ compact }">
    <div class="doc">
      <div class="dh"><nav v-if="all.length > 1" class="dt"><button v-for="(d, i) in all" :key="d.title" type="button" :class="{ on: pick === i }" @click="pick = i; open = true">{{ d.title }}</button></nav><b v-else>{{ all[0]?.title }}</b>
        <button v-if="compact" type="button" class="lk" @click="open = !open">{{ open ? 'Hide' : 'Read the full text' }}</button></div>
      <div v-if="open" class="body mdb" v-html="mdRender(shown(all[pick]?.md ?? ''))" />
    </div>
    <div class="sg">
      <label class="label">Your full name<input v-model="model.name" maxlength="200" autocomplete="name" placeholder="As it should appear on the agreement"></label>
      <div class="tabs"><button v-for="[k, l] in ([['typed', 'Type'], ['drawn', 'Draw'], ['uploaded', 'Upload']] as const)" :key="k" type="button" :class="{ on: tab === k }" @click="tab = k">{{ l }}</button></div>
      <div v-if="tab === 'typed'" class="pv"><img v-if="model.png" :src="model.png" alt="Your typed signature"><span v-else>Type your name above</span></div>
      <ClientOnly v-else-if="tab === 'drawn'"><SignPad v-model="drawn" /></ClientOnly>
      <div v-else class="up"><label class="btn secondary sm">Choose an image<input type="file" accept="image/*" hidden @change="onUpload"></label><img v-if="uploaded" :src="uploaded" alt="Your uploaded signature"><span v-else class="hint">A photo or scan of your signature on white paper works best.</span><p v-if="upErr" class="error">{{ upErr }}</p></div>
      <label class="agree"><input v-model="model.agree" type="checkbox"> <span>{{ agreeText || 'I have read and agree to the ' + (all.length > 1 ? all.map((d) => d.title).join(' and ') : all[0]?.title) + ', and I sign electronically. My electronic signature is as binding as a handwritten one.' }}</span></label>
    </div>
  </div>
</template>
<style scoped>
.ags { display: flex; flex-direction: column; gap: 14px; }
.doc { border: 1px solid var(--c-rule); background: #fff; } .dh { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: var(--c-paper-2); font-size: 14px; }
.dt { display: flex; gap: 4px; flex-wrap: wrap; } .dt button { background: none; border: 1px solid transparent; padding: 5px 10px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-muted); } .dt button.on { background: #fff; border-color: var(--c-rule); color: var(--c-ink); font-weight: 600; }
.body { max-height: 320px; overflow-y: auto; padding: 14px 18px; font-size: 13.5px; line-height: 1.6; color: var(--c-ink-soft); } .compact .body { max-height: 240px; }
.body :deep(h2), .body :deep(h3) { font-size: 15px; margin: 14px 0 6px; color: var(--c-ink); } .body :deep(h4) { font-size: 14px; margin: 12px 0 4px; color: var(--c-ink); } .body :deep(p) { margin: 0 0 8px; } .body :deep(ul) { padding-left: 18px; margin: 0 0 8px; }
.sg { display: flex; flex-direction: column; gap: 10px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .label input { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; }
.tabs { display: flex; gap: 0; border: 1px solid var(--c-rule-strong); width: fit-content; } .tabs button { background: #fff; border: 0; padding: 7px 16px; font: inherit; font-size: 13px; cursor: pointer; } .tabs button + button { border-left: 1px solid var(--c-rule-strong); } .tabs button.on { background: var(--c-navy); color: #fff; }
.pv { border: 1px solid var(--c-rule-strong); background: #fff; height: 120px; display: grid; place-items: center; color: var(--c-muted); font-size: 13px; } .pv img { max-height: 100px; max-width: 100%; }
.up { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; } .up img { max-height: 100px; max-width: 100%; border: 1px solid var(--c-rule); background: #fff; padding: 6px; } .hint { font-size: 12.5px; color: var(--c-muted); } .error { color: var(--c-danger); margin: 0; font-size: 13px; }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; display: inline-flex; align-items: center; cursor: pointer; }
.agree { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.45; color: var(--c-ink-soft); } .agree input { margin-top: 2px; width: auto; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
</style>
