// How fast the database answers from this server: five one-line queries, each a full round trip. Aidi platform staff
// only. Opened in the browser when pages feel slow: a few milliseconds each is normal; tens of milliseconds means the
// app and the database are far apart (different regions, or not on the private network).
export default defineEventHandler(async (event) => {
  await requirePlatformView(event)
  const t: number[] = []
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); await db().query('SELECT 1'); t.push(Math.round((performance.now() - t0) * 10) / 10) }
  const avg = Math.round(t.slice(1).reduce((a, x) => a + x, 0) / 4 * 10) / 10
  return { db_round_trip_ms: t, typical_ms: avg, verdict: avg < 5 ? 'Database is close: speed is not about distance.' : avg < 20 ? 'Database is a little far: pages with many queries will feel it.' : 'Database is far from the app: move them into the same region and use the private network address.', app_region: process.env.DIGITALOCEAN_REGION ?? process.env.REGION ?? null }
})
