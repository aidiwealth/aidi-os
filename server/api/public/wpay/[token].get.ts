export default defineEventHandler(async (event) => {
  const id = wmFeeFromToken(String(getRouterParam(event, 'token') ?? ''))
  if (!id) throw apiError('invalid_link', 'This link is not valid.', 404)
  const f = (await asPlatform(() => db().query<{ organization_id: string; number: string | null; kind: string; period: string | null; amount: string; currency: string; status: string; client: string | null; entity: string | null }>("SELECT f.organization_id, f.number, f.kind, f.period, f.amount::text, f.currency, f.status, c.name AS client, e.name AS entity FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN core.entities e ON e.id = coalesce(f.entity_id, c.entity_id) WHERE f.id = $1", [id]))).rows[0]
  if (!f) throw apiError('invalid_link', 'This link is not valid.', 404)
  return { number: f.number, kind: f.kind, period: f.period, amount: Number(f.amount), currency: f.currency, status: f.status, client: f.client, entity: f.entity, providers: f.currency === 'USD' ? (stripeOn() ? ['stripe'] : []) : (paystackOn() ? ['paystack'] : []) }
})
