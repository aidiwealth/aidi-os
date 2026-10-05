<script setup lang="ts">
// Sharing & branding: your Finvry address, logo and colours, Finvry branding, watermark and NDA.
interface S { handle: string; suggest: string; published: boolean; base: string; brand: { logo_id: string | null; bg: string | null; fg: string | null; hide_finvry: boolean; watermark: boolean; nda_enabled: boolean; nda_scopes: string[]; nda_text: string | null } | null; default_nda: string; paid: boolean; signatures: { id: string }[] }
const { data, refresh } = await useFetch<S>('/api/sharing')
const f = reactive({ handle: '', logo_id: null as string | null, bg: '#ffffff', fg: '#1d1d1f', hide_finvry: false, watermark: false, nda_enabled: false, nda_scopes: ['room'] as string[], nda_text: '' })
watchEffect(() => { const d = data.value; if (d) { const b = d.brand; Object.assign(f, { handle: d.handle || d.suggest, logo_id: b?.logo_id ?? null, bg: b?.bg ?? '#ffffff', fg: b?.fg ?? '#1d1d1f', hide_finvry: !!b?.hide_finvry, watermark: !!b?.watermark, nda_enabled: !!b?.nda_enabled, nda_scopes: b?.nda_scopes ?? ['room'], nda_text: b?.nda_text || d.default_nda }) } })
const msg = ref(''); const ok = ref(''); const busy = ref(false); const showNda = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function save() { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/sharing', { method: 'POST', body: { ...f, bg: f.bg === '#ffffff' ? '' : f.bg, fg: f.fg === '#1d1d1f' ? '' : f.fg, nda_text: f.nda_text === data.value?.default_nda ? '' : f.nda_text } }); ok.value = 'Saved.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function logo(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); try { f.logo_id = (await $fetch<{ id: string }>('/api/sharing/logo', { method: 'POST', body: fd })).id } catch (e) { msg.value = err(e) } }
</script>
<template>
  <form v-if="data" class="ss" @submit.prevent="save">
    <div class="card sec"><h2>Your Finvry address</h2><p class="mut">One address for your investor page, with short links for each data room link you share. No setup needed.</p>
      <label class="addr"><span>{{ data.base }}</span><input v-model="f.handle" required maxlength="41"></label>
      <p class="mut">Example: <code>{{ data.base }}{{ f.handle }}/bridge-deck</code>{{ data.published ? '' : ' · Publish your investor page to show it at this address.' }}</p></div>
    <div class="card sec"><h2>Branding</h2>
      <div class="lg"><img v-if="f.logo_id" :src="'/api/public/media/' + f.logo_id" alt="Logo"><span v-else class="ph">Logo</span><label class="btn secondary up">{{ f.logo_id ? 'Change logo' : 'Upload logo' }}<input type="file" accept=".png,.jpg,.jpeg,.webp" @change="logo"></label><button v-if="f.logo_id" type="button" class="lk" @click="f.logo_id = null">Remove</button></div>
      <div class="cols"><label class="cl"><input v-model="f.bg" type="color"> Viewer background</label><label class="cl"><input v-model="f.fg" type="color"> Viewer text colour</label></div>
      <div class="prev" :style="{ background: f.bg, color: f.fg }"><img v-if="f.logo_id" :src="'/api/public/media/' + f.logo_id" alt=""><b>Data room</b><span>Preview of your viewer colours</span></div>
      <label class="tg" :class="{ dis: !data.paid }"><input v-model="f.hide_finvry" type="checkbox" :disabled="!data.paid"><span class="sw" /><span><b>Remove Finvry branding</b><em>{{ data.paid ? 'From your investor page, data room and update emails.' : 'Available on Startup and Scale.' }}</em></span></label></div>
    <div class="card sec"><h2>Protection</h2>
      <label class="tg"><input v-model="f.watermark" type="checkbox"><span class="sw" /><span><b>Watermark documents</b><em>Stamps the viewer's email and the date on every page of PDFs in your data room, including downloads. Images show it on screen. Other file types must be shared as PDF while this is on.</em></span></label>
      <label class="tg"><input v-model="f.nda_enabled" type="checkbox"><span class="sw" /><span><b>Require an NDA before viewing</b><em>Visitors read your NDA and sign by typing their name. You see every signature under Fundraising → NDAs ({{ data.signatures.length }} so far).</em></span></label>
      <div v-if="f.nda_enabled" class="scopes"><span class="mut">Ask for it on:</span><label v-for="[k, l] in [['room', 'Data room and deck links'], ['page', 'Investor page'], ['updates', 'Investor updates']]" :key="k" class="cb"><input v-model="f.nda_scopes" type="checkbox" :value="k"> {{ l }}</label>
        <button type="button" class="lk" @click="showNda = !showNda">{{ showNda ? 'Hide NDA text' : 'Edit NDA text' }}</button>
        <textarea v-if="showNda" v-model="f.nda_text" rows="14" maxlength="20000" /><p v-if="showNda" class="mut">A standard mutual NDA is filled in for you. Have your lawyer review it if you change it. Signers are shown the exact text, and it is kept with their signature.</p></div></div>
    <div class="act"><button class="btn" type="submit" :disabled="busy">Save</button><p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p></div>
  </form>
</template>
<style scoped>
.ss { display: flex; flex-direction: column; gap: 12px; } .sec { display: flex; flex-direction: column; gap: 10px; } .sec h2 { margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } code { font-size: 12.5px; background: var(--c-paper-2); padding: 1px 6px; }
.addr { display: flex; align-items: center; border: 1px solid var(--c-rule-strong); } .addr span { padding: 0 10px; font-size: 13.5px; color: var(--c-muted); background: var(--c-paper-2); align-self: stretch; display: flex; align-items: center; } .addr input { border: 0; flex: 1; font: inherit; font-size: 15px; padding: 9px 10px; }
.lg { display: flex; align-items: center; gap: 12px; } .lg img { max-height: 44px; max-width: 160px; } .ph { width: 90px; height: 44px; border: 1px dashed var(--c-rule-strong); display: grid; place-items: center; color: var(--c-muted); font-size: 12px; } .up { position: relative; overflow: hidden; } .up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cols { display: flex; gap: 20px; } .cl { display: flex; gap: 8px; align-items: center; font-size: 14px; } .cl input { width: 42px; height: 30px; border: 1px solid var(--c-rule-strong); padding: 2px; background: #fff; }
.prev { padding: 16px 18px; border: 1px solid var(--c-rule); display: flex; gap: 12px; align-items: center; } .prev img { max-height: 28px; } .prev span { font-size: 13px; opacity: .75; }
.tg { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; padding: 6px 0; } .tg input { position: absolute; opacity: 0; width: 0; } .tg.dis { opacity: .6; cursor: default; }
.sw { width: 40px; height: 22px; border-radius: 11px; background: #cfcdc6; position: relative; flex: none; transition: background .15s; margin-top: 2px; } .sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
.tg input:checked + .sw { background: var(--c-navy); } .tg input:checked + .sw::after { left: 21px; } .tg span:last-child { display: flex; flex-direction: column; gap: 2px; } .tg em { font-style: normal; font-size: 13px; color: var(--c-muted); }
.scopes { display: flex; flex-direction: column; gap: 8px; padding: 10px 0 0 52px; } .cb { display: flex; gap: 8px; align-items: center; font-size: 14px; } .cb input { width: auto; } textarea { font: inherit; font-size: 13.5px; line-height: 1.55; padding: 10px; border: 1px solid var(--c-rule-strong); }
.lk { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; } .act { display: flex; gap: 12px; align-items: center; } .ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
</style>
