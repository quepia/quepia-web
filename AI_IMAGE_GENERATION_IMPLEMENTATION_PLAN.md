# Plan de implementación — Generación de imágenes con IA en Quepia

**Fecha del relevamiento:** 19 de julio de 2026  
**Estado:** listo para implementar cuando estén disponibles las credenciales y el presupuesto  
**Proveedores objetivo:** OpenAI `gpt-image-2` y Google Nano Banana Pro `gemini-3-pro-image`

## 1. Objetivo

Incorporar generación y edición de imágenes dentro del Creative Studio de Quepia, manteniendo un único flujo de trabajo para dos proveedores:

- **OpenAI:** `gpt-image-2` mediante la Images API.
- **Google:** Nano Banana Pro, modelo estable `gemini-3-pro-image`, preferentemente mediante Vertex AI para reutilizar la infraestructura existente.

El usuario podrá partir de un brief, generar el Prompt Pack actual, elegir proveedor y parámetros visuales, adjuntar referencias, comparar variantes y guardar los resultados como assets privados del proyecto/tarea.

Este documento no implementa todavía las llamadas de generación. Su propósito es dejar definidas las decisiones, dependencias, migraciones, contratos, controles y pruebas necesarias para que la ejecución posterior sea previsible.

## 2. Alcance recomendado

### MVP

- Generación de imagen desde el prompt aprobado en Creative Studio.
- Edición o variación usando imágenes de referencia.
- Elección explícita de proveedor: OpenAI o Google.
- Controles normalizados de relación de aspecto, calidad/resolución y cantidad de variantes.
- Estimación de costo antes de enviar la solicitud.
- Persistencia de cada intento, incluidos fallos y consumo estimado.
- Guardado de resultados en el bucket privado `sistema-assets`.
- Creación del asset y su primera versión dentro del sistema actual.
- Galería de comparación, selección, descarga y regeneración.
- Feature flags independientes por proveedor.
- Autenticación, autorización, límites de uso, idempotencia y auditoría.

### Fuera del MVP

- Generación masiva mediante Batch/Flex.
- Fallback automático entre proveedores.
- Entrenamiento o fine-tuning de modelos.
- Publicación automática en redes, anuncios o entregables del cliente.
- Hacer públicos los archivos generados.
- Edición avanzada por máscaras dibujadas en un canvas.
- Cola distribuida desde el primer día; se agregará si las métricas muestran que la ruta síncrona no alcanza.

## 3. Estado actual de Quepia

El repositorio ya tiene casi toda la estructura de producto necesaria:

- `app/api/ai/creative-studio/route.ts`: autentica al usuario, carga brief/tarea/proyecto y genera direcciones creativas, prompts y revisiones.
- `components/sistema/quepia/creative-ai-studio-modal.tsx`: modal actual con referencias, selección de modelo objetivo, Prompt Pack, historial y revisión.
- `lib/ai/creative-studio-types.ts`: tipos compartidos del flujo creativo.
- `lib/ai/vertex.ts`: configuración de Vertex AI y modelo Gemini de texto.
- `app/api/ai/creative-studio/versions/route.ts`: persistencia de versiones de prompts.
- `lib/sistema/assets-storage.ts`, `lib/sistema/asset-upload.ts` y `lib/sistema/actions/assets.ts`: infraestructura de archivos y assets.
- Bucket privado existente: `sistema-assets`.
- Tablas existentes: `sistema_assets`, `sistema_asset_versions` y `sistema_creative_prompt_versions`.
- Dependencias instaladas: AI SDK 7 y `@ai-sdk/google-vertex` 5. No está instalado todavía el SDK de OpenAI.

La implementación debe extender este flujo, no crear un segundo estudio creativo ni duplicar el sistema de assets.

## 4. Decisiones de arquitectura

### 4.1 Adaptador neutral por proveedor

La UI y la ruta HTTP no deben depender de las respuestas nativas de OpenAI o Google. Se implementará una capa común con adaptadores separados:

```text
Creative Studio
      |
POST /api/ai/creative-studio/images
      |
ImageGenerationService
      |---------------- OpenAIImageProvider -> gpt-image-2
      |
      +---------------- GoogleImageProvider -> gemini-3-pro-image
      |
Persistencia + sistema-assets + auditoría de costos
```

Interfaz conceptual:

```ts
type ImageProviderId = "openai" | "google";

type GenerateImageRequest = {
  provider: ImageProviderId;
  prompt: string;
  taskId: string;
  promptVersionId?: string;
  aspectRatio: string;
  qualityPreset: "draft" | "standard" | "final";
  variantCount: number;
  referenceAssetIds: string[];
  inlineReferences?: Array<{
    mimeType: string;
    base64: string;
  }>;
  idempotencyKey: string;
};

type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: string;
  width?: number;
  height?: number;
  providerRequestId?: string;
  usage?: Record<string, number>;
  estimatedCostUsd: number;
  warnings: string[];
};
```

