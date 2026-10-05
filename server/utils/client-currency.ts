// A services client's billing currency: naira if their Finvry company is in Nigeria, otherwise US dollars.
export async function clientIsNigerian(clientId: string): Promise<boolean> {
  const r = (await asPlatform(() => db().query<{ country: string | null; currency: string | null; ccountry: string | null }>(
    "SELECT o.settings->>'country' AS country, o.settings->>'currency' AS currency, c.country AS ccountry FROM services.clients c LEFT JOIN core.organizations o ON o.id = c.workspace_id WHERE c.id = $1", [clientId]))).rows[0]
  return !!r && (r.currency === 'NGN' || /^\s*nigeria\s*$/i.test(r.country ?? r.ccountry ?? ''))
}
// The price a client sees for a service: the naira price for Nigerian clients when set, else the US$ price.
export function priceFor<T extends { price: number | string | null; price_ngn: number | string | null; currency: string }>(i: T, ng: boolean): { price: number | null; currency: string } {
  if (ng && i.price_ngn != null) return { price: Number(i.price_ngn), currency: 'NGN' }
  return { price: i.price == null ? null : Number(i.price), currency: i.currency }
}
