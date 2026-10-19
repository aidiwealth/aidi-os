// Fill a statement from a Google Sheet (share link). The link is remembered for this subject.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  await rateLimit('fin_extract', user.userId, 30, 60 * 60 * 1000)
  const b = z.object({ url: z.string().trim().max(500), subject: z.string().max(80), wanted: z.string().max(60).default('latest period') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste the Google Sheets link.')
  const buf = await fetchGoogleSheet(b.data.url)
  const text = await sheetToText(buf, 'xlsx')
  if (text.trim().length < 20) throw apiError('empty', 'That sheet looks empty.')
  if (b.data.subject && b.data.subject !== 'group') await db().query("INSERT INTO financials.connections (subject, provider, settings, connected_by, last_pulled_at) VALUES ($1,'gsheet',$2,$3,now()) ON CONFLICT (organization_id, subject, provider) DO UPDATE SET settings = EXCLUDED.settings, last_pulled_at = now(), updated_at = now()", [b.data.subject, JSON.stringify({ url: b.data.url }), user.userId])
  const org = await currentOrg(), cur = String((org?.settings.reporting_currency as string | undefined) || (org?.settings.currency as string | undefined) || 'USD')
  const sp = await spreadsheetProposal(buf, 'xlsx', /^[A-Z]{3}$/.test(cur) ? cur : 'USD', 'gsheet:' + b.data.url.slice(0, 80), b.data.wanted).catch((e) => { if ((e as { statusCode?: number }).statusCode === 429) throw e; console.error('[financials] gsheet read', (e as Error).message); return null })
  if (sp) return { ...sp, source: 'Google Sheets' }
  throw apiError('unreadable', 'We read sheets by their layout, with no AI: put the months across one heading row and the line names down the first column, or use the Finvry template.', 422)
})
