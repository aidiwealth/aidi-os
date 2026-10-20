// In-app dialogs instead of the browser's own confirm(), alert() and prompt(): the same questions, in a Finvry / Aidi
// popup (AppDialog, mounted once in app.vue). Each returns a promise, so callers await the answer.
import { reactive } from 'vue'
export interface DialogReq { kind: 'confirm' | 'alert' | 'prompt'; message: string; title?: string; ok?: string; cancel?: string; danger?: boolean; value?: string; placeholder?: string; required?: boolean; resolve: (v: unknown) => void }
export const dialogQueue = reactive<{ list: DialogReq[] }>({ list: [] })
// "Delete …?" → a red Delete button; "Remove …", "Revoke …" and the like likewise. Anything else asks to Confirm.
const VERB = /^(delete|remove|disconnect|revoke|void|cancel|reject|withdraw|archive|detach|disable|unlink|switch off|stop|reset|replace|decline|waive|take|undo|unlock|lock|mark|publish|send|charge|pay|place|make|add|show|sign in|reveal|confirm|end)\b/i
const DANGER = /^(delete|remove|disconnect|revoke|void|cancel|reject|withdraw|archive|detach|disable|unlink|switch off|stop|replace|decline|waive|take)\b/i
const RENAME: Record<string, string> = { take: 'Remove', make: 'Continue', place: 'Place order', mark: 'Confirm' }
function ask(r: Omit<DialogReq, 'resolve'>): Promise<unknown> {
  if (import.meta.server) return Promise.resolve(r.kind === 'confirm' ? false : r.kind === 'prompt' ? null : undefined)
  return new Promise((resolve) => { dialogQueue.list.push({ ...r, resolve }) })
}
export function askConfirm(message: string, o: { title?: string; ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  const m = message.trim(), v = VERB.exec(m)?.[1]
  return ask({ kind: 'confirm', message: m, ok: o.ok ?? (v ? (RENAME[v.toLowerCase()] ?? v[0]!.toUpperCase() + v.slice(1).toLowerCase()) : 'Confirm'), cancel: o.cancel ?? 'Cancel', danger: o.danger ?? DANGER.test(m), title: o.title }) as Promise<boolean>
}
export function notify(message: string, o: { title?: string } = {}): Promise<void> { return ask({ kind: 'alert', message, ok: 'OK', title: o.title }) as Promise<void> }
export function askPrompt(message: string, value = '', o: { title?: string; ok?: string; placeholder?: string; required?: boolean } = {}): Promise<string | null> {
  return ask({ kind: 'prompt', message, value, ok: o.ok ?? 'OK', cancel: 'Cancel', placeholder: o.placeholder, required: o.required, title: o.title }) as Promise<string | null>
}
