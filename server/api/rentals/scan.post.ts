// Read a rental receipt with AI before it is logged, so the form can fill in the amount, date and vendor.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await assertReceiptAi()
  rateLimit('receipt_scan', user.userId, 60, 60 * 60 * 1000)
  const f = ((await readMultipartFormData(event)) ?? []).find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!f) throw apiError('invalid', 'Choose a file.')
  const mime = f.type || ''
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'AI can read PDF, PNG, JPG or WebP receipts. The file will still be attached.')
  if (f.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'Receipts can be up to 15 MB.', 413)
  try { return await readReceipt(new Uint8Array(f.data), mime) }
  catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[rentals] receipt scan failed', err); throw apiError('ai_failed', 'Could not read the receipt automatically. Fill in the details yourself.', 422) }
})