Las credenciales, respuestas base64 y archivos completos nunca se devolverán a logs ni se persistirán en JSONB.

### 4.2 Un resultado debe convertirse en un asset real

Cada imagen terminada se guardará en Storage y se registrará en las tablas actuales de assets. La nueva tabla de generaciones funcionará como auditoría técnica y financiera; no reemplazará `sistema_assets` ni `sistema_asset_versions`.

### 4.3 Un pedido por variante

Ambos proveedores pueden imponer límites por solicitud o modelo. El servicio generará una imagen por llamada y ejecutará las variantes con concurrencia acotada. Esto también permite registrar costos y fallos por variante.

### 4.4 Sin fallback automático

Si falla un proveedor, el sistema mostrará el error y permitirá reintentar o cambiar de proveedor. No se debe cobrar una generación en el segundo proveedor sin una acción explícita del usuario.

### 4.5 Flujo síncrono para el primer piloto

La ruta actual ya usa runtime Node y `maxDuration = 300`. El MVP puede mantener la conexión abierta, pero registrará el intento antes de llamar al proveedor. Si los percentiles reales de latencia o los timeouts lo justifican, se migrará a un job asíncrono sin cambiar el contrato de dominio.

## 5. Flujo de usuario propuesto

1. El usuario abre Creative Studio desde una tarea.
2. Genera o selecciona una dirección creativa y un Prompt Pack.
3. Pulsa **Generar imagen**.
4. Elige proveedor, preset de calidad, relación de aspecto y cantidad de variantes.
5. Reutiliza las referencias seleccionadas o agrega nuevas.
6. Ve una estimación de costo y confirma.
7. La UI muestra el estado de cada variante: preparando, generando, guardando, lista o fallida.
8. Compara resultados y marca uno como seleccionado.
9. El sistema muestra la imagen en el panel de assets de la tarea y mantiene todas las variantes guardadas como internas.
10. Puede solicitar revisión, regenerar o crear una nueva versión del asset elegido.

Recomendación de visibilidad: los resultados nacen como **internos/no aprobados**. No deben aparecer automáticamente en portales de clientes o entregables publicados.

## 6. Contrato HTTP del MVP

### `POST /api/ai/creative-studio/images`

Solicitud normalizada:

```json
{
  "source": { "type": "task", "id": "uuid" },
  "provider": "openai",
  "promptVersionId": "uuid",
  "prompt": "Prompt final aprobado",
  "aspectRatio": "4:5",
  "qualityPreset": "standard",
  "variantCount": 2,
  "referenceAssetIds": ["uuid"],
  "inlineReferences": [],
  "idempotencyKey": "uuid-generado-en-el-cliente"
}
```

Respuesta exitosa:

```json
{
  "generations": [
    {
      "id": "uuid",
      "status": "succeeded",
      "assetId": "uuid",
      "assetVersionId": "uuid",
      "signedUrl": "url-temporal",
      "provider": "openai",
      "model": "gpt-image-2",
      "estimatedCostUsd": 0.053,
      "warnings": []
    }
  ]
}
```

### Validaciones de entrada

- Usuario autenticado y con permiso de escritura sobre el proyecto.
- Tarea, proyecto, referencias y Prompt Pack deben pertenecer al mismo ámbito autorizado.
- `prompt`: longitud máxima configurable; rechazar vacío.
- `variantCount`: entre 1 y 3 en el MVP.
- Máximo 6 referencias en el MVP, aunque un proveedor soporte más.
- Tipos de referencia permitidos: PNG, JPEG y WebP; límite individual y total de bytes.
- Relaciones de aspecto permitidas mediante enum compartido.
- `idempotencyKey` obligatoria y única por usuario/tarea/operación.
- Proveedor habilitado por feature flag.
- Presupuesto y cuota disponibles antes de llamar al modelo.

Si se adopta ejecución asíncrona, se agregará `GET /api/ai/creative-studio/images/{generationId}` sin modificar el esquema persistido.

## 7. Implementación de OpenAI `gpt-image-2`

### 7.1 Prerrequisitos

- Crear o elegir un proyecto en OpenAI Platform.
- Activar facturación de API; la suscripción de ChatGPT no incluye créditos de API.
- Completar la verificación de la organización si la plataforma la solicita para acceder al modelo.
- Crear una API key de proyecto con el menor alcance posible.
- Guardar `OPENAI_API_KEY` únicamente como secreto de servidor en los entornos necesarios.
- Confirmar los límites de uso y rate limits reales de la organización antes del piloto.

