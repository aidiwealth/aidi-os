// Aidi Wealth data protection notice, one for each country: the United States (Gramm-Leach-Bliley Act privacy notice,
// SEC Regulation S-P, California Consumer Privacy Act) and Nigeria (Nigeria Data Protection Act 2023 and the NDPC's
// General Application and Implementation Directive). Shown to clients while onboarding and kept, with a record of what
// they uploaded, as a document on their account. Partners are described by role, never by name.
export const DATA_NOTICE_VERSION = '2026-11'
export interface NoticeFor { country: 'US' | 'NG'; entity: string; address?: string | null }

// The responsible company: the client's wealth entity. Aidi Finance Limited was never formed, so Nigerian clients
// without an entity are with Aidi Technology Limited.
export const noticeEntity = (entity: string | null | undefined, country: 'US' | 'NG') => (!entity || entity === 'Aidi Finance Limited' ? (country === 'NG' ? 'Aidi Technology Limited' : 'Aidi Wealth LLC') : entity)

export function dataNoticeTitle(country: 'US' | 'NG') { return country === 'NG' ? 'Data Protection Notice (Nigeria)' : 'Privacy and Data Protection Notice (United States)' }

const contact = (n: NoticeFor) => 'Write to us through Messages in your Aidi Wealth portal, reply to any Aidi Wealth email, or write to ' + n.entity + (n.address ? ', ' + n.address : '') + '. We answer within 30 days.'

const common = {
  collect: [
    '- **About you:** name, email, phone, address, household (adults, children, where you live), and for an investing account your date of birth, citizenship and tax residency.',
    '- **Your finances, as you tell us:** income, spending, what you own, debts, goals and your answers to the risk questions.',
    '- **Documents you choose to upload:** payslips, bank, brokerage and stock plan statements, and agreements. Uploading is optional; rough figures are enough to start.',
    '- **Identity numbers, only when an account needs them:** see "Identity numbers" below.',
    '- **How you use the portal:** sign-in times, the device and IP address you use, and a log of changes, kept for security.',
  ],
  notCollect: [
    '- Passwords or sign-in details for your bank, brokerage, employer or any other account. We never ask for them.',
    '- Full card numbers, card security codes or PINs.',
    '- Health, religion, political views, biometric data or other special categories of information.',
    '- Information about anyone else in your household beyond what you choose to tell us for your plan.',
  ],
  ai: [
    'When you upload a document, an AI model reads it to suggest figures for your plan, so you don\'t have to type them. Before any text reaches the model:',
    '- Social Security numbers, employer identification numbers, BVNs and dates of birth are removed.',
    '- Account and card numbers are cut to their last four digits.',
    '- Photos and scanned images are not sent to the model; your adviser looks at those.',
    'Identity numbers you type into the identity questions are never sent to the AI. Our AI provider processes the text only to give us the answer, under a contract that does not let it keep your data or use it to train its models.',
    'The AI only suggests. Nothing is saved to your plan until you check and confirm it, and an adviser reviews your plan. No decision about you is made by the AI alone.',
  ],
  security: [
    '- Data is encrypted when it travels and when it is stored.',
    '- Identity numbers are stored in a separately encrypted field; only the last four digits are shown, even to staff.',
    '- Only your adviser and the staff who need it for your account can see your information, and every view and change is logged.',
    '- Documents are stored privately and can be opened only through your signed-in portal or by authorised staff.',
  ],
}

