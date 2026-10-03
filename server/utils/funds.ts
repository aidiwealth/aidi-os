// Venture capital vehicles are funds and SPVs only; family-office entities stay out of the VC records.
export async function assertFund(id: string | null | undefined): Promise<void> {
  if (!id) return
  const r = await db().query("SELECT 1 FROM core.entities WHERE id = $1 AND kind IN ('fund','spv')", [id])
  if (!r.rowCount) throw apiError('invalid', 'Choose one of your funds.')
}
