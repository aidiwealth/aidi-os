// Who a debt is owed to, suggested by the kind of debt and the client's country, only to help name it. The client can
// type any other name. Keys are matched against the debt's name (e.g. "Car loan"); '' is the fallback list.
const US_BANKS = ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One', 'U.S. Bank', 'PNC', 'Truist', 'Navy Federal Credit Union', 'A credit union']
const NG_BANKS = ['Access Bank', 'Zenith Bank', 'GTBank', 'First Bank', 'UBA', 'Stanbic IBTC', 'Fidelity Bank', 'FCMB', 'Union Bank', 'Sterling Bank', 'Wema Bank', 'Ecobank', 'Polaris Bank', 'Keystone Bank', 'Providus Bank']
export const LENDERS: Record<'US' | 'NG', Record<string, string[]>> = {
  US: {
    'car|auto|vehicle': ['Ally Financial', 'Capital One Auto Finance', 'Chase Auto', 'Wells Fargo Auto', 'Bank of America', 'Toyota Financial Services', 'Honda Financial Services', 'Ford Credit', 'GM Financial', 'Hyundai Motor Finance', 'Nissan Motor Acceptance', 'Santander Consumer USA', 'A credit union'],
    'card|credit': ['American Express', 'Chase', 'Capital One', 'Citi', 'Bank of America', 'Discover', 'Wells Fargo', 'U.S. Bank', 'Barclays', 'Synchrony', 'Apple Card', 'Store card'],
    'student|school|college|university|tuition': ['Federal student aid (U.S. Department of Education)', 'MOHELA', 'Aidvantage', 'Nelnet', 'EdFinancial', 'Sallie Mae', 'Navient', 'SoFi', 'College Ave', 'Earnest', 'My university'],
    'mortgage|home|house|heloc': ['Rocket Mortgage', 'United Wholesale Mortgage', 'Chase', 'Wells Fargo', 'Bank of America', 'U.S. Bank', 'PennyMac', 'Mr. Cooper', 'loanDepot', 'Navy Federal Credit Union'],
    'personal|loan': ['SoFi', 'LendingClub', 'Upstart', 'Best Egg', 'Prosper', 'Discover', ...US_BANKS],
    '': [...US_BANKS, 'American Express', 'Discover', 'SoFi', 'Family or friend', 'Employer'],
  },
  NG: {
    'car|auto|vehicle': [...NG_BANKS, 'Autochek', 'Car dealer finance'],
    'card|credit': NG_BANKS,
    'student|school|college|university|tuition': ['NELFUND (Nigerian Education Loan Fund)', 'University of Lagos', 'University of Ibadan', 'Obafemi Awolowo University', 'University of Nigeria, Nsukka', 'Ahmadu Bello University', 'Covenant University', 'Babcock University', 'Pan-Atlantic University', 'American University of Nigeria', 'My school'],
    'mortgage|home|house': ['Federal Mortgage Bank of Nigeria (NHF)', 'Infinity Trust Mortgage Bank', 'Abbey Mortgage Bank', 'Haggai Mortgage Bank', ...NG_BANKS],
    'personal|loan': ['FairMoney', 'Carbon', 'Renmoney', 'Palmcredit', 'Branch', 'Page Financials', ...NG_BANKS],
    '': [...NG_BANKS, 'FairMoney', 'Carbon', 'Renmoney', 'Cooperative society', 'Family or friend', 'Employer'],
  },
}
export function lendersFor(country: 'US' | 'NG', debtName: string): string[] {
  const m = LENDERS[country]
  for (const [k, v] of Object.entries(m)) if (k && new RegExp(k, 'i').test(debtName)) return v
  return m['']!
}