export function dataNoticeMd(n: NoticeFor): string {
  const ng = n.country === 'NG'
  const lines: string[] = [
    '**' + n.entity + '** ("Aidi Wealth", "we") is responsible for the personal information described here. Version ' + DATA_NOTICE_VERSION + '.',
    '',
    ng
      ? 'This notice explains how we collect and use your personal data under the Nigeria Data Protection Act 2023 (NDPA) and the regulations and directives of the Nigeria Data Protection Commission (NDPC).'
      : 'This notice explains what personal information we collect, how we use and share it, and the choices you have, as required by the Gramm-Leach-Bliley Act, SEC Regulation S-P and, for California residents, the California Consumer Privacy Act (CCPA).',
    '',
    '## What we collect', ...common.collect, '',
    '## What we do not collect', ...common.notCollect, '',
    '## Identity numbers',
    ng
      ? 'To open your wallet and savings, the law on knowing our customers (CBN anti-money laundering rules) requires us to verify your Bank Verification Number (BVN). Your BVN is encrypted, used only for the identity check through our licensed verification partner, never sent to the AI, and only its last four digits are shown.'
      : 'To open a US brokerage account, the law requires your Social Security number for the identity check and tax reporting. It is encrypted, sent only to our brokerage partner to open the account, never sent to the AI, and deleted from our systems once the account is open (we keep the last four digits).',
    '',
    '## How the AI reads your documents', ...common.ai, '',
    '## Why we use your information',
    ng
      ? '- To provide the service you asked for: your financial plan, advice and account (performance of a contract, NDPA section 25(1)(b)).\n- To meet our legal duties, such as identity checks, record keeping and reporting to regulators (legal obligation, section 25(1)(c)).\n- To read the documents you choose to upload, with your consent, which you can withdraw at any time (section 25(1)(a)).\n- To keep the service secure and prevent fraud (legitimate interests, section 25(1)(e)).'
      : '- To build your financial plan, give advice and run your account.\n- To verify your identity, open accounts and meet tax, record-keeping and anti-money laundering rules.\n- To keep the service secure and prevent fraud.\n- To contact you about your account.',
    '',
    '## Who we share it with',
    'We do not sell your personal information or share it for advertising. We share it only as needed with:',
    '- ' + (ng ? 'Our licensed identity verification and wallet partners, to verify your BVN and run your wallet and savings.' : 'Our brokerage and custody partner, to open and run your investing account.'),
    '- Service providers who host our systems, send our emails and provide the AI model, under contracts that limit them to working for us.',
    '- Regulators, courts and law enforcement when the law requires it.',
    '- Anyone else only with your permission.',
    ...(ng ? ['', '## Transfers outside Nigeria', 'Our systems and some of our service providers are in the United States. When your data leaves Nigeria we protect it as the NDPA requires (sections 41 to 43): with contractual safeguards, encryption and access controls that give it the same level of protection as in Nigeria.'] : []),
    '',
    '## How long we keep it',
    ng
      ? '- Your account records, for as long as you are a client and then for at least five years after, as CBN anti-money laundering rules require.\n- Documents you uploaded, for as long as you are a client; you can ask us to delete any of them sooner unless we must keep it by law.\n- Anything you remove when you start onboarding over is deleted then.'
      : '- Advisory and account records, for as long as you are a client and then for at least five years after, as SEC record-keeping rules require.\n- Documents you uploaded, for as long as you are a client; you can ask us to delete any of them sooner unless we must keep it by law.\n- Your Social Security number, only until your brokerage account is opened.\n- Anything you remove when you start onboarding over is deleted then.',
    '',
    '## How we protect it', ...common.security, '',
    '## Your rights',
    ng
      ? 'Under the NDPA (sections 34 to 38) you can ask to: be told how your data is used; get a copy of it; correct it; delete it; restrict or object to how we use it; receive it in a portable format; withdraw consent (this does not affect what we did before); and not be subject to a decision based only on automated processing. If something goes wrong with your data and it puts you at high risk, we will tell you, and we report breaches to the NDPC within 72 hours. You can also complain to the Nigeria Data Protection Commission.'
      : 'You can ask to see the information we hold about you, correct it or delete it (except what the law requires us to keep). California residents also have the right to know what we collect and why, to delete and correct it, to limit the use of sensitive information, and to opt out of its sale or sharing (we do neither), and we will not treat you differently for using these rights. Some information we hold is covered by the Gramm-Leach-Bliley Act rather than the CCPA; we treat all of it with the same care.',
    '',
    '## Contact us', contact(n),
  ]
  return lines.join('\n')
}

// The record kept after onboarding: what was uploaded and read, and what was kept out or never collected.
export interface DataRecord { name: string; finishedAt: string; files: { name: string; at: string; read: boolean }[]; identity: 'ssn' | 'bvn' | null; topics: string[] }
export function dataRecordMd(n: NoticeFor, r: DataRecord): string {
  const when = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const files = r.files.length
    ? ['| File | Uploaded | Read by AI |', '|---|---|---|', ...r.files.map((f) => '| ' + f.name.replace(/\|/g, '/') + ' | ' + when(f.at) + ' | ' + (f.read ? 'Yes, with identity numbers removed first' : 'No: kept for your adviser to look at') + ' |')].join('\n')
    : 'You did not upload any documents.'
  return [
    'This is the record of the information you gave us while setting up your Aidi Wealth account, completed **' + when(r.finishedAt) + '** by **' + r.name + '**. The full data protection notice follows on the next page.',
    '',
    '## What you told us',
    r.topics.length ? r.topics.map((t) => '- ' + t).join('\n') : '- Your contact details only.',
    '',
    '## Documents you uploaded', files, '',
    '## Kept out of the AI',
    '- Social Security numbers, employer identification numbers, BVNs and dates of birth were removed from documents before the AI read them.',
    '- Account and card numbers were cut to their last four digits.',
    '- Photos and scans were not sent to the AI.',
    ...(r.identity === 'ssn' ? ['- Your Social Security number was typed into a protected field, never sent to the AI, stored encrypted and is deleted once your brokerage account is open.'] : []),
    ...(r.identity === 'bvn' ? ['- Your BVN was typed into a protected field, never sent to the AI, stored encrypted and used only for the identity check.'] : []),
    '',
    '## Not collected',
    '- Passwords or sign-in details for any bank, brokerage or employer account.',
    '- Full card numbers, card security codes or PINs.',
    '- Health, religion, political views, biometric data or other special categories of information.',
    '',
    'You can ask to see, correct or delete any of this. ' + contact(n),
  ].join('\n')
}

// Title blocks for the PDF: the record (who, when, which company) and the notice (where it applies, version).
export function dataDocs(n: NoticeFor, rec: { name: string; finishedAt: string; md: string } | null) {
  const d = (x: string) => new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return [
    ...(rec ? [{ title: 'Your data record', md: rec.md, header: { eyebrow: 'Aidi Wealth', fields: [{ label: 'Client', value: rec.name }, { label: 'Completed', value: d(rec.finishedAt) }, { label: 'Responsible company', value: n.entity, wide: true }] } }] : []),
    { title: dataNoticeTitle(n.country), md: dataNoticeMd(n), header: { eyebrow: 'Aidi Wealth', fields: [{ label: 'Applies to', value: n.country === 'NG' ? 'Clients in Nigeria' : 'Clients in the United States' }, { label: 'Version', value: DATA_NOTICE_VERSION }] } },
  ]
}
