// Two brands on one platform. The address decides the sign-in experience (app.finvry.com = Finvry,
// app.theaidigroup.com = Aidi OS); a workspace's own brand decides its emails and links, so scheduled
// emails and public links always carry the right name and address.
import type { H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

export type BrandKey = 'aidi' | 'finvry'
export interface Brand { key: BrandKey; name: string; url: string; from: string; logoHtml: string; footerHtml: string; smallprint: string }
const NAVY = '#0c1a2e', BLUE = '#1c547d', SOFT = '#4a4a4a', RULE = '#e7e5e0'

export function brands(): Record<BrandKey, Brand> {
  const c = useRuntimeConfig()
  const serif = "font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;"
  return {
    aidi: {
      key: 'aidi', name: 'Aidi', url: c.public.appBaseUrl, from: 'Aidi <' + ((c.emailFrom as string).match(/<([^>]+)>/)?.[1] ?? c.emailFrom) + '>',
      logoHtml: `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;"><img src="${c.public.appBaseUrl}/brand/aidi-wordmark.png" alt="Aidi" width="61" height="24" style="display:block;width:61px;height:24px;"></td><td style="vertical-align:middle;padding:0 12px;"><div style="width:1px;height:20px;background:${RULE};"></div></td><td style="vertical-align:middle;${serif}font-style:italic;font-size:19px;color:${NAVY};">OS</td></tr></table>`,
      footerHtml: `<p style="margin:0 0 4px;color:${SOFT};font-size:12.5px;line-height:1.5;">The Aidi Group · Internal back office</p><p style="margin:0;font-size:12px;line-height:1.6;"><a href="https://theaidigroup.com" style="color:${BLUE};text-decoration:none;">theaidigroup.com</a></p>`,
      smallprint: "You're receiving this because you have access to Aidi. © The Aidi Group"
    },
    finvry: {
      key: 'finvry', name: 'Finvry', url: c.public.finvryBaseUrl, from: c.emailFromFinvry || c.emailFrom,
      logoHtml: `<div style="${serif}font-weight:500;font-size:26px;letter-spacing:-0.01em;color:${NAVY};">Finvry<span style="color:#5fa8d3;">.</span></div>`,
      footerHtml: `<p style="margin:0 0 4px;color:${SOFT};font-size:12.5px;line-height:1.5;">Finvry · Operations for investors and family offices</p><p style="margin:0;font-size:12px;line-height:1.6;"><a href="https://finvry.com" style="color:${BLUE};text-decoration:none;">finvry.com</a></p>`,
      smallprint: "You're receiving this because you have access to Finvry."
    }
  }
}

export function hostBrand(event?: H3Event): BrandKey {
  const force = useRuntimeConfig().public.forceBrand
  if (force === 'finvry' || force === 'aidi') return force
  let e = event
  if (!e) { try { e = useEvent() } catch { e = undefined } }
  const host = e ? (getRequestHost(e, { xForwardedHost: true }) || '') : ''
  return /finvry/i.test(host) ? 'finvry' : 'aidi'
}

// The workspace's brand when acting for one, else the address's.
export async function resolveBrand(): Promise<BrandKey> {
  if (currentOrgId()) {
    const org = await currentOrg()
    if (org) return org.settings.brand === 'aidi' ? 'aidi' : 'finvry'
  }
  return hostBrand()
}
export async function appUrl(): Promise<string> { return brands()[await resolveBrand()].url }
