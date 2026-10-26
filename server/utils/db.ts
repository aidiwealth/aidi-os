import pg from 'pg'
import type { H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

// Workspace isolation: every connection checked out of the pool is told which workspace it acts for
// (app.org_id) and whether this is a platform-level operation (app.bypass). Row-level security in the
// database then filters every table. A connection with neither set sees no tenant rows at all.
let pool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (pool) return pool
  const { databaseUrl: url, databaseCa: ca } = useRuntimeConfig()
  if (!url) throw new Error('NUXT_DATABASE_URL is not set')
  // sslmode=disable is for a local database only; anything else must verify the server certificate.
  const local = /[?&]sslmode=disable/.test(url)
  if (!local && !ca) throw new Error('NUXT_DATABASE_CA is not set')
  pool = new pg.Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: local ? false : { ca, rejectUnauthorized: true },
    // Connections kept warm so a page does not wait to reconnect. DB_POOL_MAX raises the count (stay under the
    // database plan's connection limit across all app instances).
    max: Number(process.env.DB_POOL_MAX) || 10,
    // Opening a connection to the managed database (TLS and sign-in) costs a few hundred milliseconds, so open ones are
    // kept rather than closed after a quiet minute; the server reconnects on its own if the database drops one.
    idleTimeoutMillis: 0,
    keepAlive: true
  })
  pool.on('error', (err) => console.error('[db] idle client error', err))
  return pool
}

function requestEvent(): H3Event | undefined { try { return useEvent() } catch { return undefined } }
export function currentOrgId(): string | null { return (requestEvent()?.context.orgId as string | undefined) ?? null }

const applied = new WeakMap<pg.PoolClient, string>()
async function checkout(): Promise<pg.PoolClient> {
  const e = requestEvent()
  const org = (e?.context.orgId as string | undefined) ?? ''
  const bypass = e?.context.dbBypass === true ? 'on' : 'off'
  const scope = (e?.context.entityScope as string | undefined) ?? ''
  // Customer revenue: the company it is for (app.cust_entity, see 142_entity_customers.sql); empty reads every company.
  const cust = (e?.context.custEntity as string | undefined) ?? ''
  const client = await getPool().connect()
  // Pooled connections keep their settings; only send them again when this request needs different ones.
  const key = org + '|' + bypass + '|' + scope + '|' + cust
  if (applied.get(client) === key) return client
  try {
    await client.query("SELECT set_config('app.org_id', $1, false), set_config('app.bypass', $2, false), set_config('app.entity_scope', $3, false), set_config('app.cust_entity', $4, false)", [org, bypass, scope, cust])
    applied.set(client, key)
  } catch (err) { applied.delete(client); client.release(err as Error); throw err }
  return client
}

const wrapper = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<R extends pg.QueryResultRow = any>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>> {
    // Time spent in the database per request, for the slow-request log and the Server-Timing header.
    const e = requestEvent(), t0 = performance.now()
    const client = await checkout()
    try { return await client.query<R>(text, values) } finally {
      client.release()
      if (e) { e.context.__dbMs = ((e.context.__dbMs as number | undefined) ?? 0) + (performance.now() - t0); e.context.__dbN = ((e.context.__dbN as number | undefined) ?? 0) + 1 }
    }
  },
  connect: checkout
}
export function db(): typeof wrapper { return wrapper }
// Open a few connections ahead of the first visitors (after a deploy or restart).
export async function warmPool(n = 5): Promise<void> {
  const p = getPool(), cs = await Promise.all(Array.from({ length: n }, () => p.connect().catch(() => null)))
  for (const c of cs) c?.release()
}

// Act for a given workspace for the rest of this request (public links, scheduled jobs).
export function setOrgContext(orgId: string | null): void {
  const e = requestEvent()
  if (!e) throw new Error('setOrgContext outside a request')
  e.context.orgId = orgId
}
// Platform-level reads across workspaces (sign-in, resolving public links, the platform console). Keep these narrow.
export async function asPlatform<T>(fn: () => Promise<T>): Promise<T> {
  const e = requestEvent()
  if (!e) throw new Error('asPlatform outside a request')
  // A depth count, not save-and-restore: two asPlatform calls running at once must not leave the bypass on.
  e.context.dbBypassDepth = (e.context.dbBypassDepth ?? 0) + 1
  e.context.dbBypass = true
  try { return await fn() } finally { e.context.dbBypassDepth -= 1; if (e.context.dbBypassDepth <= 0) { e.context.dbBypassDepth = 0; e.context.dbBypass = false } }
}

// For queries that must return exactly one row: zero rows is an error, never a silent empty result.
export async function one<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T> {
  const r = await db().query<T>(text, values)
  if (r.rowCount !== 1) throw new Error('expected exactly one row, got ' + String(r.rowCount))
  return r.rows[0] as T
}
