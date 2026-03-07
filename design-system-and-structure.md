# Design System + Landing Structure
## Quepia.com - Fuente de la verdad para rediseño (Modo Oscuro Premium)

**Version:** 1.0  
**Objetivo:** Definir un sistema visual y una arquitectura de Home de alta conversion para Quepia.com, con estetica premium en modo oscuro, inspirada en la calidad de producto de Stripe y ejecutada bajo el principio **Show, don't tell**.

---

## PARTE 1: SISTEMA DE DISENO VISUAL

### 1. Paleta de Colores y Fondos (Entorno Oscuro)

#### Reglas innegociables
- Prohibido usar negro puro `#000000` en fondos principales.
- El canvas debe construirse con grises oscuros profundos (`#0a0a0a`, `#111111`) para conservar detalle en sombras.
- El texto principal debe ir en blanco puro `#FFFFFF`.
- El texto secundario/descriptivo debe ir en gris medio `#A1A1AA`.
- La iluminacion ambiental debe usar orbes desenfocados en violeta oscuro `#9b2c8a` y turquesa vibrante `#2ae7e4`.

#### Tokens base (CSS)
```css
:root {
  /* Canvas y superficies */
  --bg-canvas: #0a0a0a;
  --bg-surface-1: #111111;
  --bg-surface-2: #161616;

  /* Marca */
  --brand-violet: #9b2c8a;
  --brand-cyan: #2ae7e4;

  /* Texto */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  /* Bordes y separadores */
  --line-subtle: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
}
```

#### Sistema de iluminacion de fondo (orbes)
```css
.page-background {
  position: relative;
  background:
    radial-gradient(120% 80% at 10% -10%, rgba(155, 44, 138, 0.18), transparent 60%),
    radial-gradient(100% 70% at 90% 110%, rgba(42, 231, 228, 0.14), transparent 65%),
    linear-gradient(180deg, #0a0a0a 0%, #111111 55%, #0f0f0f 100%);
  overflow: clip;
}

.bg-orb {
  position: absolute;
  width: clamp(28rem, 40vw, 52rem);
  aspect-ratio: 1;
  border-radius: 999px;
  filter: blur(150px);
  opacity: 0.26;
  pointer-events: none;
  z-index: 0;
}

.bg-orb--violet {
  background: #9b2c8a;
  top: -20%;
  left: -10%;
}

.bg-orb--cyan {
  background: #2ae7e4;
  bottom: -28%;
  right: -12%;
}
```

#### Direccion visual del fondo
- Debe sentirse profundo, no plano.
- Los orbes no deben competir con el contenido: opacidad entre `0.12` y `0.30`.
- Evitar degradados saturados en primer plano; el foco debe estar en contenido y CTAs.

---

### 2. Estructura de Tarjetas (Glassmorphism Sutil)

#### Reglas innegociables
- Las cards no pueden usar fondos solidos opacos.
- Usar rellenos translcidos: `rgba(255, 255, 255, 0.03)` como base.
- Borde perimetral fino: `1px solid rgba(255, 255, 255, 0.08)`.
- Espacio interno amplio: minimo `2rem`, recomendado `2.5rem` a `3rem`.
- Radio moderno: `16px` a `24px`.

#### Componente base de card
```css
.card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: clamp(2rem, 2.5vw, 3rem);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

#### Espaciado recomendado
```css
:root {
  --space-1: 0.5rem;
  --space-2: 0.75rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2rem;
  --space-6: 2.5rem;
  --space-7: 3rem;
}
```

#### Regla de composicion
- Usar aire visual agresivo: menos texto por bloque, mas ritmo.
- Cada card debe tener un unico objetivo de lectura (servicio, caso o CTA).

---

### 3. Micro-interacciones y Animaciones

#### Reglas innegociables
- Transiciones suaves y consistentes: `transition: all 0.3s ease`.
- Hover en cards con elevacion: `transform: translateY(-4px)`.
- En hover, aplicar brillo turquesa suave en borde.

#### Tokens de motion
```css
:root {
  --motion-fast: 180ms;
  --motion-base: 300ms;
  --motion-slow: 450ms;
  --ease-standard: ease;
}
```

#### Hover de card (definitivo)
```css
.card {
  transition: all 0.3s ease;
}

