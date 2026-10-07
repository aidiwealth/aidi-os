// LP portal: open one of the LP's tax documents (recorded).
import { createHash } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? ''), tid = String(getRouterParam(event, 'tid') ?? '')
  if (token.length < 20 || token.startsWith('pv.') || !/^[0-9a-f-]{36}$/.test(tid)) throw apiError('invalid_link', 'This link is not valid.', 404)
  const lp = (await asPlatform(() => db().query<{ id: string; organization_id: string }>('SELECT id, organization_id FROM funds.lps WHERE portal_token_hash = $1 AND portal_token_expires > now()', [createHash('sha256').update(token).digest('hex')]))).rows[0]
  if (!lp) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(lp.organization_id)
  const d = (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM core.tax_docs t JOIN core.documents d ON d.id = t.document_id WHERE t.id = $1 AND t.lp_id = $2', [tid, lp.id])).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  await db().query('UPDATE core.tax_docs SET first_viewed_at = coalesce(first_viewed_at, now()), downloads = downloads + 1 WHERE id = $1', [tid])
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title, seconds: 300, inline: true }))
})
