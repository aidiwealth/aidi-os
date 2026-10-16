// Support email set-up: the address and the webhook the Gmail script posts to (operator staff only).
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const tok = useRuntimeConfig().inboundEmailToken as string
  const address = ((useRuntimeConfig() as unknown as { supportInbox?: string }).supportInbox || 'support@finvry.com').toLowerCase()
  const last = (await db().query<{ at: string | null }>("SELECT max(created_at) AS at FROM support.messages WHERE direction = 'in'")).rows[0]?.at ?? null
  return { address, webhook: tok ? brands().aidi.url + '/api/public/webhooks/inbound-email?token=' + tok : null, last_received: last }
})
