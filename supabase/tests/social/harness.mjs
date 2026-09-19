// Arnés PGlite para las migraciones sociales: crea una base efímera con el
// esquema mínimo de Quepia, aplica las migraciones reales de Zernio y las del
// módulo social, y expone helpers para actuar como distintos roles.
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"

const root = resolve(import.meta.dirname, "../../..")
const migrationsDir = join(root, "supabase/migrations")

export const SOCIAL_MIGRATIONS = readdirSync(migrationsDir)
  .filter((name) => /^20260918\d+_social_.*\.sql$/.test(name))
  .sort()

const BASE_MIGRATIONS = [
  "20260817222854_zernio_phase_one.sql",
  "20260817223033_zernio_phase_one_hardening.sql",
]

export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  admin2: "00000000-0000-4000-8000-000000000002",
  member: "00000000-0000-4000-8000-000000000003",
  revoked: "00000000-0000-4000-8000-000000000004",
  unauthorized: "00000000-0000-4000-8000-000000000005",
}

export async function createSocialDb({ only } = {}) {
  const db = new PGlite()
  await db.exec(readFileSync(join(root, "supabase/tests/social/bootstrap.sql"), "utf8"))
  for (const name of BASE_MIGRATIONS) {
    await db.exec(readFileSync(join(migrationsDir, name), "utf8"))
  }
  const list = only ? SOCIAL_MIGRATIONS.filter((name) => only.some((prefix) => name.includes(prefix))) : SOCIAL_MIGRATIONS
  for (const name of list) {
    try {
      await db.exec(readFileSync(join(migrationsDir, name), "utf8"))
    } catch (error) {
      error.message = `${name}: ${error.message}`
      throw error
    }
  }
  await db.exec(`
    INSERT INTO public.sistema_users(id, email, nombre, role, is_active, is_authorized, deleted_at) VALUES
      ('${IDS.admin}', 'admin@quepia.test', 'Admin', 'admin', true, true, NULL),
      ('${IDS.admin2}', 'admin2@quepia.test', 'Admin 2', 'admin', true, true, NULL),
      ('${IDS.member}', 'member@quepia.test', 'Integrante', 'member', true, true, NULL),
      ('${IDS.revoked}', 'revoked@quepia.test', 'Revocado', 'admin', false, true, NULL),
      ('${IDS.unauthorized}', 'pending@quepia.test', 'Pendiente', 'admin', true, false, NULL);
  `)
  return db
}

/** Ejecuta una RPC como service_role (camino del servidor Next.js). */
export async function rpc(db, fn, args = []) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ")
  await db.exec("SET ROLE service_role")
  try {
    const result = await db.query(`SELECT public.${fn}(${placeholders}) AS r`, args.map(serialize))
    return result.rows[0].r
  } finally {
    await db.exec("RESET ROLE")
  }
}

/** Ejecuta SQL arbitrario como un rol concreto (para probar grants/RLS). */
export async function asRole(db, role, sql, params = [], claims = null) {
  await db.exec(`SET ROLE ${role}`)
  if (claims) await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec("RESET ROLE")
    await db.query("SELECT set_config('request.jwt.claims', '', false)")
  }
}

/** Marca un arreglo JS para enviarlo como text[] (no como jsonb). */
export const pgArray = (values) => ({ __pgArray: values })

function serialize(value) {
  if (value && typeof value === "object" && "__pgArray" in value) return value.__pgArray
  if (value !== null && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value)
  return value
}

export async function seedClientWithAccounts(db, { name = "Cliente A", projects = 1, accounts = [] } = {}) {
  const created = await rpc(db, "social_admin_create_client", [IDS.admin, name])
  if (!created.ok) throw new Error(JSON.stringify(created))
  const clientId = created.data.id
  const projectIds = []
  const profileIds = []
  for (let index = 0; index < projects; index += 1) {
    const { rows } = await db.query(
      "INSERT INTO public.sistema_projects(nombre, owner_id) VALUES ($1, $2) RETURNING id",
      [`${name} proyecto ${index + 1}`, IDS.admin],
    )
    projectIds.push(rows[0].id)
    const profile = await db.query(
      "INSERT INTO public.sistema_zernio_profiles(project_id, zernio_profile_id, name) VALUES ($1, $2, $3) RETURNING id",
      [rows[0].id, `zp_${name.replace(/\W/g, "")}_${index}`, `${name} ${index}`],
    )
    profileIds.push(profile.rows[0].id)
  }
  const accountIds = []
  for (const account of accounts) {
    const profileId = profileIds[account.profileIndex ?? 0]
    const { rows } = await db.query(
      `INSERT INTO public.sistema_zernio_accounts(integration_id, zernio_account_id, platform, username)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [profileId, account.zernioId, account.platform || "instagram", account.username || account.zernioId],
    )
    accountIds.push(rows[0].id)
  }
  for (const projectId of projectIds) {
    const assigned = await rpc(db, "social_admin_assign_project_client", [IDS.admin, projectId, clientId])
    if (!assigned.ok) throw new Error(JSON.stringify(assigned))
  }
  return { clientId, projectIds, profileIds, accountIds }
}
