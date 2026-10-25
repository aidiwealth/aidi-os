// Sales and Marketing AI (/api/growth/ai): the request starts a background job and this follows it until the draft is
// ready, so a long plan never hits the web request time limit. Failures carry the server's message in the usual shape.
export async function growthAi<T>(f: typeof $fetch, body: Record<string, unknown>): Promise<T> {
  const { job } = await f<{ job: string }>('/api/growth/ai', { method: 'POST', body })
  const started = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000))
    const r = await $fetch<{ status: string; result?: T; error?: { message: string; advice?: string[] } }>('/api/ai-jobs/' + job).catch(() => null)
    if (r?.status === 'done') return r.result as T
    if (r?.status === 'failed' || (!r && Date.now() - started > 10 * 60_000)) {
      const message = r?.error ? r.error.message + (r.error.advice?.length ? ' ' + r.error.advice.join(' ') : '') : 'We lost contact with the server. Try again.'
      throw Object.assign(new Error(message), { data: { data: { error: { message } } } })
    }
  }
}
