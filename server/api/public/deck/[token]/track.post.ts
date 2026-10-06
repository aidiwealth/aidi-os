// Viewer heartbeat: seconds spent on the current slide.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { deck, version } = await deckByToken(String(getRouterParam(event, 'token') ?? ''))
  const b = z.object({ visit: z.string().uuid(), page: z.number().int().min(1).max(500), seconds: z.number().int().min(0).max(120), pages: z.number().int().min(1).max(500).optional() }).safeParse(await readBody(event))
  if (!b.success) return { ok: false }
  const v = await visitFor(deck.id, b.data.visit)
  if (!v) return { ok: false }
  const slides = { ...(v.slides ?? {}) }; slides[String(b.data.page)] = (slides[String(b.data.page)] ?? 0) + b.data.seconds
  await db().query('UPDATE fundraise.deck_visits SET seconds = seconds + $2, slides = $3, pages = coalesce($4, pages), last_at = now() WHERE id = $1', [v.id, b.data.seconds, JSON.stringify(slides), b.data.pages ?? null])
  if (b.data.pages) await db().query('UPDATE fundraise.deck_versions SET pages = $2 WHERE id = $1 AND pages IS NULL', [version.id, b.data.pages])
  return { ok: true }
})
