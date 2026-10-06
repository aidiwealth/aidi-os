export default defineEventHandler(async (event) => {
  const { deck } = await deckByToken(String(getRouterParam(event, 'token') ?? ''))
  setHeader(event, 'cache-control', 'no-store')
  return { title: deck.title, require_email: deck.require_email, allow_download: deck.allow_download, workspace: await publicWorkspace(), branding: await brandingOf(deck.organization_id).catch(() => null) }
})
