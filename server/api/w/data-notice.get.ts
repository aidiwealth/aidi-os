// Wealth client: the data protection notice for their country (and the company responsible for their data).
import { dataNoticeMd, dataNoticeTitle, noticeEntity } from '~/shared/wm-data-notice'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Your wealth account is not set up yet.', 404)
  const x = await docContext(id), country = x.c.country === 'NG' ? 'NG' : 'US'
  return { title: dataNoticeTitle(country), md: dataNoticeMd({ country, entity: noticeEntity(x.entity, country), address: x.c.entity_address }) }
})