No existe un proceso manual separado que haya que iniciar siempre: normalmente el acceso se habilita al configurar facturación y, cuando corresponde, completar la verificación desde la configuración de la organización.

### 7.2 Camino técnico

- Usar la **Images API** para el MVP, porque el caso es una generación/edición directa y permite seleccionar `gpt-image-2` explícitamente.
- Generación: endpoint de imágenes/generations.
- Edición con referencias: endpoint de imágenes/edits.
- Decodificar la salida base64 únicamente en el servidor y subir los bytes de inmediato a Storage.
- No transportar la imagen completa al navegador dentro de JSON; devolver la identidad del asset y una URL firmada.
- Guardar el request ID del proveedor cuando esté disponible.
- Implementar el adaptador con el SDK oficial `openai`, salvo que al comenzar la implementación se confirme que la versión vigente de `@ai-sdk/openai` ofrece la misma superficie de generación y edición sin perder controles.

### 7.3 Mapeo de presets

| Preset Quepia | Calidad OpenAI inicial | Uso recomendado |
|---|---:|---|
| `draft` | `low` | bocetos y exploración |
| `standard` | `medium` | iteración habitual |
| `final` | `high` | entrega o pieza final |

La API actual admite calidad `low`, `medium`, `high` y `auto`. El adaptador debe validar al momento de implementar qué dimensiones exactas acepta `gpt-image-2` para cada relación. Para `4:5`, usar dimensión nativa válida si está soportada; si no, generar la orientación más cercana y aplicar un recorte determinista en el servidor, registrando la transformación.

Consideraciones:

- `gpt-image-2` no ofrece fondo transparente; no mostrar esa opción para este proveedor.
- La fidelidad alta de referencias es automática según la documentación actual.
- No hay streaming de imagen para este modelo; la UI debe mostrar progreso por etapas, no progreso porcentual falso.
- El snapshot actual documentado es `gpt-image-2-2026-04-21`, pero en producción conviene comenzar con el alias estable y fijar un snapshot solo después de evaluar consistencia.

### 7.4 Costos de referencia

Precios públicos observados el 19/07/2026, sujetos a cambio:

| Salida | Low | Medium | High |
|---|---:|---:|---:|
| 1024×1024 | USD 0.006 | USD 0.053 | USD 0.211 |
| 1024×1536 o 1536×1024 | USD 0.005 | USD 0.041 | USD 0.165 |

Además se factura el input de texto e imagen. La estimación de Quepia debe separar `output`, `input estimado` y un margen pequeño; nunca prometer un costo exacto antes de la respuesta. Los precios se deben volver a verificar antes de implementar y antes de cada cambio de modelo.

## 8. Implementación de Google Nano Banana Pro

### 8.1 Modelo y proveedor

- Modelo estable: `gemini-3-pro-image`.
- Nombre de producto: Nano Banana Pro.
- Preferir **Vertex AI** porque Quepia ya tiene configuración y credenciales de Vertex.
- Ubicación esperada: `global`, sujeta a validación contra el proyecto productivo.
- Mantener `gemini-3.1-flash-image` como opción futura de borrador más veloz/económica, pero fuera del alcance obligatorio de esta integración.

No planificar una nueva integración con los modelos Imagen anteriores: Google comunicó su retiro para agosto de 2026. La ruta objetivo debe ser Gemini Image.

### 8.2 Prerrequisitos

