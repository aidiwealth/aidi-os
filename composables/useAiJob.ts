// Follow a background AI job until it finishes: progress text while it runs, then the result or the failure.
export function useAiJob<T>() {
  const busy = ref(false), stage = ref(''), progress = ref<Record<string, unknown>>({}), fail = ref<{ message: string; advice: string[] } | null>(null)
  async function follow(id: string): Promise<T | null> {
    busy.value = true; fail.value = null; const started = Date.now()
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000))
        const r = await $fetch<{ status: string; stage: string; progress: Record<string, unknown>; result?: T; error?: { message: string; advice: string[] } }>('/api/ai-jobs/' + id).catch(() => null)
        if (!r) { if (Date.now() - started > 15 * 60_000) { fail.value = { message: 'We lost contact with the server.', advice: ['Try again.'] }; return null } continue }
        stage.value = r.stage; progress.value = r.progress ?? {}
        if (r.status === 'done') return r.result ?? null
        if (r.status === 'failed') { fail.value = r.error ?? { message: 'It failed.', advice: ['Try again.'] }; return null }
      }
    } finally { busy.value = false }
  }
  return { busy, stage, progress, fail, follow }
}
