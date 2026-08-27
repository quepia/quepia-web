import test from "node:test"
import assert from "node:assert/strict"
import { isAuthorizedSistemaUser } from "./authorization.ts"

const identity = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "Persona@Example.com",
}

const authorizedProfile = {
  id: identity.id,
  email: " persona@example.com ",
  is_authorized: true,
  is_active: true,
  deleted_at: null,
}

test("autoriza solo un perfil activo aprobado con la misma identidad", () => {
  assert.equal(isAuthorizedSistemaUser(identity, authorizedProfile), true)
})

test("rechaza perfiles ausentes, pendientes, inactivos o eliminados", () => {
  assert.equal(isAuthorizedSistemaUser(identity, null), false)
  assert.equal(
    isAuthorizedSistemaUser(identity, {
      ...authorizedProfile,
      is_authorized: false,
    }),
    false,
  )
  assert.equal(
    isAuthorizedSistemaUser(identity, {
      ...authorizedProfile,
      is_active: false,
    }),
    false,
  )
  assert.equal(
    isAuthorizedSistemaUser(identity, {
      ...authorizedProfile,
      deleted_at: "2026-08-27T12:00:00.000Z",
    }),
    false,
  )
})

test("rechaza otra id u otro correo aunque el perfil figure aprobado", () => {
  assert.equal(
    isAuthorizedSistemaUser(identity, {
      ...authorizedProfile,
      id: "223e4567-e89b-42d3-a456-426614174000",
    }),
    false,
  )
  assert.equal(
    isAuthorizedSistemaUser(identity, {
      ...authorizedProfile,
      email: "otra@example.com",
    }),
    false,
  )
})
