// An image placed in text (any editor): stored as public media and linked from the text by a random address.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an image.')
  if (file.data.length > 10 * 1024 * 1024) throw apiError('too_large', 'Images can be up to 10 MB.', 413)
  const mime = sniffImage(new Uint8Array(file.data))
  if (!mime) throw apiError('bad_type', 'Upload a PNG, JPG, GIF or WebP image.')
  return storeTextImage(event, new Uint8Array(file.data), file.filename ?? 'image', mime)
})
