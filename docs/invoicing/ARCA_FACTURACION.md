# Facturación electrónica ARCA

Emite la **Factura C** (Quepia es monotributista) de un cobro ya registrado,
desde el panel de Contabilidad → Cobros o pidiéndoselo al MCP. Usa el SDK
[`facturas`](https://facturas-sdk.dev), fijado en `0.20.0` porque su API cambia
entre versiones menores: antes de actualizar, leé el
[changelog](https://github.com/LaPyme/facturas/blob/main/packages/arca/CHANGELOG.md).

## Cómo funciona

- La clave privada de ARCA vive **solo en el servidor web** (variables `ARCA_*`).
  El servicio MCP no la conoce: su tool `accounting_issue_invoice` llama a
  `POST /api/invoicing/mcp` reenviando el token OAuth del usuario.
- Toda la autorización está en Postgres (`accounting_invoice_begin`,
  `accounting_invoice_complete`, `accounting_invoice_store`): sesión web de un
  admin, o token MCP de un admin con la capacidad `accounting.invoice.write`.
- Cada cobro tiene como máximo un comprobante vivo por entorno
  (`public.accounting_invoices`). El importe sale siempre del cobro. Por
  defecto la fecha es hoy (Buenos Aires) y el servicio facturado es el mes del
  cobro.
- `private.arca_store` guarda las reservas de numeración y el ticket WSAA
  cifrado. **Nunca borres filas de esa tabla**: un reintento las consulta para
  no emitir dos veces.
- Resultados:
  - `authorized`: se guardan número, CAE, vencimiento y URL del QR. En
    producción también se completa `invoice_number` del cobro (`C 00003-00000042`).
  - `rejected`: ARCA explicó por qué; el cobro queda libre para emitir de nuevo.
  - `indeterminate` o `pending`: no se sabe si ARCA emitió. Reintentar usa el
    mismo número reservado y nunca duplica.
  - `conflict`: hay otro comprobante en ese número. Revisalo en ARCA antes de
    seguir.
- Un cobro con comprobantes de producción no se puede borrar ni anular por MCP.

## Notas de crédito

ARCA no anula comprobantes: una factura se corrige con una nota de crédito,
que también es un documento fiscal. Desde Pagos, el número de la factura abre
su diálogo con el botón **Nota de crédito** (o desde Claude con
`accounting_issue_credit_note`):

- **Total**: acredita la factura entera. La factura pasa a `credited` (anulada),
  en producción se limpia el número del cobro y el cobro puede facturarse de
  nuevo con los datos corregidos.
- **Parcial**: acredita un importe. Postgres controla, con la factura
  bloqueada, que la suma de las notas nunca supere el total; cuando la
  alcanza, la factura también queda anulada.
- Una nota se emite contra una factura del mismo entorno (prueba o producción)
  y hereda de ella el receptor y el período, como exige ARCA.
- Cada nota tiene su PDF (Nota de Crédito C, código 013, con el comprobante
  asociado) en `/sistema/notas-de-credito/<id>`.

Tabla `public.accounting_credit_notes`; RPC `accounting_credit_note_begin` y
`accounting_credit_note_complete`, con la misma autorización web/MCP.

Solo cobros **pagados en ARS**. USD (factura E de exportación) queda para una
próxima etapa.

## Configuración (Contabilidad → Facturación)

Todo se configura desde la pestaña **Facturación** de Contabilidad, que trae
la guía paso a paso y las recomendaciones:

1. **Datos del emisor**: CUIT, condición (monotributo, exento o no alcanzado),
   razón social, domicilio, Ingresos Brutos e inicio de actividades.
2. **Credenciales por entorno** (homologación y producción por separado): el
   sistema genera la clave privada en el servidor y muestra el pedido de
   certificado (CSR) para pegar en ARCA; después se pega el certificado y se
   verifica que corresponda a la clave, al CUIT y que no esté vencido. También
   se puede importar una clave y un certificado existentes.
3. **Autorizaciones** en ARCA (wsfe y, recomendado, la constancia de
   inscripción) y **punto de venta** Web Services, con **Probar conexión**, que
   lista los puntos de venta habilitados.
4. **Entorno activo**: producción solo se activa con sus credenciales completas.

### Seguridad

- `private.invoicing_settings` y `private.invoicing_credentials` no están
  expuestas: se leen y escriben solo por `invoicing_settings_get` /
  `invoicing_settings_save`. Leer exige ser admin (web o MCP con
  `accounting.invoice.write`); escribir, una sesión web directa de admin.
- La clave privada se cifra en el servidor con AES-256-GCM
  (`lib/invoicing/secret-box.ts`) usando `INVOICING_ENCRYPTION_KEY`, que existe
  solo en el servidor. El contexto del cifrado es el entorno: la clave de
  homologación no descifra como producción. La base solo guarda el texto
  cifrado y la clave nunca vuelve al navegador.
- Guardá una copia de `INVOICING_ENCRYPTION_KEY` en un gestor de contraseñas.
  Si se pierde, hay que generar certificados nuevos (las facturas emitidas no
  se afectan).

Variables del proyecto web:

| Variable | Para qué |
| --- | --- |
| `INVOICING_ENCRYPTION_KEY` | Clave maestra, `openssl rand -base64 32`. Obligatoria |
| `MCP_RESOURCE_URI` | El mismo valor que en el servicio MCP, para emitir desde Claude |

Las variables `ARCA_*` siguen funcionando como alternativa: si el entorno
activo de la pantalla no está completo, se usan ellas. La pantalla ofrece
**Importar configuración actual** para pasarlas a la base y después quitarlas.

En el servicio MCP subí `MCP_REQUEST_TIMEOUT_MS` a `60000`.

ARCA rechaza un login nuevo mientras hay un ticket WSAA vigente
(`coe.alreadyAuthenticated`, hasta 12 horas): no uses el mismo certificado en
el CLI `npx facturas` y en el sistema.

## Pasar a producción

1. En Facturación → Producción: generar clave y pedido, pedir el certificado en
   *Administración de Certificados Digitales*, pegarlo.
2. *Administrador de Relaciones*: el certificado con *Facturación Electrónica*.
3. Punto de venta nuevo *Factura Electrónica – Monotributo – Web Services*
   (distinto del de Comprobantes en línea) y **Probar conexión**.
4. Activar producción. La primera factura real es un documento fiscal: si es
   una prueba, se corrige con nota de crédito.

## Tests

```bash
pnpm invoicing:test
```

Ejecuta la migración real sobre PGlite y prueba autorización web/MCP,
reanudación, rechazo, store, bloqueos y la protección de cobros facturados.
