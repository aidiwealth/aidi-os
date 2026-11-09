// The investing account agreements, as a plain-English Aidi Wealth summary the client reads before ticking the box,
// with a link to the brokerage partner's full text (which names the partner). The summary never replaces the agreement.
// Check the full-text links when the partner updates its documents.
export interface AgreementSummary { code: string; title: string; intro: string; points: string[]; full: string; fullLabel: string }
export const AGREEMENTS: Record<string, AgreementSummary> = {
  customer: {
    code: 'customer', title: 'Brokerage customer agreement',
    intro: 'Your investing account is held in your own name at our US brokerage partner, which keeps your investments and carries out your trades. This agreement is between you and that partner.',
    points: [
      'The account is yours: the investments are held for you, separately from Aidi Wealth\'s own money.',
      'The partner is a registered broker-dealer, a member of FINRA and SIPC. SIPC protects the securities in your account up to its limits if the broker fails; it does not protect against investments falling in value.',
      'You agree to give accurate information about yourself and to tell us if it changes. It is used to verify your identity and for tax reporting.',
      'Statements, trade confirmations and tax forms are delivered electronically, through your portal and by email.',
      'Investing involves risk, including losing money. Past results don\'t predict future ones.',
      'Either side can close the account. You can move your investments to another broker at any time.',
      'Disputes with the broker are settled by arbitration, as the agreement sets out.',
    ],
    full: 'https://files.alpaca.markets/disclosures/library/AcctAppMarginAndCustAgmt.pdf', fullLabel: 'Read the full customer agreement (PDF)',
  },
  crypto: {
    code: 'crypto', title: 'Crypto agreement',
    intro: 'Only if you switch crypto on. Crypto is bought, sold and held for you by the brokerage partner\'s crypto service, under its own agreement.',
    points: [
      'Crypto is not a security, and it is not protected by SIPC or the FDIC.',
      'Prices can rise or fall sharply, at any hour, and you can lose everything you put in.',
      'Crypto trades and holdings are kept apart from your shares and funds.',
      'You can switch crypto off later; any coins you hold stay yours to sell.',
    ],
    full: 'https://files.alpaca.markets/disclosures/library/CryptoCustomerAgreement.pdf', fullLabel: 'Read the full crypto agreement (PDF)',
  },
}
