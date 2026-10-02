import pg from 'pg'

let pool: pg.Pool | null = null

// One pool per server process. Fails loudly if the database is not configured.
export function db(): pg.Pool {
  if (pool) return pool
  const { databaseUrl: url, databaseCa: ca } = useRuntimeConfig()
  if (!url) throw new Error('NUXT_DATABASE_URL is not set')
  // sslmode=disable is for a local database only; anything else must verify the server certificate.
  const local = /[?&]sslmode=disable/.test(url)
  if (!local && !ca) throw new Error('NUXT_DATABASE_CA is not set')
  pool = new pg.Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: local ? false : { ca, rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30000
  })
  pool.on('error', (err) => console.error('[db] idle client error', err))
  return pool
}

// For queries that must return exactly one row: zero rows is an error, never a silent empty result.
export async function one<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T> {
  const r = await db().query<T>(text, values)
  if (r.rowCount !== 1) throw new Error('expected exactly one row, got ' + String(r.rowCount))
  return r.rows[0] as T
}
