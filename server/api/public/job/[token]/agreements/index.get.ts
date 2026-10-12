// The job link: agreements waiting for the client's signature, and signed ones.
export default defineEventHandler(async (event) => {
  rateLimit('job_link', clientIp(event), 120, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  return (await asPlatform(() => db().query("SELECT id, title, status, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, signed_at, signer_name, CASE WHEN status = 'pending' THEN body END AS body FROM legal.signatures WHERE job_id = $1 AND status <> 'void' ORDER BY created_at DESC", [j.id]))).rows
})
