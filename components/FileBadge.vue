<script setup lang="ts">
// A coloured file-type tag (PDF, DOC, XLS, PPT, IMG, CSV, ZIP, TXT…) from a file name or MIME type. Used wherever files are listed.
const props = withDefaults(defineProps<{ name?: string | null; mime?: string | null; size?: 'sm' | 'md' | 'lg' }>(), { name: '', mime: '', size: 'md' })
const t = computed(() => {
  const m = (props.mime ?? '').toLowerCase(), e = ((props.name ?? '').match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase()
  if (m.includes('pdf') || e === 'pdf') return 'PDF'
  if (m.includes('csv') || e === 'csv') return 'CSV'
  if (m.includes('sheet') || m.includes('excel') || ['xls', 'xlsx', 'numbers'].includes(e)) return 'XLS'
  if (m.includes('presentation') || m.includes('powerpoint') || ['ppt', 'pptx', 'key'].includes(e)) return 'PPT'
  if (m.includes('word') || ['doc', 'docx', 'rtf', 'odt', 'pages'].includes(e)) return 'DOC'
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(e)) return 'IMG'
  if (m.includes('zip') || ['zip', 'rar', '7z'].includes(e)) return 'ZIP'
  if (m.startsWith('text/') || ['txt', 'md'].includes(e)) return 'TXT'
  if (m.startsWith('video/') || ['mp4', 'mov'].includes(e)) return 'VID'
  if (m.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(e)) return 'AUD'
  return 'FILE'
})
</script>
<template><span class="fb" :class="size" :data-t="t" :title="t + ' file'">{{ t }}</span></template>
<style scoped>
.fb { flex: none; display: inline-grid !important; place-items: center; text-align: center; font-weight: 700; letter-spacing: .02em; color: #fff; background: #7b8794; line-height: 1; }
.fb.sm { width: 28px; height: 30px; font-size: 8.5px; } .fb.md { width: 36px; height: 40px; font-size: 10px; } .fb.lg { width: 46px; height: 50px; font-size: 12px; }
.fb[data-t="PDF"] { background: #d0473d; } .fb[data-t="DOC"] { background: #2f6fd6; } .fb[data-t="XLS"], .fb[data-t="CSV"] { background: #23854f; } .fb[data-t="PPT"] { background: #d4762c; }
.fb[data-t="IMG"] { background: #8a5cd1; } .fb[data-t="ZIP"] { background: #6b5b3e; } .fb[data-t="TXT"] { background: #5b6b7d; } .fb[data-t="VID"], .fb[data-t="AUD"] { background: #b0336f; }
</style>
