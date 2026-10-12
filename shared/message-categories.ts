// Labels the services team can put on a message to a client (shown as a tag and in the email subject).
export const MSG_CATEGORIES: Record<string, string> = { general: 'General', state_notice: 'State notice', tax_notice: 'IRS / tax notice', bank_notice: 'Bank notice', mail: 'Mail received', compliance: 'Compliance reminder', legal: 'Legal notice', billing: 'Billing' }
export const MSG_CATEGORY_KEYS = ['general', 'state_notice', 'tax_notice', 'bank_notice', 'mail', 'compliance', 'legal', 'billing'] as const
