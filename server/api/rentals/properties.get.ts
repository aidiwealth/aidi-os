// Properties, their rooms/units (listing, rating, iCal) and leases; expense categories; recent activity per unit.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const props = (await db().query("SELECT id, name, address, kind, ownership, bedrooms, to_char(acquired_on, 'YYYY-MM-DD') AS acquired_on, image_url, notes, entity_id FROM rentals.properties WHERE active ORDER BY sort, name")).rows
  const units = (await db().query("SELECT id, property_id, name, rental_model, source, aliases, airbnb_listing_id, ical_url, title, image_url, images, rating::float, review_count, refreshed_at, ical_synced_at, refresh_error FROM rentals.units WHERE active ORDER BY sort, name")).rows
  const leases = (await db().query("SELECT id, unit_id, tenant_name, tenant_email, tenant_phone, rent::float, due_day, deposit::float, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, document_id, status, notes FROM rentals.leases ORDER BY starts_on DESC")).rows
  const upcoming = (await db().query("SELECT unit_id, to_char(starts, 'YYYY-MM-DD') AS starts, to_char(ends, 'YYYY-MM-DD') AS ends, confirmation_code FROM rentals.calendar WHERE kind = 'reserved' AND ends >= current_date ORDER BY starts LIMIT 200")).rows
  const activity = (await db().query('SELECT unit_id, property_id, event, detail, created_at FROM rentals.activity WHERE unit_id IS NOT NULL ORDER BY created_at DESC LIMIT 60')).rows
  const categories = (await db().query('SELECT code, label, hint FROM rentals.expense_categories ORDER BY sort, label')).rows
  const entities = (await db().query("SELECT id, name FROM core.entities ORDER BY name")).rows
  return { properties: props, units, leases, upcoming, activity, categories, entities, admin: isRentalAdmin(user.roles) }
})
