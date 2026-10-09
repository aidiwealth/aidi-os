// Read the receipt already attached to a logged payment and record whether it matches.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('receipt_scan', user.userId, 60, 60 * 60 * 1000)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Invalid request.')
  const x = (await db().query<{ amount: number; currency: string; reference: string | null; paid_on: string; payee: string; storage_key: string | null; mime_type: string | null }>(
    "SELECT x.amount::float AS amount, x.currency, x.reference, to_char(x.paid_on, 'YYYY-MM-DD') AS paid_on, x.payee, d.storage_key, d.mime_type FROM finance.expenses x LEFT JOIN core.documents d ON d.id = x.attachment_id WHERE x.id = $1", [id])).rows[0]
  if (!x) throw apiError('not_found', 'Not found', 404)
  if (!x.storage_key || !x.mime_type) throw apiError('no_file', 'This payment has no receipt attached.')
  let read
  try { read = await readReceipt(await getObject(x.storage_key), x.mime_type) }
  catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[receipt] check failed', err); throw apiError('ai_failed', 'Could not read the receipt automatically.', 422) }
  const issues = compareReceipt(x, read)
  await saveReceiptCheck(id, read, issues)
  await audit({ event, actorUserId: user.userId, action: 'expense.receipt_check', objectType: 'expense', objectId: id, detail: { issues: issues.length } })
  return { read, issues }
})
