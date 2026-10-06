// The public blog API is read from the Aidi workspace and may be called from theaidigroup.com in the browser.
const ORIGINS = ['https://theaidigroup.com', 'https://www.theaidigroup.com']
export function blogCors(event: Parameters<typeof getRequestHeader>[0]) {
  const o = getRequestHeader(event, 'origin') ?? ''
  if (ORIGINS.includes(o) || /^http:\/\/localhost:\d+$/.test(o)) { setHeader(event, 'access-control-allow-origin', o); setHeader(event, 'vary', 'Origin') }
  setHeader(event, 'cache-control', 'public, max-age=120, s-maxage=300')
}
export async function aidiOrgId(): Promise<string> {
  const id = (await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE plan_code = 'internal' ORDER BY created_at LIMIT 1"))).rows[0]?.id
  if (!id) throw apiError('not_found', 'Not found', 404)
  return id
}
export const readingMinutes = (s: string) => Math.max(1, Math.round((s.match(/\w+/g)?.length ?? 0) / 220))
