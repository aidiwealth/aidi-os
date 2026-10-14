// How shared rental costs are split: each category's basis and each room/unit's size weight.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const categories = (await db().query('SELECT code, label, split FROM rentals.expense_categories ORDER BY sort, label')).rows
  const units = (await db().query("SELECT u.id, u.name, p.name AS property, u.cost_weight::float AS weight FROM rentals.units u JOIN rentals.properties p ON p.id = u.property_id WHERE u.active ORDER BY p.sort, p.name, u.sort, u.name")).rows
  return { categories, units, admin: isRentalAdmin(user.roles) }
})
