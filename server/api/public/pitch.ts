// POST /api/public/pitch (OPTIONS answers the CORS preflight) — the pitch form on aidiventures.com. Public, so: CORS limited to the Aidi Ventures site,
// Turnstile, a honeypot field, rate limits and strict validation. Screening runs after the reply is sent.
import { z } from 'zod'

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null))
const Body = z.object({
  founder_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(200),
  website: opt(500),
  deck_url: opt(1000),
  country: opt(100),
  stage: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'later']),
  sector: opt(100),
  raising_usd: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
  one_liner: z.string().trim().min(1).max(300),
  description: z.string().trim().min(20).max(5000),
  traction: opt(3000),
  team: opt(3000),
  female_founder: z.boolean().optional(),
  website_url_confirm: z.string().max(0).optional(),
  turnstile_token: z.string().max(4000).optional()
})

export default defineEventHandler(async (event) => {
  const origins = useRuntimeConfig().pitchAllowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
  if (handleCors(event, { origin: origins, methods: ['POST', 'OPTIONS'], allowHeaders: ['content-type'] })) return
  if (event.method !== 'POST') throw apiError('method_not_allowed', 'Use POST', 405)
  // Which workspace the pitch is for: ?org=<workspace link name>, else the default workspace
  const slug = String(getQuery(event).org ?? '') || useRuntimeConfig().defaultOrgSlug
  const org = await asPlatform(() => db().query<{ id: string }>('SELECT id FROM core.organizations WHERE slug = $1 AND status = ANY($2::text[])', [slug, LIVE_ORG_STATUSES]))
  if (!org.rows[0]) throw apiError('not_found', 'This pitch form is not available.', 404)
  setOrgContext(org.rows[0].id)
  await requireModule(event, 'pitches')
  const ip = clientIp(event)
  rateLimit('pitch_ip', ip, 5, 60 * 60 * 1000)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw apiError('invalid', 'Please check the form: ' + parsed.error.issues.map((i) => i.path.join('.')).join(', '), 400)
  const b = parsed.data
  if (b.website_url_confirm) return { ok: true } // honeypot: bots fill hidden fields; humans never see it
  await verifyTurnstile(b.turnstile_token, ip)
  const email = b.email.toLowerCase()
  rateLimit('pitch_email', email, 3, 24 * 60 * 60 * 1000)
  const row = await one<{ id: string }>(
    `INSERT INTO deals.pitches (founder_name, email, company, website, deck_url, country, stage, sector, raising_usd, one_liner, description, traction, team, female_founder, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [b.founder_name, email, b.company, b.website, b.deck_url, b.country, b.stage, b.sector, b.raising_usd ?? null,
     b.one_liner, b.description, b.traction, b.team, b.female_founder ?? null, ip === 'unknown' ? null : ip])
  await audit({ event, actorUserId: null, action: 'deal.pitch_received', objectType: 'pitch', objectId: row.id, detail: { company: b.company } })
  // After the reply: screen, alert partners, thank the founder. Each failure is logged; the pitch is already saved.
  void (async () => {
    try {
      const { output } = await screenPitch(row.id)
      await sendPitchAlert({ pitchId: row.id, company: b.company, oneLiner: b.one_liner, score: output.score, recommendation: output.recommendation, summary: output.summary })
    } catch (err) {
      console.error('[pitch] screening or alert failed for ' + row.id, err)
      await sendPitchAlert({ pitchId: row.id, company: b.company, oneLiner: b.one_liner, score: null, recommendation: null, summary: [] })
        .catch((e) => console.error('[pitch] fallback alert failed for ' + row.id, e))
    }
    await sendPitchReceipt(email, b.founder_name, b.company).catch((e) => console.error('[pitch] receipt email failed for ' + row.id, e))
  })()
  return { ok: true }
})
