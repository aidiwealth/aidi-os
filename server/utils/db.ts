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
    max: 10,
    idleTimeoutMillis: 30000
  })
  pool.on('error', (err) => console.error('[db] idle client error', err))
  return pool
}

function requestEvent(): H3Event | undefined { try { return useEvent() } catch { return undefined } }
export function currentOrgId(): string | null { return (requestEvent()?.context.orgId as string | undefined) ?? null }

async function checkout(): Promise<pg.PoolClient> {
  const e = requestEvent()
  const org = (e?.context.orgId as string | undefined) ?? ''
  const bypass = e?.context.dbBypass === true ? 'on' : 'off'
  const client = await getPool().connect()
  try {
    await client.query("SELECT set_config('app.org_id', $1, false), set_config('app.bypass', $2, false)", [org, bypass])
  } catch (err) { client.release(err as Error); throw err }
  return client
}

const wrapper = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<R extends pg.QueryResultRow = any>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>> {
    const client = await checkout()
    try { return await client.query<R>(text, values) } finally { client.release() }
  },
  connect: checkout
}
export function db(): typeof wrapper { return wrapper }

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
  const prev = e.context.dbBypass
  e.context.dbBypass = true
  try { return await fn() } finally { e.context.dbBypass = prev }
}

// For queries that must return exactly one row: zero rows is an error, never a silent empty result.
export async function one<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T> {
  const r = await db().query<T>(text, values)
  if (r.rowCount !== 1) throw new Error('expected exactly one row, got ' + String(r.rowCount))
  return r.rows[0] as T
}
