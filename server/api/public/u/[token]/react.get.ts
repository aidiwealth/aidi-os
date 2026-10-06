export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) return { mine: [] }
  const s = (await asPlatform(() => db().query<{ id: string }>('SELECT id FROM financials.update_sends WHERE token_hash = $1', [sha256(token)]))).rows[0]
  if (!s) return { mine: [] }
  return { mine: (await asPlatform(() => db().query<{ emoji: string }>('SELECT emoji FROM financials.update_reactions WHERE send_id = $1', [s.id]))).rows.map((r) => r.emoji) }
})
