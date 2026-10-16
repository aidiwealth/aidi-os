// The job link: agreements waiting for the client's signature, and signed ones.
export default defineEventHandler(async (event) => {
  await rateLimit('job_link', clientIp(event), 120, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const rows = (await asPlatform(() => db().query<{ body: string | null }>("SELECT id, title, status, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, signed_at, signer_name, CASE WHEN status = 'pending' THEN body END AS body FROM legal.signatures WHERE job_id = $1 AND status <> 'void' ORDER BY created_at DESC", [j.id]))).rows
  return rows.map((a) => ({ ...a, body: pendingForSigner(a.body, j.email) }))
})
