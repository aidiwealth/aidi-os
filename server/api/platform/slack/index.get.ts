// Slack alerts in the console: which channels have a webhook (shown masked), and which events are on.
import { SLACK_CHANNELS, SLACK_EVENTS } from '~/shared/slack-events'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event)
  const s = await slackSettings(true)
  const mask = (u: string) => (u ? 'hooks.slack.com/…' + u.slice(-6) : '')
  return { owner: staff.staffRole === 'owner', channels: SLACK_CHANNELS.map((c) => ({ ...c, set: !!s[c.key], hint_url: mask(s[c.key]) })), events: SLACK_EVENTS.map((e) => ({ ...e, on: !s.off.includes(e.key) })) }
})
