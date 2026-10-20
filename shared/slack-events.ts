// Slack alerts: three channels and the events that go to each. Only what someone should act on, or would want to know
// the same day, goes to Slack; routine activity stays in the app and in email digests.
export type SlackChannel = 'aidi' | 'finvry' | 'critical'
export const SLACK_CHANNELS: { key: SlackChannel; label: string; hint: string }[] = [
  { key: 'aidi', label: 'Aidi OS', hint: 'Pitches, compliance, Aidi Wealth clients and investor engagement' },
  { key: 'finvry', label: 'Finvry', hint: 'Access requests, sign-ups, payments, service jobs and client messages' },
  { key: 'critical', label: 'Critical', hint: 'Failed charges, broken payment or system jobs, security and access changes' }]
export const SLACK_EVENTS: { key: string; channel: SlackChannel; label: string }[] = [
  { key: 'aidi.pitch', channel: 'aidi', label: 'New pitch submitted (with its AI score)' },
  { key: 'aidi.compliance', channel: 'aidi', label: 'Filings due within 7 days or overdue (daily)' },
  { key: 'aidi.wealth_message', channel: 'aidi', label: 'An Aidi Wealth client sends a message' },
  { key: 'aidi.wealth_client', channel: 'aidi', label: 'New Aidi Wealth client or intake submitted' },
  { key: 'aidi.engagement', channel: 'aidi', label: 'An investor signs an NDA, opens the data room, or an LP registers interest in a deal' },
  { key: 'aidi.fund', channel: 'aidi', label: 'Capital call or distribution notices sent' },
  { key: 'finvry.access', channel: 'finvry', label: 'New access request' },
  { key: 'finvry.signup', channel: 'finvry', label: 'New company signs up' },
  { key: 'finvry.payment', channel: 'finvry', label: 'Payment received (wallet top-up, invoice paid)' },
  { key: 'finvry.renewal', channel: 'finvry', label: 'Plan or service renewal charged' },
  { key: 'finvry.job', channel: 'finvry', label: 'Service ordered' },
  { key: 'finvry.job_done', channel: 'finvry', label: 'Service job completed' },
  { key: 'finvry.message', channel: 'finvry', label: 'A client sends a message or reply' },
  { key: 'finvry.compliance', channel: 'finvry', label: 'Client filings Finvry handles that are overdue (daily)' },
  { key: 'critical.charge_failed', channel: 'critical', label: 'A charge fails or a company falls behind on payment' },
  { key: 'critical.webhook', channel: 'critical', label: 'A payment webhook fails its signature or errors' },
  { key: 'critical.cron', channel: 'critical', label: 'A scheduled job fails' },
  { key: 'critical.security', channel: 'critical', label: 'Support access, new admins, staff and role changes' },
  { key: 'critical.capacity', channel: 'critical', label: 'Weekly sign-up cap or monthly services cap reached' }]
