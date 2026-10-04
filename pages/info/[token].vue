<script setup lang="ts">
// The client's tax filing information form. Saves as they go; files upload per question; submit when complete.
definePageMeta({ layout: 'public' })
interface Q { id: string; label: string; type: string; section: string; help?: string; required?: boolean; options?: string[]; detail?: string; detailWhen?: string }
const token = useRoute().params.token as string
const { data, error, refresh } = await useFetch<{ request: { tax_year: number; status: string; client: string; company: string | null; answers: Record<string, any> }; files: { field: string; id: string; title: string }[]; questions: Q[] }>('/api/public/info/' + token, { key: 'pub-info-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.request.tax_year + ' tax information · ' + (data.value.request.company ?? data.value.request.client) : 'Tax information'), meta: [{ name: 'robots', content: 'noindex' }] })
const a = reactive<Record<string, any>>({})
watchEffect(() => { if (data.value) { Object.assign(a, JSON.parse(JSON.stringify(data.value.request.answers ?? {}))); for (const q of data.value.questions) { if (q.type === 'shareholders' && !Array.isArray(a[q.id])) a[q.id] = [{ name: '', address: '', contact: '', country: '', ownership: '', tax_id: '' }]; if (q.type === 'accounts' && !Array.isArray(a[q.id])) a[q.id] = [{ bank: '', last4: '', highest: '' }] } } })
const sections = computed(() => { const m = new Map<string, Q[]>(); for (const q of data.value?.questions ?? []) { m.set(q.section, [...(m.get(q.section) ?? []), q]) } return [...m.entries()] })
const done = computed(() => data.value?.request.status === 'submitted')
const filesFor = (f: string) => (data.value?.files ?? []).filter((x) => x.field === f)
const answered = (q: Q) => q.type === 'file' ? filesFor(q.id).length > 0 : Array.isArray(a[q.id]) ? a[q.id].some((r: Record<string, string>) => Object.values(r).some((v) => String(v ?? '').trim())) : String(a[q.id] ?? '').trim() !== ''
const progress = computed(() => { const req = (data.value?.questions ?? []).filter((q) => q.required); return { n: req.filter(answered).length, of: req.length } })
const msg = ref(''); const ok = ref(''); const busy = ref(false); const dirty = ref(false)
watch(a, () => { dirty.value = true }, { deep: true })
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' }
async function save(submit = false) {
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/public/info/' + token + '/save', { method: 'POST', body: { answers: a, submit } }); dirty.value = false; ok.value = submit ? '' : 'Saved. You can come back to this link any time.'; if (submit) await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { if (dirty.value && !busy.value && !done.value) save() }, 45000) })
onBeforeUnmount(() => clearInterval(timer))
const uploading = ref('')
async function upload(field: string, ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const f of files) {
    uploading.value = field; msg.value = ''
    const fd = new FormData(); fd.append('field', field); fd.append('file', f)
    try { await $fetch('/api/public/info/' + token + '/upload', { method: 'POST', body: fd }) } catch (e) { msg.value = f.name + ': ' + err(e) }
  }
  uploading.value = ''; input.value = ''; await refresh()
}
async function removeFile(id: string) { try { await $fetch('/api/public/info/' + token + '/remove', { method: 'POST', body: { document_id: id } }); await refresh() } catch (e) { msg.value = err(e) } }
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1><p class="muted">Reply to our email and we will send you a new link.</p></div>
    <template v-else-if="data">
      <p class="label">{{ data.request.company ?? data.request.client }}</p>
      <h1>{{ data.request.tax_year }} tax filing information</h1>
      <div v-if="done" class="card thanks"><h2>Thank you. Your information has been submitted.</h2><p class="muted">We will review it and come back to you if we need anything else. To change something, reply to our email.</p></div>
      <template v-else>
        <p class="intro">Please answer the questions below and upload the documents asked for. Your answers save as you go and you can come back to this link. Questions marked * are needed before you submit.</p>
        <div class="prog"><div class="bar"><i :style="{ width: (progress.of ? (progress.n / progress.of) * 100 : 0) + '%' }" /></div><span>{{ progress.n }} of {{ progress.of }} required answers</span></div>
        <div v-for="[sec, qs] in sections" :key="sec" class="card sec">
          <h2>{{ sec }}</h2>
          <div v-for="q in qs" :key="q.id" class="q">
            <label class="ql" :for="'q-' + q.id">{{ q.label }}<span v-if="q.required" class="req">*</span></label>
            <p v-if="q.help" class="help">{{ q.help }}</p>
            <input v-if="q.type === 'text' || q.type === 'money'" :id="'q-' + q.id" v-model="a[q.id]" :inputmode="q.type === 'money' ? 'decimal' : undefined" :placeholder="q.type === 'money' ? 'USD' : ''" maxlength="500">
            <textarea v-else-if="q.type === 'textarea'" :id="'q-' + q.id" v-model="a[q.id]" rows="3" maxlength="5000" />
            <select v-else-if="q.type === 'select'" :id="'q-' + q.id" v-model="a[q.id]"><option value="" disabled>Choose</option><option v-for="o in q.options" :key="o">{{ o }}</option></select>
            <div v-else-if="q.type === 'yesno'" class="yn"><label><input v-model="a[q.id]" type="radio" value="yes"> Yes</label><label><input v-model="a[q.id]" type="radio" value="no"> No</label></div>
            <div v-else-if="q.type === 'file'" class="files">
              <div v-for="f in filesFor(q.id)" :key="f.id" class="file"><span>{{ f.title.split(' — ').pop() }}</span><button type="button" class="link" @click="removeFile(f.id)">Remove</button></div>
              <label class="btn secondary up">{{ uploading === q.id ? 'Uploading…' : filesFor(q.id).length ? 'Add another file' : 'Upload file' }}<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,.docx" :disabled="!!uploading" @change="upload(q.id, $event)"></label>
            </div>
            <div v-else-if="q.type === 'shareholders'" class="rep">
              <div v-for="(r, i) in a[q.id]" :key="i" class="row6">
                <input v-model="r.name" placeholder="Full name" maxlength="200"><input v-model="r.ownership" placeholder="Ownership %" inputmode="decimal"><input v-model="r.contact" placeholder="Email or phone" maxlength="200">
                <input v-model="r.country" placeholder="Citizenship / tax residence" maxlength="100"><input v-model="r.tax_id" placeholder="Foreign tax ID (if not US)" maxlength="60"><input v-model="r.address" class="wide" placeholder="Official address" maxlength="500">
                <button v-if="a[q.id].length > 1" type="button" class="link x" @click="a[q.id].splice(i, 1)">Remove</button>
              </div>
              <button type="button" class="btn secondary" @click="a[q.id].push({ name: '', address: '', contact: '', country: '', ownership: '', tax_id: '' })">Add shareholder</button>
            </div>
            <div v-else-if="q.type === 'accounts'" class="rep">
              <div v-for="(r, i) in a[q.id]" :key="i" class="row3"><input v-model="r.bank" placeholder="Bank" maxlength="120"><input v-model="r.last4" placeholder="Last 4 digits" maxlength="4" inputmode="numeric"><input v-model="r.highest" placeholder="Highest balance (USD)" inputmode="decimal"><button v-if="a[q.id].length > 1" type="button" class="link x" @click="a[q.id].splice(i, 1)">Remove</button></div>
              <button type="button" class="btn secondary" @click="a[q.id].push({ bank: '', last4: '', highest: '' })">Add account</button>
            </div>
            <template v-if="q.detail && a[q.id] === q.detailWhen"><label class="ql sm" :for="'d-' + q.id">{{ q.detail }}</label><textarea :id="'d-' + q.id" v-model="a[q.id + '_detail']" rows="2" maxlength="3000" /></template>
          </div>
        </div>
        <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <div class="acts"><button class="btn secondary" type="button" :disabled="busy" @click="save(false)">Save and continue later</button><button class="btn" type="button" :disabled="busy || progress.n < progress.of" @click="save(true)">Submit</button></div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 820px; margin: 0 auto; } .intro { color: var(--c-ink-soft); max-width: 660px; } .muted { color: var(--c-muted); }
.prog { display: flex; align-items: center; gap: 12px; margin: 14px 0 18px; font-size: 13px; color: var(--c-muted); position: sticky; top: 0; background: var(--c-paper); padding: 8px 0; z-index: 2; } .bar { flex: 1; height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); }
.sec { margin-bottom: 14px; } .sec h2 { margin: 0 0 6px; } .q { padding: 14px 0; border-bottom: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 6px; } .q:last-child { border-bottom: 0; }
.ql { font-weight: 500; font-size: 14px; color: var(--c-ink); } .ql.sm { font-size: 13px; font-weight: 400; margin-top: 4px; } .req { color: var(--c-danger); margin-left: 3px; } .help { font-size: 12.5px; color: var(--c-muted); margin: 0; }
input, textarea, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); width: 100%; box-sizing: border-box; }
.yn { display: flex; gap: 18px; } .yn label { display: flex; gap: 6px; align-items: center; font-size: 14px; } .yn input { width: auto; }
.files { display: flex; flex-direction: column; gap: 6px; } .file { display: flex; justify-content: space-between; background: var(--c-paper-2); padding: 7px 10px; font-size: 13px; }
.up { align-self: flex-start; position: relative; overflow: hidden; } .up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.rep { display: flex; flex-direction: column; gap: 10px; } .row6 { display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 6px; padding: 10px; background: var(--c-paper-2); position: relative; } .row6 .wide { grid-column: 1 / -1; }
.row3 { display: grid; grid-template-columns: 2fr 1fr 1.5fr auto; gap: 6px; align-items: center; } .x { justify-self: start; font-size: 12.5px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.acts { display: flex; gap: 10px; justify-content: flex-end; margin: 16px 0 30px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
.thanks h2 { margin: 0 0 6px; }
@media (max-width: 640px) { .row6, .row3 { grid-template-columns: 1fr; } }
</style>