- Confirmar que el proyecto de Google Cloud productivo es el correcto y tiene facturación activa.
- Habilitar Vertex AI API.
- Confirmar que la cuenta de servicio/runtime tiene permisos mínimos para invocar modelos de Vertex AI.
- Reutilizar Application Default Credentials o Workload Identity cuando sea posible.
- Si se usa un archivo de credenciales, almacenarlo únicamente como secreto de servidor; nunca versionarlo.
- Variables de servidor esperadas, según el despliegue:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_CLOUD_LOCATION=global`
  - credencial de workload o `GOOGLE_APPLICATION_CREDENTIALS`
- No agregar una key de Google AI Studio si Vertex ya cubre el caso. Solo elegir Gemini Developer API como alternativa consciente.

Argentina aparece actualmente entre las regiones disponibles para Gemini API, pero el acceso final debe probarse desde el proyecto y región efectivos de producción.

### 8.3 Camino técnico

Primera opción:

- Reutilizar `@ai-sdk/google-vertex` y exportar una factoría de modelo de imagen desde `lib/ai/vertex.ts`.
- Usar `generateImage` con `vertex.image("gemini-3-pro-image")`.
- Enviar `aspectRatio` en vez de `size`.
- Ejecutar una llamada por variante con concurrencia máxima configurable.

Spike obligatorio antes de cerrar el adaptador:

- Verificar con la versión vigente del proveedor cómo enviar `imageSize` 1K/2K/4K, referencias múltiples y opciones específicas del modelo.
- Si el adaptador de AI SDK no expone todas esas opciones, implementar solo este proveedor con el SDK oficial de Google Gen AI/Vertex, manteniendo la interfaz neutral de Quepia.
- No acoplar la UI a la librería elegida.

Capacidades actuales a contemplar:

- Salidas 1K, 2K y 4K; 4K figura todavía como capacidad en preview en documentación de Google Cloud y debe quedar detrás de una flag.
- Relaciones `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9` y `21:9`.
- Hasta 14 referencias según el producto, pero Quepia limitará inicialmente a 6 para controlar payload, UX y costo.
- Todas las imágenes generadas incluyen SynthID.
- Grounding con Google Search es opcional y debe permanecer deshabilitado en el MVP para evitar complejidad y cargos adicionales.

### 8.4 Mapeo de presets

| Preset Quepia | Resolución Google inicial | Uso recomendado |
|---|---:|---|
| `draft` | 1K | bocetos y exploración |
| `standard` | 2K | iteración y piezas habituales |
| `final` | 2K | final inicial; 4K solo bajo flag |

### 8.5 Costos de referencia

Precios públicos observados el 19/07/2026, sujetos a cambio:

| Salida Nano Banana Pro | Precio estándar aproximado |
|---|---:|
| 1K o 2K | USD 0.134 por imagen |
| 4K | USD 0.240 por imagen |
| Imagen de entrada | aproximadamente USD 0.0011 cada una |

Batch/Flex publica aproximadamente la mitad del precio estándar y puede evaluarse más adelante para trabajos masivos no interactivos.

## 9. Persistencia y migración de base de datos

Crear una migración nueva mediante la CLI de Supabase cuando comience la implementación; no editar migraciones ya aplicadas.

### Tabla recomendada: `sistema_ai_image_generations`

Campos propuestos:

| Campo | Tipo sugerido | Propósito |
|---|---|---|
| `id` | `uuid` | identificador de la variante |
| `project_id` | `uuid` | autorización y consultas |
| `task_id` | `uuid` | tarea de origen |
| `prompt_version_id` | `uuid null` | trazabilidad al Prompt Pack |
| `created_by` | `uuid` | usuario que confirmó el gasto |
| `provider` | `text check` | `openai` o `google` |
| `model_id` | `text` | modelo/snapshot efectivo |
| `status` | `text check` | `queued`, `processing`, `succeeded`, `failed`, `cancelled` |
| `idempotency_key` | `text` | evitar cargos duplicados |
| `request_hash` | `text` | detectar reenvíos equivalentes |
| `prompt` | `text` | prompt efectivo |
| `aspect_ratio` | `text` | relación solicitada |
| `requested_size` | `text null` | calidad/resolución solicitada |
| `variant_index` | `smallint` | posición dentro del lote |
| `reference_asset_ids` | `uuid[]` | referencias persistidas |
| `reference_count` | `smallint` | auditoría sin guardar bytes |
| `provider_request_id` | `text null` | soporte y trazabilidad |
| `asset_id` | `uuid null` | asset creado |
| `asset_version_id` | `uuid null` | versión creada |
| `output_mime_type` | `text null` | formato real |
| `output_width` / `output_height` | `integer null` | dimensiones finales |
| `input_units` / `output_units` | `numeric null` | consumo reportado |
| `estimated_cost_usd` | `numeric(12,6)` | costo previo |
| `actual_cost_usd` | `numeric(12,6) null` | costo calculado con usage real |
| `error_code` | `text null` | error normalizado |
| `error_message` | `text null` | mensaje sanitizado |
| `metadata` | `jsonb` | opciones no sensibles y warnings |
| timestamps | `timestamptz` | creación, inicio y finalización |

Restricciones e índices:

- Índice por `(task_id, created_at desc)`.
- Índice por `(project_id, created_at desc)`.
- Índice por `status` para limpieza/monitoreo.
- Unicidad de `(created_by, task_id, idempotency_key, variant_index)`.
- Claves foráneas con estrategia de borrado coherente con las tablas actuales.
- `metadata` no puede contener secretos, base64, URLs firmadas ni credenciales.

### RLS y grants

- Activar RLS desde la migración.
- Reutilizar los helpers de membresía/permisos de proyecto ya existentes.
- Permitir lectura solo a miembros autorizados del proyecto.
- Mantener inserciones y actualizaciones del estado en el servidor después de verificar al usuario.
- Si se usa `service_role`, recordar que omite RLS: la ruta debe resolver y validar el proyecto antes de cualquier escritura.
- Otorgar grants explícitos si la configuración actual de Data API no expone automáticamente tablas nuevas.
- Agregar pruebas de RLS para miembro, no miembro, usuario anónimo y cuenta desactivada.

## 10. Integración con Storage y assets

### Ruta de objeto propuesta

```text
{projectId}/{taskId}/ai/{generationId}/{variantIndex}.{ext}
```

Para previews opcionales:

```text
{projectId}/{taskId}/ai/{generationId}/preview/{variantIndex}.webp
```

Reglas:

- Reutilizar el bucket privado `sistema-assets`.
- Subir con la Storage API, nunca modificando directamente el esquema SQL interno de Storage.
- Guardar `storage_path`, no una URL firmada persistente.
- Generar URLs firmadas bajo demanda con expiración corta.
- No depender de `owner`/`owner_id` de Storage para la autorización de negocio. Si el upload usa `service_role`, la propiedad del objeto puede no representar al usuario; la trazabilidad debe quedar en `created_by`, el asset y la tabla de generaciones.
- Validar MIME por contenido cuando sea viable, no solo por extensión.
- Extraer dimensiones reales después de decodificar la respuesta.
- Crear thumbnails/previews en servidor para no descargar originales grandes en listados.

### Consistencia y compensación

Secuencia recomendada:

1. Insertar generación como `queued`.
2. Cambiar a `processing`.
3. Llamar al proveedor.
4. Validar y subir el archivo.
5. Crear `sistema_asset` y `sistema_asset_version`.
6. Actualizar generación a `succeeded` con referencias al asset.

Si falla la base después del upload, eliminar únicamente el objeto recién creado y registrar el fallo. Si falla el upload, no crear el asset. Un job de conciliación podrá buscar generaciones incompletas y objetos huérfanos si luego se adopta una cola.

## 11. Estructura de archivos prevista

```text
lib/ai/image-generation/
  types.ts
  validation.ts
  pricing.ts
  service.ts
  storage.ts
  errors.ts
  providers/
    openai.ts
    google.ts

