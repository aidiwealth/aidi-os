// Fund professionals listed by the Aidi team. Independent firms: Finvry gives no legal, regulatory, tax or administration services.
export const PRO_SERVICES: Record<string, string> = {
  fund_formation: 'Fund and SPV formation', legal: 'Fund lawyer', fund_admin: 'Fund administration', audit: 'Audit', tax: 'Tax',
  kyc: 'KYC and AML', company_secretary: 'Company secretary', banking: 'Banking and custody', valuation: 'Valuation'
}
export const PRO_SERVICE_KEYS = Object.keys(PRO_SERVICES) as [string, ...string[]]
