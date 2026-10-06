// Start a viewing session (email when the deck asks for it).
import { createHash } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  const { deck, version } = await deckByToken(token)
  rateLimit('deck_start', (getRequestIP(event, { xForwardedFor: true }) ?? 'x') + token, 30, 60 * 60 * 1000)
  const b = z.object({ email: z.string().trim().toLowerCase().max(254).default(''), name: z.string().trim().max(120).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a valid email.')
  if (deck.require_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.data.email)) throw apiError('email_required', 'Enter your email to view this deck.')
  const key = createHash('sha256').update((getRequestIP(event, { xForwardedFor: true }) ?? '') + '|' + (getRequestHeader(event, 'user-agent') ?? '')).digest('hex').slice(0, 24)
  const v = await one<{ id: string }>('INSERT INTO fundraise.deck_visits (organization_id, deck_id, version_id, email, name, visitor_key) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [deck.organization_id, deck.id, version.id, b.data.email || null, b.data.name || null, key])
  return { visit: v.id }
})
