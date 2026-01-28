# Guía de Rediseño: Quepia Web

## Fusión BASIC Agency × Glassmorphism Premium

---

## 1. Filosofía de Diseño

Tu nuevo diseño debe comunicar: **sofisticación silenciosa + impacto visual**. BASIC Agency logra esto con espacios generosos, tipografía dominante y movimiento sutil. Tu glassmorphism actual aporta elegancia y profundidad. La fusión crea algo único: **"Glass & Bold"**.

### Principios Clave
- **Menos es más**: eliminar ruido visual, dejar que el contenido respire
- **Tipografía como protagonista**: textos grandes, con peso, que comuniquen autoridad
- **Movimiento con propósito**: animaciones sutiles que guían, no distraen
- **Contraste dramático**: fondo oscuro profundo (#0a0a0a) con acentos de luz

---

## 2. Cambios en el Header/Navegación

### Actual
```
Logo | Servicios | Trabajos | Sobre Nosotros | Contacto | [Hablemos]
```

### Propuesto (Estilo BASIC)
```
Logo                                    Servicios  Trabajos  Nosotros  Contacto
                                                                        [● Menu]
```

**Implementación:**
- Navegación **sticky** con blur glass (backdrop-filter: blur(20px))
- Logo a la izquierda, links a la derecha con spacing generoso (gap: 3rem)
- Eliminar el botón "Hablemos" redundante del nav
- Agregar indicador circular (●) antes de "Menu" en mobile
- Transición de fondo: transparente → glass oscuro al hacer scroll
- Tipografía nav: 13-14px, uppercase, letter-spacing: 0.1em, font-weight: 500

```css
/* Ejemplo de estilo */
.nav {
  background: rgba(10, 10, 10, 0);
  backdrop-filter: blur(0px);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav.scrolled {
  background: rgba(10, 10, 10, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
```

---

## 3. Hero Section — El Cambio Más Importante

### Actual
- Título: "CONSULTORÍA PARA MEJORAR"
- Subtítulo: "(RE)inventá tu marca con Quepia"
- Dos botones CTA

### Propuesto (Estilo BASIC × Glass)

**Estructura:**

```
[Video/Animación de fondo sutil - loop abstracto con partículas o fluidos]

                    QUEPIA®
     
     Consultora creativa que transforma
     marcas en experiencias memorables.
     
     [Ver Proyectos →]


                                    Scroll ↓
```

**Especificaciones:**

1. **Video de fondo** (o canvas WebGL):
   - Loop de 10-15 segundos
   - Colores: gradientes sutiles con tu paleta (cyan #2AE7E4, magenta #881078)
   - Opacidad: 30-40% para no competir con el texto
   - Alternativa sin video: gradiente animado con mesh gradient

2. **Tipografía Hero**:
   - "QUEPIA®": 12-14px, uppercase, letter-spacing: 0.3em, opacity: 0.6
   - Headline principal: **clamp(3rem, 8vw, 7rem)**, font-weight: 300-400
   - Line-height: 1.1
   - Máximo 2-3 líneas

3. **CTA único**:
   - Solo UN botón principal
   - Estilo: texto + flecha, sin fondo sólido
   - Hover: underline animado o flecha que se mueve

4. **Indicador de scroll**:
   - Posición: bottom center
   - Animación: bounce sutil cada 2 segundos
   - Texto "Scroll" + flecha hacia abajo

```css
/* Tipografía hero */
.hero-headline {
  font-size: clamp(2.5rem, 7vw, 6rem);
  font-weight: 300;
  line-height: 1.1;
  letter-spacing: -0.02em;
  max-width: 900px;
}

/* CTA minimalista */
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom: 1px solid currentColor;
  padding-bottom: 0.25rem;
  transition: gap 0.3s ease;
}

.hero-cta:hover {
  gap: 1rem;
}
```

---

## 4. Sección de Servicios — Grid Interactivo

### Actual
- Grid de 9 tarjetas con "Tocá cada servicio para conocer más detalles"
- Cards con glassmorphism

### Propuesto

**Opción A: Lista Expandible (estilo BASIC)**

```
01  Diseño Gráfico          →
    ─────────────────────────
02  Branding                →
    ─────────────────────────
03  Producción de Video     →
    ─────────────────────────
...
```

Al hover, la fila se expande mostrando una descripción breve y una imagen preview.

**Opción B: Grid Asimétrico con Glass (recomendado para Quepia)**

```
┌─────────────────┬──────────┐
│                 │          │
│  Diseño         │ Branding │
│  Gráfico        │          │
│                 ├──────────┤
├─────────────────┤  Video   │
│  Redes Sociales │          │
└─────────────────┴──────────┘
```

**Especificaciones:**
- Cards con tamaños variables (featured services más grandes)
- Glass effect: `background: rgba(255,255,255,0.03)`, `border: 1px solid rgba(255,255,255,0.08)`
- Hover: elevación sutil + borde más brillante + imagen de fondo fade-in
- Numeración visible: "01", "02" en cada card (estilo editorial)
- Sin iconos genéricos — usa tipografía bold o imágenes de proyectos

```css
.service-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
  padding: 2rem;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.service-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-4px);
}

.service-number {
  font-size: 0.75rem;
  opacity: 0.4;
  font-family: monospace;
}
```

---

## 5. Sección de Trabajos — Showcase Inmersivo

### Actual
- Grid uniforme de 6 proyectos con imágenes placeholder
- Mismo tamaño para todos

### Propuesto (Estilo BASIC/Basement Híbrido)

**Layout Cinematográfico:**

```
┌──────────────────────────────────────┐
│                                      │
│         PROYECTO DESTACADO           │
│              (grande)                │
│                                      │
└──────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐
│  Proyecto 2  │  │  Proyecto 3  │
└──────────────┘  └──────────────┘

┌──────────────────────────────────────┐
│         PROYECTO DESTACADO 2         │
└──────────────────────────────────────┘
```

**Especificaciones:**

1. **Proyecto destacado (hero project)**:
   - Ancho completo, aspect-ratio: 16/9
   - Overlay con gradient de abajo hacia arriba
   - Título grande sobre la imagen
   - Tags de categoría pequeños
   - Video preview en hover (si es posible)

2. **Proyectos secundarios**:
   - 50% width cada uno
   - Aspect-ratio: 4/5 (vertical) o 3/2 (horizontal)
   - Hover: zoom sutil de imagen + reveal de info

3. **Interacción hover**:
   - Imagen: scale(1.05) con clip suave
   - Cursor personalizado: círculo que dice "Ver"
   - Información aparece con fade desde abajo

```css
.project-card {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.project-card img {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.project-card:hover img {
  transform: scale(1.05);
}

.project-overlay {
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.8) 0%,
    transparent 50%
  );
}
```

---

## 6. Sección "Sobre Nosotros" / Filosofía

### Propuesta Nueva (no existe actualmente en home)

Agregar una sección de statement con texto grande, estilo manifiesto:

```
"Creemos que cada marca
tiene una historia única
que merece ser contada
con excelencia."

                    — Quepia, Villa Carlos Paz
```

**Especificaciones:**
- Texto: clamp(1.5rem, 4vw, 3rem)
- Font-weight: 300 (light)
- Line-height: 1.4
- Animación: texto aparece palabra por palabra o línea por línea al scroll
- Firma/atribución en texto pequeño, alineado a la derecha

---

## 7. Clientes / Logos (Nueva Sección)

Aunque no tengas clientes grandes, puedes mostrar:

```
Marcas que confían en nosotros

[Logo] [Logo] [Logo] [Logo] [Logo]
```

**Implementación (Estilo Basement):**
- Logos en escala de grises, opacity: 0.5
- Hover: opacity: 1, color original
- Scroll horizontal infinito (marquee) como alternativa
- Si no tienes logos: omitir esta sección o usar "Proyectos para industrias como: Gastronomía, Moda, Tecnología..."

---

## 8. CTA Final — Llamada a la Acción

### Actual
```
¿Listo para crear algo increíble?
Llevemos tu marca al siguiente nivel visual.
[Hablemos]
```

### Propuesto

```
                    ¿Tenés un proyecto en mente?

                         Hablemos →
                    
                    hola@quepia.com
```

**Especificaciones:**
- Pregunta: font-size grande, peso light
- "Hablemos →": link con flecha, hover hace mover la flecha
- Email clickeable debajo
- Fondo: puede tener gradiente glass sutil o mesh gradient animado
- Padding vertical generoso (min 200px arriba y abajo)

---

## 9. Footer — Minimalista y Funcional

### Actual
- Demasiadas secciones, redundante

### Propuesto (Estilo BASIC)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  QUEPIA®                          Instagram                    │
│                                   LinkedIn                     │
│  Consultora Creativa              Behance                      │
│  Villa Carlos Paz, Argentina                                   │
│                                   hola@quepia.com              │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  © 2026 Quepia                              Privacidad │ Legal │
└────────────────────────────────────────────────────────────────┘
```

**Especificaciones:**
- Dos columnas principales: info izquierda, links derecha
- Eliminar navegación duplicada (ya está en header)
- Links sociales: solo texto, sin iconos
- Línea divisoria sutil antes del copyright
- Tamaño de texto: 13-14px
- Color: rgba(255,255,255,0.6) para texto secundario

---

## 10. Tipografía Global

### Recomendaciones de Fuentes

**Opción 1: Premium (de pago)**
- Headlines: **Monument Extended** o **Neue Montreal**
- Body: **Söhne** o **Suisse Int'l**

**Opción 2: Google Fonts (gratis)**
- Headlines: **Space Grotesk** (peso 300-700) o **Outfit**
- Body: **Inter** o **DM Sans**

**Opción 3: Variable Font moderna**
- **Satoshi** (fontshare.com - gratis)
- **General Sans** (fontshare.com - gratis)

### Escala Tipográfica

```css
:root {
  /* Scale ratio: 1.25 (Major Third) */
  --text-xs: 0.75rem;      /* 12px - labels, tags */
  --text-sm: 0.875rem;     /* 14px - nav, small text */
  --text-base: 1rem;       /* 16px - body */
  --text-lg: 1.25rem;      /* 20px - lead text */
  --text-xl: 1.5rem;       /* 24px - h4 */
  --text-2xl: 2rem;        /* 32px - h3 */
  --text-3xl: 2.5rem;      /* 40px - h2 */
  --text-4xl: 3.5rem;      /* 56px - h1 */
  --text-5xl: 5rem;        /* 80px - display */
  --text-6xl: 7rem;        /* 112px - hero */
}
```

---

## 11. Paleta de Colores Refinada

### Actual
- Cyan: #2AE7E4
- Magenta: #881078

### Propuesta Expandida

```css
:root {
  /* Fondos */
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-elevated: #1a1a1a;
  
  /* Textos */
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-muted: rgba(255, 255, 255, 0.4);
  
  /* Acentos (tus colores) */
  --accent-cyan: #2AE7E4;
  --accent-magenta: #881078;
  --accent-gradient: linear-gradient(135deg, #2AE7E4 0%, #881078 100%);
  
  /* Glass */
  --glass-bg: rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-border-hover: rgba(255, 255, 255, 0.15);
}
```

---

## 12. Animaciones y Micro-interacciones

### Principios
- Duración: 0.3s - 0.6s para la mayoría
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out suave)
- Stagger: elementos que aparecen en secuencia con 50-100ms de delay

### Animaciones Clave

```css
/* Fade up al entrar en viewport */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reveal de texto línea por línea */
.text-reveal span {
  display: block;
  overflow: hidden;
}

.text-reveal span::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bg-primary);
  transform-origin: right;
  animation: reveal 0.8s cubic-bezier(0.77, 0, 0.175, 1) forwards;
}

@keyframes reveal {
  to { transform: scaleX(0); }
}

/* Cursor personalizado */
.custom-cursor {
  width: 80px;
  height: 80px;
  border: 1px solid white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  text-transform: uppercase;
  pointer-events: none;
  transition: transform 0.2s ease;
}
```

### Librerías Recomendadas
- **Framer Motion** (React) - para animaciones complejas
- **GSAP** - para scroll-triggered animations
- **Lenis** - smooth scroll

---

## 13. Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### Mobile Específico
- Hero text: reducir a clamp(2rem, 10vw, 3rem)
- Navegación: hamburger menu con panel fullscreen
- Grid servicios: stack vertical
- Proyectos: 1 columna
- Padding lateral: 1.5rem (24px)

---

## 14. ⚠️ IMPORTANTE: Preservación del Backend

### Reglas Críticas de Implementación

El rediseño es **únicamente visual y de frontend**. Todas las implementaciones de backend existentes deben mantenerse intactas:

1. **No modificar estructuras de datos**: Los modelos, schemas y tipos que alimentan la página deben permanecer igual. El nuevo diseño debe adaptarse a la data existente, no al revés.

2. **Mantener endpoints y APIs**: Si tenés rutas de API (Next.js API routes, server actions, etc.) para gestionar contenido, estas no deben tocarse.

3. **Preservar lógica de fetching**: Los hooks, funciones de fetch, y cualquier lógica de obtención de datos del CMS o base de datos deben mantenerse.

4. **Respetar el sistema de autenticación**: Si hay áreas protegidas o paneles de administración, el rediseño no debe interferir con estos flujos.

5. **Componentes con data dinámica**: Al rediseñar componentes que reciben props del backend (proyectos, servicios, etc.), asegurate de:
   - Mantener los mismos nombres de props
   - No eliminar campos que se usan internamente
   - Testear que la data sigue fluyendo correctamente

### Estrategia Recomendada

```
/components
  /ui          ← Componentes visuales nuevos (botones, cards, etc.)
  /sections    ← Secciones rediseñadas que CONSUMEN la misma data
  /legacy      ← Backup de componentes viejos (por si acaso)

/lib           ← NO TOCAR - lógica de backend
/api           ← NO TOCAR - endpoints
/hooks         ← NO TOCAR - data fetching
```

### Checklist Pre-Implementación

- [ ] Documentar todas las props que recibe cada componente actual
- [ ] Identificar qué datos vienen del backend vs. hardcodeados
- [ ] Crear branch separado para el rediseño
- [ ] Tener backup/snapshot de la versión actual funcionando
- [ ] Testear en staging antes de mergear a producción

---

## 15. Checklist de Implementación

### Fase 1: Fundamentos
- [ ] Configurar nueva tipografía
- [ ] Implementar sistema de colores CSS variables
- [ ] Crear componentes base (botones, cards, containers)
- [ ] Implementar smooth scroll (Lenis)

### Fase 2: Secciones Core
- [ ] Rediseñar Hero con video/animación de fondo
- [ ] Nuevo diseño de navegación con scroll effect
- [ ] Grid de servicios interactivo
- [ ] Showcase de proyectos con layout cinematográfico

### Fase 3: Polish
- [ ] Agregar animaciones de entrada (scroll-triggered)
- [ ] Implementar cursor personalizado (opcional)
- [ ] Optimizar imágenes (WebP, lazy loading)
- [ ] Testing responsive completo

### Fase 4: Detalles
- [ ] Micro-interacciones en hovers
- [ ] Loading states elegantes
- [ ] 404 page con estilo
- [ ] Favicon y meta tags actualizados

---

## 16. Recursos y Referencias

### Inspiración Visual
- [BASIC Agency](https://www.basicagency.com) — estructura, tipografía, espaciado
- [Basement Studio](https://basement.studio) — energía, movimiento, tech-forward
- [Locomotive](https://locomotive.ca) — scroll animations
- [Metalab](https://metalab.com) — glass effects premium

### Assets
- Gradientes: [Mesh Gradient](https://meshgradient.in/)
- Fondos abstractos: [Haikei](https://haikei.app/)
- Videos stock: [Pexels](https://pexels.com/videos) o [Coverr](https://coverr.co)

### Herramientas
- [Realtime Colors](https://realtimecolors.com) — preview de paletas
- [Typescale](https://typescale.com) — escala tipográfica
- [Cubic Bezier](https://cubic-bezier.com) — curvas de animación

---

## Resumen Ejecutivo

| Aspecto | Actual | Propuesto |
|---------|--------|-----------|
| Hero | Texto estático, 2 CTAs | Video bg, tipografía bold, 1 CTA |
| Nav | Tradicional, botón extra | Minimal, glass on scroll |
| Servicios | Grid uniforme 9 cards | Grid asimétrico interactivo |
| Trabajos | Cards iguales | Layout cinematográfico |
| CTA | Genérico | Statement + contacto |
| Footer | Sobrecargado | Minimal 2 columnas |
| Tipografía | Estándar | Variable, escala clara |
| Animaciones | Básicas | Scroll-triggered, staggered |

---

*El objetivo es que Quepia se sienta como una agencia de primer nivel mundial, con la sofisticación de BASIC pero con tu toque distintivo de glassmorphism que ya te diferencia. Menos ruido, más impacto.*
