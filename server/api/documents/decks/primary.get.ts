// The main deck's tracked link (used by the investor page and investor updates).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const d = (await db().query<{ token: string; title: string }>('SELECT token, title FROM fundraise.decks WHERE active ORDER BY primary_deck DESC, updated_at DESC LIMIT 1')).rows[0]
  return d ? { url: await deckUrl(d.token), title: d.title } : { url: null, title: null }
})