.card:hover,
.card:focus-within {
  transform: translateY(-4px);
  border-color: rgba(42, 231, 228, 0.45);
  box-shadow:
    0 0 0 1px rgba(42, 231, 228, 0.22),
    0 18px 50px rgba(0, 0, 0, 0.45);
}
```

#### Motion de entrada recomendado
- Secciones: `fade + translateY(16px -> 0)` en `450ms`.
- Cards en grid: entrada escalonada (stagger) de `60ms`.
- CTA principal: glow pulsado sutil cada `2.5s` (no invasivo).

#### Accesibilidad de movimiento
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

---

### 4. Tipografia

#### Font stack recomendado (sans-serif moderno, limpio y geometrico)
```css
:root {
  --font-sans:
    "Plus Jakarta Sans",
    "Inter",
    "SF Pro Display",
    "SF Pro Text",
    "Segoe UI",
    "Helvetica Neue",
    Arial,
    sans-serif;
}
```

#### Sistema tipografico sugerido
- `H1`: `clamp(2.4rem, 5vw, 4.6rem)`, peso `700`, line-height `1.05`.
- `H2`: `clamp(1.8rem, 3.2vw, 3rem)`, peso `650`, line-height `1.1`.
- `H3`: `clamp(1.2rem, 2vw, 1.6rem)`, peso `600`, line-height `1.2`.
- `Body L`: `1.125rem`, line-height `1.7`, color secundario.
- `Body`: `1rem`, line-height `1.65`.
- `Caption`: `0.875rem`, line-height `1.5`, color muted.

#### Regla editorial de copy
- Titulares directos, concretos y orientados a impacto.
- Evitar adjetivos vacios ("increible", "innovador") sin evidencia.
- Mostrar resultados y proceso con pruebas visuales.

---

### 5. Componentes de conversion (complementario)

#### Boton CTA primario (con resplandor)
```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  height: 3.25rem;
  padding: 0 1.4rem;
  border-radius: 999px;
  color: #0a0a0a;
  font-weight: 700;
  background: linear-gradient(135deg, #2ae7e4 0%, #7cf2ef 100%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    0 8px 30px rgba(42, 231, 228, 0.35),
    0 0 0 1px rgba(42, 231, 228, 0.25);
  transition: all 0.3s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow:
    0 12px 42px rgba(42, 231, 228, 0.45),
    0 0 0 1px rgba(42, 231, 228, 0.35);
}
```

#### Principio de uso
- Solo un CTA primario visible por seccion.
- CTA secundario en estilo ghost/texto para reducir friccion visual.

---

## PARTE 2: ARQUITECTURA DE LA LANDING PAGE (HOME)

### Orden exacto de bloques (top-down)
1. Hero Section  
2. Social Proof  
3. Areas de Expertise  
4. Casos de Estudio (Portafolio Premium)  
5. Filosofia / Metodo  
6. Call to Action Final  
7. Footer

---

### 1. Hero Section

#### Objetivo
Capturar atencion en menos de 5 segundos y guiar al CTA principal con una promesa clara de valor.

#### Estructura UI
- `Eyebrow`: "Agencia creativa para marcas que quieren escalar con precision".
- `H1` contundente (1-2 lineas maximo).
- Subtitulo descriptivo (beneficio + tipo de cliente).
- CTA principal con glow.
- CTA secundario de baja friccion (`Ver casos`).
- Visual tecnico protagonista: animacion 3D abstracta o showreel embebido dentro de mockup de cristal.

#### Copy sugerido (base)
- **H1:** `Disenamos sistemas de marca que convierten atencion en negocio.`  
- **Subtitulo:** `Estrategia, branding y contenido audiovisual para empresas que necesitan crecer con una identidad clara y medible.`  
- **CTA principal:** `Agendar diagnostico`  
- **CTA secundario:** `Explorar proyectos`

#### Directrices visuales
- Altura minima: `min(100svh, 920px)`.
- Layout desktop: 2 columnas `6/6` (texto + visual).
- Layout mobile: texto arriba, visual abajo, CTA siempre visible sin scroll excesivo.
- El mockup visual debe demostrar trabajo real de Quepia (no renders vacios).

#### Reglas de conversion
- CTA primario visible above the fold.
- No mas de 2 CTAs en Hero.
- Incluir 1 micro-prueba junto al CTA (`+40 proyectos entregados`, `equipos de 5 a 200 personas`).

---

### 2. Social Proof

#### Objetivo
Reducir riesgo percibido inmediatamente despues del Hero.

#### Estructura UI
- Franja horizontal sutil con titulo corto: `Empresas que confiaron en Quepia`.
- Logos en monocromo gris.

#### Reglas de estilo
- `opacity: 0.5` por defecto.
- `filter: grayscale(100%)` por defecto.
- En hover: recuperar color y subir a `opacity: 0.95`.

```css
.client-logo {
  opacity: 0.5;
  filter: grayscale(100%);
  transition: all 0.3s ease;
}

