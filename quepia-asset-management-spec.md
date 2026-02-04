# Sistema de Gestión de Assets para Clientes

## Quepia Consultora - Especificación Funcional

---

## Resumen Ejecutivo

Este documento describe las funcionalidades necesarias para implementar un sistema de gestión de assets (imágenes y videos) dentro del dashboard de Quepia. El objetivo principal es **eliminar la fricción** de tener que subir archivos a múltiples plataformas externas, centralizando todo el flujo de entrega y aprobación en un solo lugar.

**Prioridad máxima**: El cliente debe poder previsualizar y descargar los archivos de forma simple, sin pérdida de calidad y sin necesidad de crear cuentas o instalar aplicaciones.

---

## 1. Gestión de Archivos

### 1.1 Subida de Assets (Admin)

El administrador podrá subir archivos directamente desde las tarjetas del Kanban, sin necesidad de usar servicios externos.

**Características:**

- Drag & drop de archivos directamente en la tarjeta de tarea
- Subida múltiple (varios archivos a la vez)
- Barra de progreso visible durante la carga
- Formatos soportados:
  - Imágenes: JPG, PNG, WEBP, GIF
  - Videos: MP4, MOV, WEBM
- Límite de tamaño: 100MB por archivo (configurable)

**Organización interna:**

Los archivos se organizarán automáticamente en carpetas por cliente y tarea:

```
/assets
  /cliente-abc
    /tarea-123
      /post-instagram-final.jpg
      /reel-promocion.mp4
    /tarea-456
      /...
  /cliente-xyz
    /...
```

### 1.2 Preservación de Calidad

**Requisito crítico**: Los archivos deben mantener su calidad original sin ningún tipo de compresión o modificación.

- El archivo original se almacena tal cual fue subido
- No se aplica compresión ni redimensionamiento al archivo fuente
- Los thumbnails y previews se generan como archivos separados, nunca reemplazando el original
- Al descargar, el cliente recibe exactamente el archivo original

### 1.3 Thumbnails Automáticos

Para mejorar la experiencia de navegación sin afectar los archivos originales:

**Para imágenes:**
- Thumbnail pequeño (200px) para listados
- Preview mediano (800px) para visualización rápida
- Ambos en formato WebP para carga rápida

**Para videos:**
- Thumbnail extraído del frame al 25% del video
- Preview en calidad reducida para previsualización rápida (opcional)
- El video original permanece intacto

**Importante**: Los thumbnails son solo para navegación. El botón de descarga siempre entrega el archivo original en máxima calidad.

---

## 2. URLs Temporales y Seguridad

### 2.1 Sistema de URLs Firmadas

Los archivos no serán públicos. Se utilizarán URLs temporales firmadas que:

- Expiran automáticamente después de un período definido (recomendado: 24-48 horas)
- Se renuevan automáticamente cuando el cliente accede a la vista de assets
- Impiden el acceso no autorizado a los archivos
- Permiten compartir links específicos por tiempo limitado si es necesario

### 2.2 Flujo de Acceso

1. El cliente recibe notificación de nuevos assets disponibles
2. Accede a su portal con sus credenciales
3. El sistema genera URLs firmadas válidas para esa sesión
4. Las URLs se renuevan automáticamente mientras navega
5. Si un link expira (ej: guardado en marcadores), se regenera al volver a acceder

### 2.3 Consideraciones de Seguridad

- Los archivos nunca son accesibles públicamente sin autenticación
- Cada cliente solo puede ver los assets de sus propias tareas
- Se registra un log de accesos y descargas
- Opción de revocar acceso a assets específicos si es necesario

---

## 3. Experiencia del Cliente

### 3.1 Vista de Assets

El cliente accede a una interfaz limpia y simple donde puede:

- Ver todos los assets de una tarea en formato galería
- Previsualizar imágenes a pantalla completa
- Reproducir videos directamente en el navegador
- Navegar entre assets con flechas o swipe (móvil)

