// Read an invite (.ics from Google, Outlook, Apple or Zoom) and return its events, matched to pipeline investors.
// With ?deal= every event goes to that investor.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose an .ics file.')
  if (file.data.length > 2 * 1024 * 1024) throw apiError('too_large', 'Invite files can be up to 2 MB.', 413)
  const text = file.data.toString('utf8')
  if (!text.includes('BEGIN:VCALENDAR')) throw apiError('bad_type', 'That is not a calendar invite (.ics) file.')
  const evs = parseIcs(text, 50)
  if (!evs.length) throw apiError('invalid', 'No meetings found in that file.')
  const pipeline = String(getQuery(event).pipeline ?? ''), dealQ = String(getQuery(event).deal ?? '')
  const deals = (await db().query<{ id: string; investor: string; contact_email: string | null; contact_name: string | null }>('SELECT d.id, d.investor, c.email AS contact_email, c.name AS contact_name FROM crm.deals d LEFT JOIN crm.contacts c ON c.id = d.contact_id' + (/^[0-9a-f-]{36}$/.test(pipeline) ? ' WHERE d.pipeline_id = $1' : ''), /^[0-9a-f-]{36}$/.test(pipeline) ? [pipeline] : [])).rows
  const known = new Set((await db().query<{ uid: string }>('SELECT uid FROM crm.meetings WHERE uid = ANY($1::text[])', [evs.map((e) => e.uid).filter(Boolean)])).rows.map((r) => r.uid))
  return evs.map((e) => { const m = /^[0-9a-f-]{36}$/.test(dealQ) ? { id: dealQ, why: 'this investor' } : matchDeal(e, deals); return { ...e, deal_id: m?.id ?? null, why: m?.why ?? null, added: !!e.uid && known.has(e.uid) } })
})
