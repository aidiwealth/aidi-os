// Edit an unpaid wealth invoice. If it was already issued, its PDF is rebuilt; `send` emails it again.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = WmInvoiceBody.safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Choose the client and contracting entity, and add at least one line.')
  await saveWmInvoice(id, b.data)
  const issued = (await db().query<{ number: string | null }>('SELECT number FROM wm.fees WHERE id = $1', [id])).rows[0]?.number
  if (b.data.send || issued) await issueFee(id, b.data.send)
  await audit({ event, actorUserId: user.userId, action: 'wm.invoice_edit', objectType: 'wm_fee', objectId: id, detail: { sent: b.data.send } })
  return { ok: true, id }
})