**Diseño de la interfaz:**

```
┌─────────────────────────────────────────────────────┐
│  Tarea: Post Instagram - Promoción Febrero          │
│  Estado: Pendiente de aprobación                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │         │  │         │  │  ▶      │            │
│  │  img1   │  │  img2   │  │  video  │            │
│  │         │  │         │  │         │            │
│  └─────────┘  └─────────┘  └─────────┘            │
│   Pendiente    Aprobado    Cambios                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [ ⬇ Descargar todos ]  [ ✓ Aprobar todos ]        │
└─────────────────────────────────────────────────────┘
```

### 3.2 Descarga de Archivos

**Prioridad máxima**: La descarga debe ser simple y entregar el archivo en calidad original.

**Opciones de descarga:**

1. **Descarga individual**: Click en el asset → botón "Descargar" prominente
2. **Descarga múltiple**: Seleccionar varios assets → "Descargar seleccionados"
3. **Descarga total**: Botón "Descargar todos" genera un ZIP con todos los assets de la tarea

**Especificaciones técnicas:**

- La descarga inicia inmediatamente (no requiere confirmaciones adicionales)
- El nombre del archivo es descriptivo (ej: `quepia-post-instagram-febrero-01.jpg`)
- Para descargas múltiples, el ZIP se genera en el servidor y se descarga directo
- No se requiere que el cliente tenga cuenta en ningún servicio externo
- Funciona correctamente en móviles (descarga directa al dispositivo)

### 3.3 Previsualización

**Imágenes:**
- Zoom con pinch (móvil) o scroll (desktop)
- Navegación entre imágenes con gestos o teclado
- Información del archivo visible (nombre, dimensiones, tamaño)

**Videos:**
- Reproductor nativo del navegador
- Controles de play/pause, volumen, pantalla completa
- Barra de progreso para navegar el video
- Sin marcas de agua ni overlays

---

## 4. Sistema de Revisión y Aprobación

### 4.1 Estados de un Asset

Cada asset tiene un estado que indica su situación en el proceso de revisión:

| Estado | Descripción | Color |
|--------|-------------|-------|
| **Pendiente** | Recién subido, esperando revisión del cliente | Amarillo |
| **Aprobado** | Cliente confirmó que está listo para publicar | Verde |
| **Cambios solicitados** | Cliente pidió modificaciones | Rojo |

### 4.2 Flujo de Aprobación

```
    ┌──────────────┐
    │   Subido     │
    │  (Admin)     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  Pendiente   │◄─────────────────┐
    │              │                  │
    └──────┬───────┘                  │
           │                          │
     Cliente revisa                   │
           │                          │
     ┌─────┴─────┐                    │
     ▼           ▼                    │
┌─────────┐ ┌─────────────┐          │
│Aprobado │ │  Cambios    │          │
│    ✓    │ │ solicitados │          │
└─────────┘ └──────┬──────┘          │
                   │                  │
            Admin corrige             │
                   │                  │
                   └──────────────────┘
```

### 4.3 Comentarios y Anotaciones

El cliente puede agregar feedback específico a cada asset:

**Comentarios de texto:**
- Campo de texto para escribir observaciones
- Historial de comentarios visible para ambas partes
- Timestamp y autor de cada comentario

**Anotaciones visuales (opcional, fase futura):**
- Marcar áreas específicas de la imagen
- Dibujar sobre el asset para señalar cambios
- Las anotaciones se guardan como capa separada

### 4.4 Notificaciones

**Al cliente:**
- Cuando hay nuevos assets disponibles para revisar
- Cuando se actualizó un asset que había solicitado cambios

**Al administrador:**
- Cuando el cliente aprueba un asset
- Cuando el cliente solicita cambios (con el comentario incluido)
- Resumen diario de assets pendientes de revisión

---

## 5. Copy y Texto para Publicación

### 5.1 Concepto

