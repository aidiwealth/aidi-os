// Console: open a customer's signed agreement.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = (await asPlatform(() => db().query<{ pdf_key: string; title: string }>('SELECT pdf_key, title FROM legal.signatures WHERE id = $1 AND pdf_key IS NOT NULL', [id.data]))).rows[0]
  if (!r) throw apiError('not_found', 'Not found', 404)
  return { url: await signedGetUrl({ key: r.pdf_key, filename: r.title + '.pdf', seconds: 120, inline: true }) }
})
