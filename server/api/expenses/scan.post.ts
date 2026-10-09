// Read an invoice or receipt before the payment is logged, so the form can fill in and check the amount and receipt number.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('receipt_scan', user.userId, 60, 60 * 60 * 1000)
  const f = ((await readMultipartFormData(event)) ?? []).find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!f) throw apiError('invalid', 'Choose a file.')
  const mime = f.type || ''
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'Attach the invoice or receipt as a PDF or an image.')
  if (f.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Attachments can be up to 20 MB.', 413)
  try { return await readReceipt(new Uint8Array(f.data), mime) }
  catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[receipt] scan failed', err); throw apiError('ai_failed', 'Could not read the receipt automatically. You can still log the payment.', 422) }
})