El cliente no solo necesita el asset visual, sino también el texto que lo acompaña (caption, hashtags, copy). Esta información ya existe en las tarjetas del Kanban, por lo que el sistema debe vincularla directamente con los assets para que el cliente tenga **todo listo para publicar** en un solo lugar.

### 5.2 Información Vinculada

Cada asset o grupo de assets de una tarea tendrá asociado:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Copy principal** | Texto para el caption de la publicación | "Descubrí nuestra nueva colección de verano 🌴" |
| **Hashtags** | Etiquetas relevantes para la publicación | #moda #verano2026 #tendencias |
| **CTA (Call to Action)** | Llamada a la acción si aplica | "Link en bio 🔗" |
| **Notas internas** | Instrucciones que NO van en la publicación | "Publicar el martes a las 18hs" |
| **Plataforma destino** | Para qué red social está pensado | Instagram Feed, Stories, TikTok, etc. |

### 5.3 Vista del Cliente

Al visualizar un asset, el cliente verá el copy asociado de forma prominente:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    [IMAGEN / VIDEO]                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📝 Copy para publicación                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Descubrí nuestra nueva colección de verano 🌴          │ │
│  │ Prendas frescas y cómodas para disfrutar el calor.     │ │
│  │                                                        │ │
│  │ 👉 Encontralas en nuestra tienda online               │ │
│  │                                                        │ │
│  │ #moda #verano2026 #tendencias #ropademujer            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                          [ 📋 Copiar copy ] │
│                                                             │
│  📱 Plataforma: Instagram Feed                              │
│  📅 Sugerido: Martes 18:00hs                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [ ⬇ Descargar asset ]    [ ✓ Aprobar ]    [ 💬 Comentar ] │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Funcionalidad de Copiado

**Botón "Copiar copy":**
- Un click copia todo el texto formateado al portapapeles
- Incluye el copy principal + hashtags listos para pegar
- Confirmación visual de que se copió correctamente
- Funciona en móvil y desktop

**Opciones de copiado:**
- Copiar todo (copy + hashtags)
- Copiar solo el copy (sin hashtags)
- Copiar solo hashtags

### 5.5 Flujo Completo del Cliente

Con esta funcionalidad, el cliente puede hacer todo desde un solo lugar:

```
1. Recibe notificación de assets listos
           │
           ▼
2. Accede a la vista del asset
           │
           ▼
3. Previsualiza imagen/video
           │
           ▼
4. Lee el copy sugerido
           │
           ▼
5. Si necesita cambios → Comenta
   Si está OK → Aprueba
           │
           ▼
6. Descarga el asset (calidad original)
           │
           ▼
7. Copia el copy con un click
           │
           ▼
8. Pega en Instagram/TikTok/etc → ¡Listo!
```

### 5.6 Múltiples Variantes de Copy

Para casos donde se necesitan diferentes versiones del copy (ej: versión corta para Stories, versión larga para Feed):

- El admin puede agregar múltiples variantes de copy a una misma tarea
- Cada variante tiene su etiqueta (Feed, Stories, TikTok, etc.)
- El cliente ve todas las opciones y copia la que necesita

```
┌────────────────────────────────────────┐
│  📝 Versiones del copy                 │
├────────────────────────────────────────┤
│  ▸ Instagram Feed          [Copiar]   │
│  ▸ Instagram Stories       [Copiar]   │
│  ▸ TikTok                  [Copiar]   │
└────────────────────────────────────────┘
```

### 5.7 Exportación Completa

**Opción "Descargar todo listo para publicar":**

Genera un paquete que incluye:
- El asset en calidad original
- Un archivo de texto (.txt) con el copy y hashtags
- Información de la plataforma destino

Esto permite al cliente tener un backup local con todo organizado, especialmente útil si maneja las publicaciones desde el celular.

---

## 6. Integración con el Kanban

### 6.1 Visualización en Tarjetas

Las tarjetas del Kanban mostrarán un resumen del estado de los assets:

