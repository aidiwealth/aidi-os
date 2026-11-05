// Feedback while something is being saved: any change sent to the server (merge, save, delete, upload…) runs the same
// bar along the top as moving between pages, and the pointer shows it is working, so a click never looks ignored.
// Reading data (GET) is left alone: pages show their own loading.
// Calls made in the background, not by a click: no bar.
const QUIET = /^\/api\/(notifications\/seen|public\/|analytics)/
export default defineNuxtPlugin(() => {
  const bar = useLoadingIndicator()
  let n = 0
  const start = () => { if (n++ === 0) { bar.start(); document.documentElement.classList.add('is-busy') } }
  const done = () => { if (--n <= 0) { n = 0; bar.finish(); document.documentElement.classList.remove('is-busy') } }
  const orig = globalThis.$fetch
  const wrapped = ((req: Parameters<typeof orig>[0], opts?: Parameters<typeof orig>[1]) => {
    const m = String(opts?.method ?? 'GET').toUpperCase()
    if (m === 'GET' || m === 'HEAD' || (typeof req === 'string' && QUIET.test(req))) return orig(req, opts)
    start()
    return orig(req, opts).finally(done)
  }) as typeof orig
  Object.assign(wrapped, orig)
  globalThis.$fetch = wrapped
})