app/api/ai/creative-studio/images/
  route.ts

components/sistema/quepia/
  creative-ai-studio-modal.tsx
  creative-image-generation-panel.tsx
  creative-image-gallery.tsx
```

Cambios adicionales esperados:

- Exportar en `lib/ai/vertex.ts` la factoría necesaria para modelos de imagen o mover la configuración común a un módulo reutilizable.
- Extender `lib/ai/creative-studio-types.ts` con opciones y resultados normalizados.
- Conectar resultados con el refresco/listado actual de assets.
- Crear una migración para `sistema_ai_image_generations`, sus RLS, grants e índices.
- Agregar tests unitarios, de ruta, RLS e integración.

No agregar `OPENAI_API_KEY`, credenciales de Google ni valores reales a archivos `.env` versionados.

## 12. Seguridad, privacidad y abuso

- Todas las llamadas a proveedores se realizan desde el servidor.
- Ninguna credencial usa prefijo `NEXT_PUBLIC_`.
- Autenticación mediante `supabase.auth.getUser()`, no confiar solo en datos de sesión del cliente.
- Validar permisos de escritura sobre el proyecto/tarea en cada solicitud.
- No aceptar URLs arbitrarias para referencias; resolver assets autorizados o recibir uploads con límites estrictos.
- Evitar SSRF, payloads gigantes y MIME engañosos.
- Aplicar rate limit por usuario, tarea, proyecto e IP cuando corresponda.
- Aplicar presupuesto mensual global y cuota diaria por usuario.
- Registrar prompt, modelo y costo en la tabla de auditoría; no escribir prompts ni imágenes completas en logs generales.
- Sanitizar mensajes del proveedor antes de devolverlos al cliente.
- No exponer request bodies, base64 o URLs firmadas en observabilidad.
- Documentar en la política interna que las imágenes de referencia se envían al proveedor elegido.
- OpenAI declara que los datos de API no se usan para entrenamiento por defecto; sus logs de monitoreo de abuso pueden conservarse por un plazo limitado salvo controles elegibles.
- Google declara actualmente que los datos del nivel pago no se usan para mejorar sus productos.
- No usar rostros, marcas o materiales de clientes sin la autorización y política interna correspondientes.

## 13. Control de costos y límites

Variables sugeridas:

```text
AI_IMAGE_GENERATION_ENABLED=false
AI_IMAGE_OPENAI_ENABLED=false
AI_IMAGE_GOOGLE_ENABLED=false
AI_IMAGE_MAX_VARIANTS=3
AI_IMAGE_MAX_REFERENCES=6
AI_IMAGE_CONCURRENCY=2
AI_IMAGE_DAILY_USER_LIMIT=20
AI_IMAGE_MONTHLY_BUDGET_USD=0
AI_IMAGE_GOOGLE_4K_ENABLED=false
```

Reglas:

- Feature flag general apagada por defecto al desplegar.
- Flags separadas para desactivar un proveedor sin afectar al otro.
- Mostrar costo estimado antes de confirmar.
- Reservar presupuesto estimado en la transacción lógica y ajustar con consumo real cuando exista.
- Rechazar antes de llamar al proveedor si el presupuesto o cuota están agotados.
- Nunca reintentar automáticamente un error funcional/política/credencial.
- Reintentar solo `429`, timeout o `5xx`, máximo dos veces, con backoff y respetando `Retry-After`.
- El mismo `idempotencyKey` debe devolver el resultado anterior o su estado; no generar un nuevo cargo.
- Alertar al 50 %, 80 % y 100 % del presupuesto mensual.
- Revalidar precios oficiales al implementar y mantenerlos en un módulo versionado, con fecha de vigencia.

## 14. Manejo normalizado de errores

| Error interno | Ejemplos | Acción de UI |
|---|---|---|
| `AUTH_REQUIRED` | sesión vencida | pedir reingreso |
| `FORBIDDEN` | no pertenece al proyecto | bloquear sin filtrar datos |
| `PROVIDER_DISABLED` | flag apagada | ocultar o deshabilitar proveedor |
| `BUDGET_EXCEEDED` | cuota agotada | informar límite sin llamar al modelo |
| `INVALID_REFERENCE` | archivo, tamaño o permiso inválido | señalar referencia |
| `CONTENT_REJECTED` | política del proveedor | permitir editar prompt/referencias |
| `RATE_LIMITED` | `429` | reintento controlado y espera visible |
| `PROVIDER_AUTH` | key, IAM o billing | error operativo, sin mostrar secretos |
| `PROVIDER_TIMEOUT` | timeout | reintentar con idempotencia |
| `NO_IMAGE_RETURNED` | respuesta sin parte de imagen | registrar y ofrecer reintento |
| `STORAGE_FAILED` | upload o DB | compensar y no mostrar asset incompleto |

## 15. Cambios de UI

Dentro del modal actual:

- Mantener intactas las etapas de contexto, direcciones, Prompt Pack y revisión.
- Agregar acción **Generar imagen** después del prompt final.
- Selector de proveedor con descripciones simples, no nombres internos del SDK.
- Presets de calidad comunes y explicación del resultado efectivo por proveedor.
- Selector de relación de aspecto con ejemplos de uso.
- Cantidad de variantes, máximo 3.
- Resumen de referencias y posibilidad de excluirlas de una generación.
- Estimación total de costo y confirmación explícita.
- Galería con estados independientes por variante.
- Acciones: ver, descargar, seleccionar, regenerar y crear versión.
- Etiquetas visibles del proveedor/modelo, resolución, fecha y autor.
- Advertencia de SynthID para Google y de ausencia de transparencia para OpenAI cuando corresponda.
- Estado de error recuperable sin perder el Prompt Pack ni las referencias seleccionadas.

La opción actual de **copiar prompt** debe seguir funcionando aunque todos los proveedores estén deshabilitados.

## 16. Fases de implementación

### Fase 0 — Credenciales y smoke tests

- Completar billing/verificación de OpenAI y crear key de proyecto.
- Confirmar proyecto, billing, API y permisos de Vertex AI.
- Guardar secretos en Preview/Production y mantener flags apagadas.
- Ejecutar una generación mínima por proveedor desde un script local no versionado.
- Registrar latencia, dimensiones, MIME, consumo y errores reales.
- Resolver el spike del SDK de Google para 2K/4K y referencias.
- Confirmar SDK elegido para OpenAI.

**Salida:** ambos proveedores generan una imagen desde el entorno de desarrollo sin exponer credenciales.

### Fase 1 — Dominio, base y feature flags

- Crear tipos, validación, errores normalizados y módulo de pricing.
- Crear migración de generaciones, índices, grants y RLS.
- Implementar idempotencia y cuotas.
- Implementar guardado/compensación con Storage y assets.
- Agregar flags apagadas por defecto.

**Salida:** infraestructura probada sin invocar modelos reales.

### Fase 2 — Adaptador Google

- Reutilizar configuración Vertex.
- Implementar texto, referencias, aspect ratio y resolución.
- Normalizar respuesta y usage.
- Probar 1K/2K y dejar 4K bajo flag.

**Salida:** Nano Banana Pro genera y guarda un asset completo.

### Fase 3 — Adaptador OpenAI

- Instalar el SDK seleccionado.
- Implementar generación y edición.
- Mapear presets y relaciones de aspecto.
- Normalizar respuesta, request ID y costos.

**Salida:** `gpt-image-2` genera y guarda un asset completo.

### Fase 4 — UI y flujo de versiones

- Crear panel de parámetros y estimación.
- Agregar estados de generación y galería.
- Conectar selección con assets/versiones.
- Integrar revisión/regeneración manteniendo el historial de prompts.

**Salida:** flujo completo usable desde una tarea.

### Fase 5 — Hardening y observabilidad

- Rate limits, cuotas, alertas y métricas.
- Pruebas de seguridad/RLS.
- Limpieza y conciliación de estados incompletos.
- Dashboards de éxito, latencia y costo.
- Pruebas de regresión del Creative Studio existente.

**Salida:** release candidate apto para piloto.

### Fase 6 — Piloto y rollout

- Habilitar solo para usuarios internos seleccionados.
- Empezar con una variante y límites bajos.
- Evaluar 10–20 briefs reales de Quepia.
- Ajustar defaults y prompts a partir de calidad, latencia y costo.
- Activar un proveedor a la vez en producción y luego ambos.

**Salida:** disponibilidad gradual con presupuesto controlado.

## 17. Plan de pruebas

### Unitarias

- Mapeo de presets por proveedor.
- Validación de aspect ratio, referencias, MIME y límites.
- Cálculo/versión de precios.
- Hash e idempotencia.
- Normalización de errores.
- Cálculo de rutas de Storage sin traversal.

### Contrato de proveedores

- Respuesta válida con imagen.
- Respuesta sin imagen.
- Error de contenido, credencial, cuota, `429`, timeout y `5xx`.
- Referencias múltiples.
- Dimensiones y MIME inesperados.
- Mockear en CI; no gastar crédito en cada build.

### Base, RLS y Storage

- Miembro con permiso puede generar y leer.
- Miembro solo lectura no puede generar.
- Usuario externo no puede inferir ni leer generaciones.
- URLs firmadas expiran.
- Fallo de DB posterior al upload elimina el objeto recién creado.
- Reenvío con la misma idempotency key no duplica asset ni gasto.

### Ruta y UI

- Sesión vencida, provider flag apagada y presupuesto agotado.
- Estados parciales cuando una variante falla y otra termina.
- El modal conserva prompt y referencias tras un fallo.
- El asset aparece en la tarea y puede descargarse.
- El flujo anterior de copiar prompt y versionar sigue funcionando.

### Evaluación visual

Crear un set interno de 10 briefs representativos y puntuar cada proveedor en:

- fidelidad al brief;
- consistencia de marca;
- composición y formato;
- calidad de texto dentro de la imagen;
- fidelidad a referencias/productos/personas;
- facilidad de edición;
- latencia;
- costo por resultado publicable.

### Verificaciones del repositorio

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- tests unitarios/integración del runner elegido
- smoke test manual por proveedor con presupuesto limitado

## 18. Observabilidad

Métricas mínimas por proveedor/modelo:

- solicitudes, éxitos y fallos;
- éxito por variante;
- latencia p50/p95;
- reintentos y `429`;
- costo estimado y real por usuario/proyecto/tarea;
- imágenes generadas vs. imágenes seleccionadas;
- fallos de Storage/DB;
- generaciones atascadas en `queued` o `processing`.

Logs estructurados únicamente con IDs internos, provider/model, estado, duración, request ID y código de error sanitizado.

## 19. Criterios de aceptación

- Los dos proveedores pueden habilitarse o apagarse independientemente.
- Ninguna key o credencial aparece en el bundle cliente, respuestas HTTP o logs.
- Un usuario sin permiso no puede generar, consultar ni descargar resultados.
- Cada variante queda auditada incluso si falla.
- Cada resultado exitoso crea un archivo privado, asset y versión navegables desde la tarea.
- Las relaciones de aspecto y presets se traducen correctamente por proveedor.
- La estimación de costo aparece antes de confirmar y el consumo queda registrado.
- La idempotencia evita duplicados y cargos repetidos por reenvíos.
- Los fallos de Storage/DB no dejan assets visibles incompletos.
- Se respetan límites diarios, mensuales, de variantes y referencias.
- El Creative Studio actual conserva su flujo de Prompt Pack, historial, revisión y copia de prompt.
- Lint, TypeScript, build, RLS tests y smoke tests pasan.

## 20. Rollback

- Apagar `AI_IMAGE_GENERATION_ENABLED` para ocultar toda la función.
- Apagar solo el proveedor afectado con su flag independiente.
- No eliminar la tabla ni los assets durante un rollback operativo.
- Mantener las filas históricas para auditoría y costos.
- Si una versión de modelo degrada resultados, volver al alias/snapshot previamente evaluado desde configuración, sin migración de UI.

## 21. Checklist de preparación

### OpenAI

- [ ] Proyecto de API creado.
- [ ] Facturación activa.
- [ ] Organización verificada si la consola lo exige.
- [ ] API key de proyecto creada y guardada como secreto.
- [ ] Límite de gasto configurado.
- [ ] Acceso real a `gpt-image-2` probado.

### Google

- [ ] Proyecto productivo confirmado.
- [ ] Facturación activa.
- [ ] Vertex AI API habilitada.
- [ ] IAM mínimo confirmado.
- [ ] Credenciales server-side disponibles en cada entorno.
- [ ] Acceso real a `gemini-3-pro-image` probado en `global`.
- [ ] Control 1K/2K/4K validado con el SDK elegido.

### Quepia

- [ ] Presupuesto mensual y cuota diaria definidos.
- [ ] Política de retención/uso de referencias aprobada.
- [ ] Decisión sobre conservar todas las variantes o solo las seleccionadas.
- [ ] Decisión sobre visibilidad interna/cliente confirmada.
- [ ] Set de evaluación visual preparado.
- [ ] Entorno Preview listo para el piloto.

## 22. Checklist ejecutable de implementación

- [ ] Actualizar las dependencias AI SDK dentro de sus versiones compatibles.
- [ ] Instalar el SDK de OpenAI elegido.
- [ ] Implementar tipos y validaciones neutrales.
- [ ] Implementar pricing versionado y estimación.
- [ ] Crear migración de `sistema_ai_image_generations`.
- [ ] Crear RLS, grants e índices.
- [ ] Implementar rate limits, cuotas e idempotencia.
- [ ] Implementar subida privada y compensación de Storage.
- [ ] Implementar creación de asset/version.
- [ ] Implementar adaptador Google y su spike de opciones avanzadas.
- [ ] Implementar adaptador OpenAI.
- [ ] Crear la ruta server-side.
- [ ] Agregar panel de configuración y estimación.
- [ ] Agregar galería, estados y acciones.
- [ ] Conectar resultados al listado de assets.
- [ ] Agregar pruebas unitarias, de contrato, ruta, RLS y UI.
- [ ] Ejecutar evaluación visual y ajustar defaults.
- [ ] Configurar observabilidad y alertas de presupuesto.
- [ ] Desplegar con flags apagadas.
- [ ] Habilitar piloto interno de forma gradual.

## 23. Decisiones que quedan abiertas

Estas decisiones no bloquean el diseño y deben resolverse en Fase 0:

1. **SDK de OpenAI:** SDK oficial versus `@ai-sdk/openai`, eligiendo la opción que preserve todos los controles de Images API.
2. **SDK de Google:** AI SDK Vertex versus SDK oficial de Google si 2K/4K o referencias no quedan expuestos correctamente.
3. **Retención:** guardar todas las variantes, recomendado para auditoría inicial, o borrar las no seleccionadas después de un plazo.
4. **Preset final Google:** 2K por defecto o permitir 4K bajo permiso especial.
5. **Presupuesto:** monto mensual, cuota diaria por usuario y quién puede excederla.
6. **Asincronía:** migrar a jobs cuando la latencia/volumen medidos lo justifiquen.

## 24. Fuentes oficiales consultadas

### OpenAI

- Modelo `gpt-image-2`: <https://developers.openai.com/api/docs/models/gpt-image-2>
- Guía de generación de imágenes: <https://developers.openai.com/api/docs/guides/image-generation>
- Precios de API: <https://developers.openai.com/api/docs/pricing>
- Verificación de organización: <https://help.openai.com/en/articles/10910291>
- Diferencia entre facturación de ChatGPT y API: <https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api>
- Controles y uso de datos de API: <https://platform.openai.com/docs/models/default-usage-policies-by-endpoint>

### Google

- Modelo `gemini-3-pro-image`: <https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image>
- Guía de generación de imágenes: <https://ai.google.dev/gemini-api/docs/image-generation>
- Precios de Gemini API: <https://ai.google.dev/gemini-api/docs/pricing>
- Regiones disponibles: <https://ai.google.dev/gemini-api/docs/available-regions>
- Estado del modelo en Google Cloud: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image>

### Supabase

- Control de acceso en Storage: <https://supabase.com/docs/guides/storage/security/access-control>
- Buckets públicos y privados: <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- Propiedad de objetos: <https://supabase.com/docs/guides/storage/security/ownership>
- Diseño del esquema de Storage: <https://supabase.com/docs/guides/storage/schema/design>

---

**Recomendación final:** implementar primero la base neutral y el adaptador Google, porque Quepia ya usa Vertex AI; incorporar OpenAI inmediatamente después de obtener la key y completar facturación/verificación. Mantener ambos detrás de flags y habilitar el piloto con límites bajos, una variante por solicitud y almacenamiento privado.