.client-logo:hover {
  opacity: 0.95;
  filter: grayscale(0%);
}
```

#### Implementacion recomendada
- 8 a 12 logos maximo.
- Preferir logos vectoriales (SVG) para nitidez en dark mode.

---

### 3. Areas de Expertise

#### Objetivo
Mostrar capacidades concretas con claridad y jerarquia, sin sobrecargar lectura.

#### Layout
- Grid de 2x2 en desktop.
- Stack vertical en mobile.
- Usar sistema de tarjetas translcidas definido en PARTE 1.

#### Servicios obligatorios (uno por card)
1. Estrategia Digital y Social Media  
2. Identidad Visual y Branding  
3. Produccion Audiovisual  
4. Diseno Grafico

#### Contenido por card
- Titulo del area.
- 1 frase de resultado esperado.
- 3 capacidades clave en formato breve.
- Mini enlace contextual: `Ver proyectos relacionados`.

#### Ejemplo de estructura de card
```text
[Numero/Tag]
Identidad Visual y Branding
Construimos marcas reconocibles, consistentes y listas para escalar.
- Arquitectura de marca
- Sistema visual
- Manual de identidad
[Ver proyectos relacionados]
```

---

### 4. Casos de Estudio (Portafolio Premium)

#### Directriz estricta
No usar cuadriculas de fotos planas.

#### Objetivo
Demostrar capacidad real mediante evidencia visual de alto nivel y resultados.

#### Estructura obligatoria
- Mostrar solo los **3 mejores proyectos**.
- Cada caso en bloque amplio de alto impacto visual.
- Recursos (video/imagen) embebidos dentro de mockups minimalistas de navegador web o dispositivo movil.
- Acompanamiento lateral con informacion de negocio.

#### Layout por caso (desktop)
- Columna visual: `60%`.
- Columna contenido: `40%`.
- Alternar disposicion izquierda/derecha para dinamismo.

#### Contenido obligatorio por caso
- Nombre del proyecto.
- Servicios aplicados (chips/tags).
- Resumen breve del impacto (idealmente con metrica).
- CTA contextual: `Ver caso completo`.

#### Plantilla canonica de caso
```text
[Mockup web/movil con video o imagen real del proyecto]
Proyecto: Rebranding + Campana de performance para X
Servicios: Estrategia, Branding, Social Media, Produccion
Impacto: +38% de leads calificados en 90 dias
[Ver caso completo]
```

#### Criterio de seleccion
- Priorizar trabajos con resultados cuantificables.
- Evitar mostrar piezas bonitas sin contexto de objetivo o impacto.

---

### 5. Filosofia / Metodo

#### Objetivo
Explicar que el resultado no depende de "inspiracion", sino de un proceso replicable.

#### Estructura
- Seccion limpia de texto en 2 o 3 columnas.
- Tres pilares del metodo:
1. Descubrimiento  
2. Estrategia  
3. Ejecucion

#### Contenido por columna
- Titulo del paso.
- Breve descripcion.
- Entregables concretos del paso.

#### Ejemplo de contenido
```text
Descubrimiento
Auditamos marca, competencia y audiencia para detectar oportunidades reales.
Entregables: diagnostico, mapa de posicionamiento, hallazgos accionables.
```

#### Regla de lectura
- Maximo 90-110 palabras por columna.
- Priorizar claridad y valor practico.

---

### 6. Call to Action Final

#### Objetivo
Cerrar el recorrido con un empuje de decision claro.

#### Estructura UI
- Fondo con mayor contraste luminico (orbes turquesa/violeta mas presentes).
- Titulo directo.
- 1 texto breve de soporte.
- 1 boton principal hacia contacto.

#### Copy sugerido
- **Titulo:** `Si tu marca necesita resultados visibles, conversemos.`  
- **Soporte:** `Te mostramos un plan concreto en una primera llamada de diagnostico.`  
- **Boton:** `Ir a Contacto`

#### Reglas de estilo
- Esta seccion debe ser la mas luminosa de todo el Home sin perder legibilidad.
- No agregar elementos secundarios que compitan con el CTA final.

---

### 7. Footer

#### Objetivo
Cerrar con claridad institucional y navegacion util.

#### Estructura minima
- Logo de Quepia.
- Enlaces rapidos (`Servicios`, `Casos`, `Metodo`, `Contacto`).
- Redes sociales.
- Mencion de ubicacion.
- Linea legal simple (`© Quepia, ano actual`).

#### Estilo
- Minimalista, bajo contraste respecto del CTA final.
- Separadores sutiles y tipografia pequena pero legible.

---

## Directrices globales de conversion (aplican a toda la pagina)

### Principio "Show, don't tell"
- Cada afirmacion clave debe estar respaldada por una prueba visual o resultado.
- Reemplazar texto abstracto por evidencia:
  - Antes: "Somos creativos e innovadores".
  - Despues: "Rebranding + estrategia de contenido que incremento un 38% los leads calificados."

### Jerarquia de CTAs
- 1 CTA primario global: `Agendar diagnostico`.
- CTAs secundarios contextuales: `Ver casos`, `Ver proyectos relacionados`.
- Mantener consistencia de copy y estilo de botones en toda la pagina.

### Rendimiento y calidad
- Objetivo de carga inicial: LCP < 2.5s en conexion movil decente.
- Videos optimizados (poster + lazy load + formato moderno).
- Evitar efectos pesados simultaneos en mobile.

### Accesibilidad minima
- Contraste AA para texto en fondo oscuro.
- Estados `hover`, `focus`, `active` visibles.
- Navegacion por teclado en menus, cards interactivas y CTAs.

---

## Checklist de aceptacion (Definition of Done)

- [ ] No existe ningun fondo principal en `#000000`.
- [ ] El sistema de orbes usa `#9b2c8a` y `#2ae7e4` con `blur(150px)`.
- [ ] Texto principal en `#FFFFFF` y secundario en `#A1A1AA`.
- [ ] Cards translcidas con `rgba(255,255,255,0.03)`, borde `1px rgba(255,255,255,0.08)`, radio moderno y padding amplio.
- [ ] Hover de cards cumple `translateY(-4px)` + brillo turquesa + `transition: all 0.3s ease`.
- [ ] Tipografia usa stack moderno sans-serif (Inter/SF Pro/Plus Jakarta Sans).
- [ ] Home sigue exactamente el orden de bloques definido en PARTE 2.
- [ ] Portafolio presenta 3 casos premium en bloques amplios con mockups y resumen de impacto.
- [ ] CTA final tiene el mayor contraste luminico y una accion unica de contacto.
- [ ] La narrativa general demuestra capacidades con evidencia visual (Show, don't tell).

