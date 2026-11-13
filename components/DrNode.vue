<script setup lang="ts">
// One folder in the data room editor (a category, a sub-folder at any depth, or a link to a folder elsewhere), with
// its sub-folders and files. Drag folders and files by ⋮⋮: drop onto a folder to put it inside, onto a file to place
// it before that file. The page provides the actions (see pages/fundraising/index.vue).
export interface DrFolder { id: string; room_id: string; parent_id: string | null; name: string; position: number; link_url: string | null }
export interface DrFile { id: string; title: string; folder_id: string | null; sort: number; written?: boolean; size_bytes: number; mime_type: string; is_deck: boolean }
export interface DrCtx { kids: (id: string) => DrFolder[]; files: (id: string) => DrFile[]; count: (id: string) => number; isOpen: (id: string) => boolean; toggle: (id: string) => void
  over: Ref<string>; drag: (e: DragEvent, k: 'file' | 'folder', id: string) => void; drop: (e: DragEvent, target: { folder?: DrFolder; file?: DrFile }) => void
  step: (f: DrFolder, d: -1 | 1) => void; addSub: (f: DrFolder) => void; edit: (f: DrFolder) => void; moveFile: (f: DrFile) => void; writeFile: (f: DrFile) => void; deleted: () => void }
const props = defineProps<{ f: DrFolder; depth: number }>()
const c = inject<DrCtx>('dr')!
const kids = computed(() => c.kids(props.f.id)), files = computed(() => c.files(props.f.id))
const open = computed(() => c.isOpen(props.f.id))
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
</script>
<template>
  <div class="drn" :class="['d' + Math.min(depth, 3), { droot: depth === 0 }]">
    <div class="drh" :class="{ over: c.over.value === 'fo:' + f.id }" draggable="true" @dragstart.stop="c.drag($event, 'folder', f.id)" @dragover.prevent.stop="!f.link_url && (c.over.value = 'fo:' + f.id)" @dragleave="c.over.value === 'fo:' + f.id && (c.over.value = '')" @drop.prevent.stop="c.drop($event, { folder: f })">
      <span class="grip" title="Drag to move">⋮⋮</span>
      <button v-if="!f.link_url" type="button" class="tg" :aria-label="open ? 'Close ' + f.name : 'Open ' + f.name" @click="c.toggle(f.id)">{{ open ? '▾' : '▸' }}</button><span v-else class="tg ln">↗</span>
      <span class="nm"><b>{{ f.name }}</b><em v-if="!f.link_url">{{ c.count(f.id) }}</em><a v-else :href="f.link_url" target="_blank" rel="noopener" class="lu">{{ host(f.link_url) }} ↗</a></span>
      <span class="ac"><button type="button" class="ar" :aria-label="'Move ' + f.name + ' up'" @click="c.step(f, -1)">↑</button><button type="button" class="ar" :aria-label="'Move ' + f.name + ' down'" @click="c.step(f, 1)">↓</button>
        <button v-if="!f.link_url" type="button" class="btn secondary sm" @click="c.addSub(f)">+ Sub-folder</button><button type="button" class="btn secondary sm" @click="c.edit(f)">{{ f.link_url ? 'Edit link' : depth ? 'Edit' : 'Edit category' }}</button></span>
    </div>
    <div v-if="open && !f.link_url" class="drc">
      <DrNode v-for="k in kids" :key="k.id" :f="k" :depth="depth + 1" />
      <div v-for="x in files" :key="x.id" class="fi" :class="{ over: c.over.value === 'fi:' + x.id }" draggable="true" @dragstart.stop="c.drag($event, 'file', x.id)" @dragover.prevent.stop="c.over.value = 'fi:' + x.id" @dragleave="c.over.value === 'fi:' + x.id && (c.over.value = '')" @drop.prevent.stop="c.drop($event, { file: x })">
        <span class="grip" title="Drag to move">⋮⋮</span><FileBadge :name="x.title" :mime="x.mime_type" /><span class="ft">{{ x.title }}<em>{{ x.written ? 'Written in Finvry · ' : '' }}{{ (x.size_bytes / 1e6).toFixed(1) }} MB</em></span>
        <button v-if="x.written" class="link" @click="c.writeFile(x)">Edit</button><button class="link" @click="c.moveFile(x)">Move</button><DeleteButton type="dr_file" :id="x.id" :name="x.title" link @deleted="c.deleted()" /></div>
      <p v-if="!kids.length && !files.length" class="empty">Empty. Drag files here, or add a sub-folder.</p>
    </div>
  </div>
</template>
<style scoped>
.drn.droot { border: 1px solid var(--c-rule); background: #fff; padding: 10px 14px; margin-bottom: 10px; }
.drh { display: flex; align-items: center; gap: 8px; padding: 4px 0; min-height: 34px; } .drh.over { outline: 1.5px dashed var(--c-blue-deep); background: #f5f8fb; }
.d1 > .drh, .d2 > .drh, .d3 > .drh { background: var(--c-paper-2); padding: 4px 8px; margin-top: 6px; }
.grip { color: #a8b4c2; cursor: grab; font-size: 12px; letter-spacing: -2px; user-select: none; } .tg { border: 0; background: none; font: inherit; width: 18px; padding: 0; cursor: pointer; color: var(--c-muted); } .tg.ln { color: var(--c-blue-deep); }
.nm { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; } .droot > .drh .nm b { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--c-muted); } .nm b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nm em { font-style: normal; font-size: 12px; color: var(--c-muted); } .lu { font-size: 12.5px; }
.ac { display: flex; gap: 6px; align-items: center; } .ar { border: 1px solid var(--c-rule); background: #fff; width: 26px; height: 26px; cursor: pointer; font-size: 12px; color: var(--c-muted); } .ac .btn.sm { padding: 4px 9px; font-size: 12.5px; }
.drc { margin-left: 24px; } .fi { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .fi:last-child { border-bottom: 0; } .fi.over { box-shadow: inset 0 2px 0 var(--c-blue-deep); }
.link { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.ft { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ft em { font-style: normal; font-size: 12px; color: var(--c-muted); } .empty { margin: 6px 0; font-size: 12.5px; color: var(--c-muted); }
@media (max-width: 700px) { .ac .ar { display: none; } .drc { margin-left: 12px; } }
</style>
