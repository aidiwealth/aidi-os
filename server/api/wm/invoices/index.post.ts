// Create a wealth invoice for a client (draft, or issued and emailed with `send`).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = WmInvoiceBody.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the client and contracting entity, and add at least one line.')
  const id = await saveWmInvoice(null, b.data)
  let number: string | null = null
  if (b.data.send) number = (await issueFee(id, true)).number ?? null
  await audit({ event, actorUserId: user.userId, action: 'wm.invoice_create', objectType: 'wm_fee', objectId: id, detail: { sent: b.data.send } })
  return { ok: true, id, number }
})
