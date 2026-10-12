// The client's agreements (for one job when ?job= is given): waiting for signature or signed.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const job = String(getQuery(event).job ?? '')
  const r = await asPlatform(() => db().query("SELECT id, title, status, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, signed_at, signer_name, job_id, CASE WHEN status = 'pending' THEN body END AS body FROM legal.signatures WHERE client_id = $1 AND status <> 'void' AND ($2 = '' OR job_id::text = $2) ORDER BY created_at DESC", [u.clientId, /^[0-9a-f-]{36}$/.test(job) ? job : '']))
  return r.rows
})