```
┌─────────────────────────────────┐
│  Post Instagram Febrero         │
│  Cliente: Restaurante XYZ       │
├─────────────────────────────────┤
│  📎 Assets: 3                   │
│  ✓ 1 aprobado                   │
│  ⏳ 1 pendiente                  │
│  ⚠ 1 con cambios                │
├─────────────────────────────────┤
│  [Ver assets]                   │
└─────────────────────────────────┘
```

### 6.2 Indicadores de Estado

- Badge en la tarjeta indicando si hay assets pendientes de revisión
- Indicador visual cuando el cliente deja un comentario
- Filtro en el Kanban para ver solo tareas con assets pendientes

### 6.3 Acciones Rápidas

Desde la tarjeta del Kanban:
- Ver miniatura de los últimos assets subidos
- Acceder directamente al panel de assets de esa tarea
- Ver el último comentario del cliente sin entrar al detalle

---

## 7. Especificaciones Técnicas

### 7.1 Almacenamiento

- **Servicio**: Supabase Storage
- **Bucket**: Privado, acceso solo mediante URLs firmadas
- **Estructura**: `/{client_id}/{task_id}/{filename}`
- **Retención**: Los archivos se mantienen por 90 días después de completada la tarea (configurable)

### 7.2 Límites y Restricciones

| Parámetro | Valor |
|-----------|-------|
| Tamaño máximo por archivo | 100 MB |
| Archivos por tarea | Sin límite |
| Formatos de imagen | JPG, PNG, WEBP, GIF |
| Formatos de video | MP4, MOV, WEBM |
| Duración de URL firmada | 24-48 horas |
| Tiempo de expiración del ZIP | 1 hora |

### 7.3 Rendimiento

- Los thumbnails se generan de forma asíncrona tras la subida
- Las previsualizaciones cargan de forma progresiva
- Los videos se sirven con streaming (no requieren descarga completa para reproducir)
- El ZIP se genera bajo demanda y se cachea temporalmente

---

## 8. Resumen de Beneficios

### Para el Administrador (Quepia)

- ✅ Subir assets una sola vez, directo desde el Kanban
- ✅ Eliminar dependencia de servicios externos
- ✅ Tracking claro del estado de aprobación
- ✅ Historial de comentarios y cambios centralizado
- ✅ Notificaciones automáticas de feedback del cliente
- ✅ Copy y assets vinculados en un solo lugar

### Para el Cliente

- ✅ Previsualizar sin descargar
- ✅ Descargar en calidad original con un solo click
- ✅ Copiar el copy listo para publicar con un click
- ✅ Todo en un solo lugar: asset + copy + hashtags
- ✅ Proceso de aprobación simple y claro
- ✅ Comentar directamente sobre los assets
- ✅ Acceso desde cualquier dispositivo, sin apps adicionales

---

## 9. Fases de Implementación

### Fase 1: MVP (Prioridad Alta)
- [ ] Subida de archivos desde tarjetas del Kanban
- [ ] URLs firmadas temporales
- [ ] Previsualización básica (imágenes y videos)
- [ ] Descarga individual en calidad original
- [ ] Estados básicos (pendiente/aprobado)
- [ ] Vinculación de copy existente con assets

### Fase 2: Mejoras de UX
- [ ] Thumbnails automáticos
- [ ] Descarga múltiple (ZIP)
- [ ] Sistema de comentarios
- [ ] Notificaciones por email
- [ ] Botón "Copiar copy" con opciones (todo, solo texto, solo hashtags)
- [ ] Múltiples variantes de copy por plataforma

### Fase 3: Funcionalidades Avanzadas
- [ ] Anotaciones visuales sobre assets
- [ ] Versionado de archivos (historial de cambios)
- [ ] Integración con calendario de publicaciones
- [ ] Reportes de tiempos de aprobación
- [ ] Exportación completa (asset + copy en paquete)

---

*Documento generado para Quepia Consultora*
*Última actualización: Febrero 2026*
