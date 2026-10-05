// GET /api/v1/compliance — your filing and renewal deadlines.
export default defineEventHandler(async (event) => {
  await requireApiKey(event, 'read')
  return { data: (await db().query("SELECT id, title, category, jurisdiction, recurrence, to_char(next_due, 'YYYY-MM-DD') AS next_due, (next_due - current_date)::int AS days_left FROM compliance.obligations WHERE active ORDER BY next_due")).rows }
})
