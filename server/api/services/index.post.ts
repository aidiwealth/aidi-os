// Create a job, for an existing client or a new one.
import { z } from 'zod'
const Body = z.object({
  client_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  client: z.object({
    name: z.string().trim().min(1).max(200), contact_name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254),
    phone: z.string().trim().max(40).optional(), country: z.string().trim().max(100).optional()
  }).optional(),
  service: z.enum(SERVICE_KEYS),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  fee_usd: z.coerce.number().min(0).max(1e9).optional(),
  provider_entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success || (!b.data.client_id && !b.data.client)) throw apiError('invalid', 'Choose a client (or add one), a service and a title.')
  const d = b.data
  const client = await db().connect()
  let jobId: string
  try {
    await client.query('BEGIN')
    let clientId = d.client_id
    if (!clientId && d.client) {
      const c = await client.query<{ id: string }>('INSERT INTO services.clients (name, contact_name, email, phone, country, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [d.client.name, d.client.contact_name, d.client.email.toLowerCase(), d.client.phone || null, d.client.country || null, user.userId])
      clientId = c.rows[0]!.id
    }
    const j = await client.query<{ id: string }>(
      `INSERT INTO services.jobs (client_id, service, title, description, priority, due_date, fee_usd, provider_entity_id, owner_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [clientId, d.service, d.title, d.description || null, d.priority, d.due_date ?? null, d.fee_usd ?? null, d.provider_entity_id ?? null, user.userId])
    jobId = j.rows[0]!.id
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.userId, 'services.job_create', 'job', jobId, d.provider_entity_id ?? null, JSON.stringify({ service: d.service, title: d.title }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, id: jobId }
})
