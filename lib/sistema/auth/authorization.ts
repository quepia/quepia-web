type AuthenticatedIdentity = {
  id: string
  email?: string | null
}

export type SistemaAccessProfile = {
  id: string
  email: string
  is_authorized: boolean
  is_active: boolean
  deleted_at: string | null
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? ""
}

export function isAuthorizedSistemaUser(
  identity: AuthenticatedIdentity,
  profile: SistemaAccessProfile | null | undefined,
): boolean {
  if (!profile || profile.id !== identity.id) return false

  const identityEmail = normalizeEmail(identity.email)
  const profileEmail = normalizeEmail(profile.email)

  return Boolean(
    identityEmail &&
    profileEmail === identityEmail &&
    profile.is_authorized === true &&
    profile.is_active === true &&
    profile.deleted_at === null,
  )
}
