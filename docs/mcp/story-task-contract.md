# Historias desde tareas MCP

Las herramientas `tasks_create_task`, `tasks_create_tasks_batch` y `tasks_update_task` aceptan `story`. Se guarda en `sistema_tasks.type_metadata.story`, el mismo objeto que lee Editar historia y el generador. El título de la tarjeta es interno; `social_copy` es el caption, no el texto de la imagen.

Antes de planificar historias, leer `intelligence_get_project_context`: brief, estrategia aprobada y banco de fotos. Escribir copy terminado, no instrucciones como “agregar un titular”. Conservar textos exactos del usuario y no inventar precios, promociones, horarios ni contactos.

Ejemplo de una tarjeta dentro de `tasks_create_tasks_batch`:

```json
{
  "title": "Historia · escapada de fin de semana",
  "description": "Invitar a consultar por una escapada. Foto del paisaje real, sin precios ni descuentos.",
  "story": {
    "request": "Destacar el paisaje del camping con una composición legible en celular.",
    "headline": "Tu próxima escapada empieza acá",
    "kicker": "FIN DE SEMANA",
    "supportingText": "Naturaleza para disfrutar a tu ritmo",
    "cta": "Consultanos por disponibilidad",
    "rules": "No inventar promociones ni servicios.",
    "format": "story",
    "backgroundSource": "bank",
    "includeLogo": true
  }
}
```

Verificar las afirmaciones del ejemplo contra el brief real. Los IDs de proyecto y columna se resuelven con las herramientas de lectura. `referenceAssetIds` y `referenceDriveFileIds` son opcionales (hasta cuatro); usar únicamente IDs reales del contexto. `backgroundSource: "bank"` conserva una foto original; `"ai"` permite generar el fondo.

Límites: `headline` 120 caracteres, `cta` 70, `kicker` 60, `supportingText` 180, `request` 4000 y `rules` 3000. Formatos: `story`, `portrait`, `square`.

Las actualizaciones hacen un patch: omitir campos conserva su valor y enviar una cadena vacía borra el texto guardado. Se invalida el prompt preparado. La anulación restaura los atributos anteriores y conserva la protección existente contra cambios posteriores de otra persona. Las respuestas de creación y detalle devuelven `story`.

Compatibilidad: descripciones existentes con `Texto exacto:`, `Titular exacto:`, `CTA:`, `Etiqueta:`, `Texto secundario:` y `Restricciones:` rellenan los campos sin otra llamada a IA. Los valores ya guardados en el editor tienen prioridad. Una narración libre o un bloque que excede el límite se deja para Preparar con IA.

No se requiere instalar una skill: la guía está incluida en las herramientas MCP. Para habilitarlo en producción, aplicar `20261006152837_mcp_story_task_contract.sql` y desplegar tanto la web como `services/mcp`; renovar la lista de herramientas del cliente MCP para ver el nuevo esquema.
