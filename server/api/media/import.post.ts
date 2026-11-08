// A picture pasted into text from another site (an email signature, a web page): copied here, so it shows in the app,
// on pages, in emails and in PDFs (the app only loads its own images). Public web addresses only; up to 10 MB.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const url = String((await readBody(event))?.url ?? '')
  if (!/^https?:\/\//i.test(url) || url.length > 4000) throw apiError('invalid', 'Not a web address.')
  const r = await safeGet(url, 10 * 1024 * 1024, 'image/*').catch(() => null)
  const data = r ? new Uint8Array(r.body) : null, mime = data ? sniffImage(data) : null
  if (!data || !mime) throw apiError('unreachable', 'That picture could not be copied. Download it and use Image to upload it.', 422)
  const name = decodeURIComponent(new URL(r!.url).pathname.split('/').pop() ?? 'image')
  return storeTextImage(event, data, name, mime)
})
