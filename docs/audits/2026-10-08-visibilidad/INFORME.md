# Quepia: visibilidad relevante, búsqueda local y asistentes

Fecha: 8 de octubre de 2026. Auditoría independiente sobre el repositorio en `6365ee4` y páginas públicas recuperadas durante esta sesión. Rama revisable: `seo/visibilidad-relevante-2026-10-08`. No se publicaron cambios, editaron perfiles ni contactaron clientes.

## 1. Diagnóstico ejecutivo, evidencia y límites

La oportunidad principal es explicar qué puede delegar el cliente y respaldarlo con casos de contenido y comunicación. Quepia ya dispone de una arquitectura útil; no necesita multiplicar páginas por ciudades ni agregar servicios para coincidir con cualquier consulta. “Consultora Creativa” debe conservarse, acompañada de servicios concretos. “Agencia de comunicación” puede expresar una necesidad del cliente, pero también puede significar prensa, relaciones públicas o crisis: no corresponde atribuir esas prestaciones.

### Hallazgos comprobados

| ID | Evidencia y fuente | Implicación → cambio → necesidad → comprobación |
|---|---|---|
| H1 | La [home](https://quepia.com/) recuperada por búsqueda presenta branding, redes y producción; el código actual `app/page.tsx` y `HeroSection.tsx` identifica a Quepia como consultora. Algunos resultados conservan “agencia”. | Hay versiones almacenadas → usar una definición consistente en web y perfiles → entender rápidamente a quién contratar → comparar HTML actual e información que recuperan buscadores, sin esperar actualización inmediata. |
| H2 | La [página de redes](https://quepia.com/servicios/gestion-de-redes-sociales) explica planificación, diseño, textos, calendario, edición y acuerdos de publicación. Sus FAQ eran genéricas. | La oferta existe, pero la delegación tiene límites → responder tareas concretas → comparar propuestas → revisar FAQ visible y consultas recibidas. |
| H3 | [Córdoba](https://quepia.com/cordoba), [Carlos Paz](https://quepia.com/villa-carlos-paz) y [Punilla](https://quepia.com/valle-de-punilla) ya existen. Córdoba explica coordinación remota y producción con viáticos; no presenta una sucursal en Capital. | Conservar URLs → diferenciar logística y evidencia local → saber si pueden trabajar juntos → revisar cobertura y formularios por ciudad. |
| H4 | La página de redes, contacto, portfolio y zonas recuperadas hoy muestran +54 9 351 718-6433; resultados almacenados muestran 0227. `lib/contact.ts` centraliza 6433. El registro interno del 8/10 documenta su actualización. | La diferencia observada es entre recuperaciones, no prueba de dos teléfonos actuales en el sitio → confirmar 6433 y revisar perfiles → contactar al equipo correcto → comprobar enlaces tel/wa.me y recrawl. |
| H5 | [Portfolio](https://quepia.com/trabajos) identifica proyectos y entregables. El código ya desarrolla Rohi, Onix y Mike Donas. | Hay material para autoridad basada en trabajo → completar cinco casos con alcance y fecha → evaluar experiencia comparable → verificar galería, autorización y descripción del cliente. |
| H6 | [Equipo](https://quepia.com/sobre-nosotros) identifica a Lautaro López Labrin y Camila De Angelis. Hay referencias amplias a resultados y crecimiento sin métricas asociadas en esa página. | Mejorar precisión del relato → explicar roles y proceso → conocer quién realiza el trabajo → cotejar responsabilidades y casos. |
| H7 | `docs/seo/change-log.md` registra decisión del negocio: marketing significa estrategia de marca, no gestión de pauta. `public/llms.txt` lo explicita. | Excluir Meta Ads y Google Ads de captación → aclararlo también donde se contrata redes → evitar contactos fuera de oferta → auditar textos y motivos de descarte. |
| H8 | Código Next.js 15.5.26, App Router, React 19.2.8, TypeScript. Hay canonical, metadata por servicio, robots, sitemap dinámico, Service, FAQPage y datos de organización. | No diagnosticar su ausencia → verificar salida publicada y correspondencia → facilitar acceso y comprensión → inspección de URL, HTML y logs. |
| H9 | El código tiene eventos separados para formularios y clics a WhatsApp, teléfono y email. | Reutilizar medición → comprobar emisión y cuentas configuradas → distinguir contacto de intención → DebugView y registro comercial. |

Las búsquedas externas realizadas fueron “Quepia consultora creativa Córdoba”, “Quepia Google maps opiniones”, “quepiastudio Quepia” y “Quepia Consultora Creativa -site:quepia.com”. La primera recuperó principalmente páginas propias y una referencia agregada de SignalHire al fundador, sin suficiente valor para recomendar ese directorio. No se identificó con certeza una ficha local ni una red de referencias de clientes. Esto **no demuestra ausencia**. Instagram está enlazado por la web y confirmado como perfil oficial en `lib/instagram.ts`: [@quepiastudio](https://www.instagram.com/quepiastudio/). Su contenido no pudo revisarse por limitación de acceso. No afirmar que sus datos están completos.

### Hipótesis razonables

1. La combinación de portfolio visual y lema puede favorecer la asociación con branding. Debe probarse con un conjunto de consultas, no deducirse de una sola respuesta.
2. Los casos con alcance explícito pueden ayudar a distinguir producción de piezas de operación de cuentas. Que los asistentes los citen dependerá de sus fuentes y del contexto.
3. Referencias legítimas de clientes y perfiles consistentes pueden aumentar la confianza pública en la entidad. No hay medición actual que permita cuantificar el efecto.

### Pendientes de verificar

Ficha Google Business y acceso del propietario; dirección apta para recibir clientes; visitas presenciales habituales; publicación/programación y plataformas; reportes contratables y frecuencia; atención con automatizaciones y sus límites; métricas y autorizaciones de casos; alcance fuera de la provincia; Search Console, Bing Webmaster Tools, Analytics y cuentas comerciales. No hay volúmenes, posiciones ni conversiones medidas disponibles en esta sesión.

El llms.txt del repositorio menciona además páginas web y configuración de tiendas online. No se verificó aquí su alcance ni una página comercial actual equivalente; quedan como oferta adicional por confirmar antes de ampliar esta matriz. Las etiquetas “Marketing” del portfolio tampoco acreditan gestión de pauta.

Los dos ejemplos de ChatGPT aportados por el usuario son observaciones aisladas. Uno acredita una recomendación reportada; ninguno explica exclusiones, fuentes de mapas ni un ranking estable. No se probaron ChatGPT, Gemini, Copilot ni Perplexity como interfaces de recomendación durante esta auditoría.

## 2. Cinco acciones prioritarias

| Orden | Hallazgo → acción concreta | Necesidad y comprobación |
|---|---|---|
| 1 | H2/H7 → publicar un alcance de redes por tarea, diferenciando piezas, publicación, atención y pauta. Se agregaron seis FAQ en la rama. | Delegar con expectativas claras; revisar las propuestas enviadas y si disminuyen consultas sobre servicios excluidos. |
| 2 | H1/H6 → conservar la marca y lema, pero hacer visible “gestión de redes sociales, branding y producción de contenido”. Se ajustó la descripción SEO de home; resto de textos abajo. | Identificar encaje inmediato; prueba con visitantes y evolución de consultas calificadas por servicio. |
| 3 | H5 → completar Bahía Norte, Rohi, Mike Donas, Noe García Roñoni y AILE. | Ver experiencia comparable; verificar cinco fichas con entregables, fechas y permisos, sin atribuir ventas. |
| 4 | H4 → revisar 6433 en perfiles y ficha existente; determinar elegibilidad local antes de gestionar Google Business. | Contactar una empresa real; teléfono comprobado, ficha sin duplicados y ubicación fiel. |
| 5 | H8/H9 → validar producción y activar línea de base comercial y de búsqueda. | Saber si aumenta demanda útil; informe de consultas, contactos calificados y disponibilidad de páginas. |

## 3. Oferta confirmada y mapa de búsquedas

Confirmación aquí significa respaldo público o editorial del repositorio; no certificación de cumplimiento de contratos. La inclusión final de cada tarea debe estar en la propuesta.

| Tarea de redes | Estado y evidencia | Cómo comunicarla |
|---|---|---|
| Estrategia | Publicada en redes; estrategia de contenido orgánico y de marca en código. | Confirmada como capacidad; alcance según diagnóstico. |
| Calendario | Página y planes Plus/Premium. | Confirmado; cantidad y frecuencia acordadas. |
| Diseño | Página, planes y casos. | Confirmado. |
| Redacción | Página y planes. | Confirmada. |
| Fotos y reels | Producción y fotografía separadas; edición de reels en redes. | Confirmados como capacidad; rodaje nuevo presupuestado, no inclusión automática. |
| Programación/publicación | El texto dice que las tareas se acuerdan. | Pendiente de confirmar qué operación realiza Quepia y en qué plataformas. |
| Mensajes/comentarios | No incluidos por defecto; llms local menciona opción con automatizaciones. | Pendiente de confirmar disponibilidad, supervisión y alcance; no prometer atención integral. |
| Reportes | Página habla de revisar métricas, sin formato/frecuencia. | Pendiente de confirmar entregable, acceso y periodicidad. |
| Reuniones | Reunión mensual publicada para Plus; seguimiento en Premium. | Confirmada para Plus; otras frecuencias según propuesta. |
| Meta Ads/Google Ads | Exclusión registrada por el negocio. | No ofrecidos como gestión de pauta. Diseño de creativos es diferente. |
| Prensa, RR. PP., crisis | Sin respaldo. | No atribuir ni captar como oferta. |

La [matriz de consultas](./consultas.csv) contiene 48 preguntas naturales, con intención, encaje, página, evidencia, prioridad y dependencia geográfica. Son propuestas de investigación y contenido, **no búsquedas medidas**. A = alta intención y encaje; M = media o requiere logística; C = condicional, posponer hasta confirmar prestación. Las filas que piden publicación o atención total tienen encaje parcial; no usarlas para prometer delegación integral.

Hotelería, gastronomía, inmobiliarias, comercios, empresas e instituciones tienen ejemplos públicos. La experiencia en una pieza o sesión no prueba gestión mensual de redes para todo ese sector. No crear landings nuevas para “empresas” o “instituciones” hasta tener una necesidad y casos que justifiquen contenido distinto.

## 4. Mapa de páginas y contenidos

Reutilizar las URLs actuales. Los títulos siguientes son propuestas editoriales; no implican publicación. Las fichas de proyectos deben conservar el slug con UUID que ya usa el sitio; no adivinar rutas sin identificador.

| URL | Intención; título SEO / H1 | Secciones y preguntas | Casos; enlaces; CTA |
|---|---|---|---|
| `/` | Encontrar proveedor. “Redes sociales y branding en Córdoba · Quepia” / “Gestión de redes, branding y contenido para marcas de Córdoba” | Definición; servicios; cinco trabajos; proceso; alcance. ¿Qué hacen y desde dónde? | Bahía Norte/Rohi/AILE; redes, branding, producción, zonas; “Contanos qué necesitás comunicar”. |
| `/servicios` | Elegir servicio. “Servicios creativos en Córdoba · Quepia” / “Servicios para ordenar tu marca y sus contenidos” | Capacidades y entregables; servicios complementarios; qué no incluye. | Portfolio; siete servicios y contacto; “Elegí el servicio y consultanos”. |
| `/servicios/gestion-de-redes-sociales` | Delegar contenido. “Gestión de redes sociales en Córdoba · Quepia” / “Gestión de redes sociales en Córdoba” | Planificación; matriz de tareas; materiales; producción; aprobaciones; seguimiento; FAQ. ¿Quién publica y responde? ¿Qué depende del presupuesto? | Bahía Norte/Rohi; precios, branding, foto, producción y zonas; formulario existente. |
| `/servicios/branding-e-identidad` | Crear/renovar identidad. “Branding e identidad visual en Córdoba · Quepia” / mismo sin marca | Diagnóstico; sistema; aplicaciones en redes, etiquetas y piezas; entregables; revisiones. ¿Incluye solo logo? | AILE/CEL/INDAR; redes, diseño, packaging; “Consultá por tu identidad”. |
| `/servicios/produccion-audiovisual` | Producir video/reels. “Producción audiovisual en Córdoba · Quepia” / “Video y reels para marcas de Córdoba” | Objetivo; formatos; locaciones; rodaje; edición; derechos de uso; logística. ¿Incluye grabación o edición de material existente? | Casos de video solo cuando la descripción confirma alcance; foto, dron, redes; “Contanos dónde y qué necesitás grabar”. |
| `/servicios/fotografia-de-producto` | Mostrar productos/propiedades. “Fotografía de producto e inmobiliaria en Córdoba · Quepia” / mismo sin marca | Separar producto y espacios dentro de la página; preparación; sesión; selección y entrega; uso. | Mike/Onix/Noe; producción, redes, gastronomía e inmobiliarias; “Pedí una propuesta de fotografía”. |
| `/servicios/diseno-grafico` | Piezas concretas. “Diseño gráfico en Córdoba · Quepia” / “Diseño gráfico para comunicar tu marca” | Formatos; material de entrada; adaptaciones; archivos e impresión. | Rohi/Aristos; branding, packaging, redes; “Contanos qué piezas necesitás”. |
| `/servicios/packaging` | Etiquetas/envases. “Diseño de packaging en Córdoba · Quepia” / “Diseño gráfico de packaging y etiquetas” | Variantes; troquel; proveedor; arte final; responsabilidades normativas; foto de lanzamiento. | Seleccionar solo piezas efectivamente documentadas; branding y fotografía; “Consultá por tu producto y envase”. |
| `/servicios/filmacion-con-dron-cordoba` | Registro aéreo. “Filmación con dron en Córdoba · Quepia” / mismo sin marca | Locación; objetivo; viabilidad; clima; entregables; traslados. | Confirmar un caso aéreo, no inferirlo por categoría video; audiovisual y Punilla; “Evaluemos tu locación”. |
| `/cordoba` | Contratar desde Capital/provincia. “Redes, branding y contenido en Córdoba · Quepia” / “Servicios creativos para Córdoba Capital y provincia” | Base real; proceso remoto; producción presencial; viáticos; FAQ; proyectos con ubicación comprobada. | Portfolio provincial sin atribuir ciudades desconocidas; servicios y Carlos Paz; “Contanos tu ciudad y proyecto”. |
| `/villa-carlos-paz` | Proveedor local. “Consultora creativa en Villa Carlos Paz · Quepia” / “Redes, branding y contenido en Villa Carlos Paz” | Base; contacto; relevamiento/producción; casos locales; modalidad de reunión. | Rohi y Noe, cuya ciudad está descrita; Córdoba, servicios y contacto; “Coordiná una primera conversación”. |
| `/valle-de-punilla` | Producción y logística serrana. “Diseño y producción en Punilla · Quepia” / “Contenido y producción audiovisual en el Valle de Punilla” | Accesos; jornadas; luz/clima; revisión remota; viáticos. | Caso territorial solo con ciudad confirmada; audiovisual, foto, Carlos Paz; “Indicanos la localidad y fecha”. |
| `/rubros/turismo-y-hoteleria`, `/rubros/gastronomia`, `/rubros/inmobiliarias` | Proveedor con experiencia pertinente. Títulos/H1 existentes, ya específicos por rubro. | Necesidades propias; preparación; piezas; alcance; casos. No duplicar home. | Bahía Norte/Mike/Noe respectivamente; redes, foto, producción y zonas; consulta contextual. |
| `/trabajos` y fichas existentes | Evaluar experiencia. “Trabajos de Quepia: diseño y contenido” / “Proyectos y entregables para marcas” | Filtro por necesidad; fichas con situación, objetivo y evidencia. | Servicios vinculados al alcance real; CTA de proyecto similar. |
| `/precios` | Comparar y contratar. “Alcance y presupuesto de servicios · Quepia” / “Cómo definimos tu propuesta” | Diferencias entre planes; cantidades; plataformas; producción; publicación; atención; revisiones; plazo y costos adicionales. | Enlace a redes y casos; “Pedí una propuesta con alcance definido”. |
| `/sobre-nosotros` | Confianza en equipo. “Equipo y forma de trabajo · Quepia” / “Consultora Creativa: el equipo de Quepia” | Roles; proceso; base; criterios; experiencia documentada. | AILE/Rohi; trabajos y contacto; “Hablemos de tu marca”. |
| `/contacto` | Contactar con contexto. “Contacto y presupuesto · Quepia” / “Contanos qué necesita tu marca” | Formulario actual; canales; base; siguiente paso; atención presencial por coordinar. | Servicios/precios/privacidad; “Enviar consulta”. |

Enlazar también **desde los casos a sus servicios** y desde las explicaciones de presupuesto a los formularios correspondientes. Una lista de enlaces genéricos no reemplaza esos vínculos contextuales. No crear una URL por consulta; agrupar comparaciones en FAQ y precios. No redirigir páginas útiles existentes sin una consolidación justificada y verificada.

## 5. Textos listos para usar

Los siguientes textos se basan en capacidades publicadas. No incorporan atención integral, anuncios, importes, tiempos de respuesta ni oficina de atención. La matriz de tareas pendientes es documentación interna y no debe presentarse como promesa comercial.

### Definición común

“Quepia Consultora Creativa trabaja en gestión de redes sociales y contenido orgánico, branding, diseño gráfico y producción audiovisual. Tenemos base en Villa Carlos Paz y acompañamos marcas de Córdoba Capital y toda la provincia. Definimos cada propuesta según los entregables, la producción y las responsabilidades acordadas.”

“Consultora” expresa acompañamiento y criterio; “creativa” preserva identidad. “Gestión de redes”, “branding” y “producción” explican prestaciones. “Comunicación digital” puede agruparlas, pero necesita esa aclaración. “Marketing” debe traducirse a estrategia de marca, conforme a la decisión registrada. Evitar “agencia integral de comunicación y marketing” por su ambigüedad.

### Home

Título SEO: **Redes sociales y branding en Córdoba · Quepia**.

Descripción: **Gestión de redes sociales, branding y producción de contenido para marcas de Córdoba. Quepia Consultora Creativa, con base en Villa Carlos Paz.**

H1 propuesto: **Gestión de redes, branding y contenido para marcas de Córdoba**.

Presentación: “Somos Quepia Consultora Creativa. Planificamos contenidos, diseñamos publicaciones y desarrollamos identidades visuales para que tu marca explique con claridad qué ofrece. También producimos fotografía y video según las necesidades del proyecto. Trabajamos desde Villa Carlos Paz con marcas de Córdoba Capital y toda la provincia; las revisiones pueden coordinarse a distancia y las producciones se acuerdan por locación.”

CTA: “Contanos qué necesitás comunicar”. Segundo enlace: “Ver trabajos reales”.

Conservar **(RE)INVENTÁ TU MARCA** como lema destacado en el hero y piezas creativas. La propuesta puede cambiar la jerarquía semántica sin rediseñar: un H1 descriptivo y el lema como texto visual. También es válido conservar el H1 actual si la explicación concreta permanece inmediatamente visible; no hay una razón probada para atribuir la exclusión en ChatGPT a ese H1.

### Gestión de redes: bloque completo de contratación

H1: **Gestión de redes sociales en Córdoba**.

“¿Tenés una marca, pero te cuesta decidir qué publicar o sostener una línea visual? En Quepia trabajamos la planificación, el diseño y la redacción de contenidos para redes. Partimos de lo que ofrece tu negocio, las preguntas de tus clientes y los materiales que ya tenés.”

**Qué podemos trabajar.** “Definimos ejes de contenido, organizamos un calendario y preparamos publicaciones con textos y formatos adecuados para los canales acordados. El proyecto puede sumar edición de reels. Si necesitás fotos o grabaciones nuevas, planificamos una producción y la presupuestamos según las jornadas y entregables.”

**Qué acordamos antes de empezar.** “La propuesta detalla plataformas, cantidad y tipo de piezas, revisiones y circuito de aprobación. También aclara quién programa o publica y quién responde mensajes y comentarios. Preparar contenidos y atender consultas son responsabilidades distintas.”

**Cómo trabajamos.** “Revisamos tu comunicación actual, definimos prioridades y organizamos los materiales. Compartimos las piezas para que puedas validar datos, promociones y disponibilidad. Las reuniones y revisiones pueden hacerse por videollamada.”

**Identidad y producción.** “Si tu marca necesita una identidad visual o mejores imágenes, podemos coordinar branding, fotografía y video como etapas relacionadas, con alcance definido para cada una.”

**Presupuesto.** “El costo depende de plataformas, formatos, cantidad de piezas, producción y revisiones. Contanos qué querés delegar y qué recursos tiene tu equipo para preparar una propuesta comparable.”

**Publicidad.** “Quepia trabaja en estrategia de marca y contenido orgánico. No gestiona Meta Ads ni Google Ads. El diseño de creativos para campañas se acuerda como trabajo de diseño.”

CTA: **Contanos qué querés delegar de tus redes**. Usar las seis FAQ incorporadas al repositorio y conservar las respuestas sobre presupuesto y cobertura. Confirmar reportes antes de agregar un compromiso mensual.

### /cordoba

Título: **Redes, branding y contenido en Córdoba · Quepia**.

H1: **Servicios creativos para Córdoba Capital y provincia**.

“Trabajamos con marcas de Córdoba Capital y otras localidades desde nuestra base en Villa Carlos Paz. Podemos coordinar planificación de contenidos, diseño y branding a distancia. Si tu proyecto necesita fotografías, video o tomas aéreas, acordamos la locación, la fecha, los entregables y los traslados.”

**Coordinación.** “Las revisiones digitales permiten organizar el trabajo con tu equipo sin trasladarnos en cada etapa. Necesitamos una persona de referencia para validar información y reunir materiales.”

**Producción presencial.** “Antes de confirmar una jornada revisamos accesos, horarios y preparación del lugar. Los viáticos se contemplan según la distancia. Las tomas con dron dependen de la viabilidad de cada operación.”

**Consulta.** “Indicanos tu ciudad, el servicio que necesitás y una fecha orientativa. Te proponemos un alcance acorde con los materiales disponibles y lo que querés comunicar.”

CTA: **Consultá por tu proyecto en Córdoba**. Mantener las FAQ locales existentes y no usar dirección en Capital.

### /villa-carlos-paz

Título: **Consultora creativa en Villa Carlos Paz · Quepia**.

H1: **Redes, branding y contenido en Villa Carlos Paz**.

“Quepia tiene base en Villa Carlos Paz. Trabajamos con marcas que necesitan ordenar su identidad, planificar contenidos o producir imágenes para mostrar mejor sus productos y espacios.”

**Trabajo local.** “La cercanía permite coordinar relevamientos y jornadas de fotografía o video cuando el proyecto los requiere. Las revisiones también pueden hacerse por videollamada.”

**Experiencia.** “En el portfolio podés conocer piezas de comunicación para Rohi Sommiers Carlos Paz y trabajos de branding, edición de video y diseño para la inmobiliaria Noe García Roñoni. Cada caso explica el trabajo realizado; no implica que todos hayan contratado los mismos servicios.”

**Cómo empezar.** “Contanos qué ofrece tu marca, qué materiales tenés y qué querés mejorar. Antes de reunirnos acordamos el formato y el alcance de la primera conversación.”

CTA: **Hablemos de tu marca en Carlos Paz**.

### Sobre nosotros

H1: **Consultora Creativa: el equipo de Quepia**.

“Somos un equipo con base en Villa Carlos Paz que combina estrategia de marca, diseño y producción de contenido. Lautaro López Labrin participa desde la dirección creativa y Camila De Angelis desde la dirección de estrategia, según los roles publicados por Quepia.”

“Trabajamos junto a cada cliente para entender qué necesita comunicar, definir entregables y organizar las revisiones. Buscamos que la identidad, los textos y las imágenes compartan un criterio claro. Podés conocer el alcance de nuestro trabajo en los proyectos publicados.”

CTA: **Conocé nuestros trabajos** y **Contanos tu proyecto**. Confirmar las responsabilidades concretas antes de ampliar las biografías; evitar sustituir experiencia por afirmaciones generales de crecimiento.

### Contacto

“Contanos qué necesita tu marca, en qué ciudad estás y qué materiales tenés. Revisamos tu consulta y coordinamos una primera conversación para definir el alcance.”

“Base: Villa Carlos Paz, Córdoba, Argentina. Reuniones y producciones presenciales: a coordinar según el proyecto. Email: hola@quepia.com. WhatsApp: +54 9 351 718-6433.”

El teléfono corresponde al código y páginas recuperadas hoy; validarlo con el responsable antes de actualizar perfiles externos. No anunciar horarios ni respuesta en 24 horas sin confirmación. Conservar el formulario simple y los campos opcionales existentes.

### Perfiles públicos

Bio breve: **Quepia · Consultora Creativa. Redes sociales, branding y contenido. Villa Carlos Paz, Córdoba. Consultas y trabajos ↓**

Bio ampliada: “Consultora creativa con base en Villa Carlos Paz. Planificación y diseño de contenidos para redes, branding, fotografía y producción audiovisual para marcas de Córdoba. Alcance y entregables a medida de cada proyecto.”

Nombre de perfil: **Quepia Consultora Creativa**, según uso real y reglas del proveedor, sin añadir localidades y servicios artificialmente al nombre.

### Google Business, si es elegible

“Quepia Consultora Creativa tiene base en Villa Carlos Paz, Córdoba. Trabajamos en planificación de contenido orgánico para redes, diseño de publicaciones y redacción, branding e identidad visual, diseño gráfico, fotografía de producto e inmobiliaria, producción audiovisual y diseño de packaging. Coordinamos proyectos con marcas de Córdoba Capital y la provincia. La producción presencial, las locaciones, los traslados y los entregables se acuerdan según el proyecto.”

Este texto evita enlaces, ofertas, promesas y una dirección no comprobada. No publicarlo hasta resolver elegibilidad y ficha existente.

## 6. Plan local y Google Business

No se logró identificar una ficha inequívoca. Primero pedir al responsable enlace directo de Maps o acceso autorizado, buscar variantes de nombre/teléfono y comprobar que no exista una ficha anterior antes de crear otra.

Según la [elegibilidad oficial](https://support.google.com/business/answer/13763036) y las [reglas de representación](https://support.google.com/business/answer/3038177):

| Situación real | Decisión |
|---|---|
| Oficina atendida donde se reciben clientes, señalización permanente y horarios reales | Evaluar ficha con dirección pública, comprobando las condiciones oficiales. Una reunión ocasional en un espacio no acredita sede. |
| Quepia visita clientes para brindar servicios y no los recibe en la base | Evaluar negocio de área de servicio: dirección verdadera para verificación, oculta al público; áreas efectivamente atendidas. |
| Servicio exclusivamente online sin interacción presencial | No elegible para Google Business. Trabajar web, perfiles y referencias. |

Para área de servicio, usar ciudades/zonas reales y razonables desde la base, no toda Argentina ni una dirección prestada. La [guía de áreas](https://support.google.com/business/answer/9157481) permite hasta 20 y orienta a un territorio dentro de unas dos horas de conducción; comprobar cada zona. La cobertura comercial provincial de la web no obliga a declarar la provincia completa en Maps. No recomendar alquiler de oficina para SEO.

Google explica factores de [relevancia, distancia y notoriedad](https://support.google.com/business/answer/7091). Declarar Córdoba Capital como área de servicio no cambia la base real ni garantiza posiciones allí.

**Categorías:** no hay acceso al selector argentino de la ficha. Por eso no se certifica disponibilidad actual de etiquetas. Comprobar allí candidatos como “Diseñador gráfico”, “Agencia de marketing” y “Servicio de producción de vídeo”; elegir como principal la que mejor represente el negocio real. “Agencia de marketing” solo si su interpretación y la oferta de estrategia/contenido encajan; “Agencia de publicidad” no debe elegirse por tráfico si no representa la actividad. No inventar “Consultora Creativa” como categoría. Las secundarias deben representar servicios propios, no capacidades hipotéticas. Registrar los nombres exactos que devuelva el selector, siguiendo la [guía de categorías](https://support.google.com/business/answer/7249669).

**Servicios:** redes y contenido orgánico, branding, diseño gráfico, fotografía, video, packaging y dron sujeto a viabilidad. Detallar producción separada y excluir administración de pauta.

**Materiales:** logo y portada reconocibles; equipo real con permiso; procesos de producción; piezas terminadas y ejemplos con autorización. Fotos de oficina solo si corresponde a un lugar real de atención. No usar renders de una sede ficticia ni fotos de clientes sin permiso.

**Reseñas honestas:** tras una entrega, pedir opinión a todos los clientes elegibles con el mismo criterio, sin seleccionar solo quienes estén satisfechos. Mensaje preparado, no enviado: “Gracias por trabajar con Quepia. Si querés, podés contar tu experiencia en nuestra ficha: [enlace real]. Tu opinión nos ayuda a explicar cómo trabajamos”. Sin incentivos, exigencia de estrellas ni palabras clave. Responder con hechos sin divulgar información privada. Revisar la [política de contenido de Maps](https://support.google.com/contributionpolicy/answer/7400114) antes de implementar.

**Consistencia:** matriz interna con nombre, teléfono vigente, email, dominio, perfil oficial y modalidad; cada dato con fecha y responsable. Actualizar fuentes propias antes de pedir recrawl. No solicitar cambios a terceros sin autorización.

**Bing:** [Bing Places](https://www.bingplaces.com/) redirigió hoy a Bing for Business. Su [ayuda oficial](https://www.bing.com/forbusiness/help/modernExperience?setlang=en) incluye Argentina entre los países admitidos. Es una vía pertinente para representar el negocio en el ecosistema Bing; la sesión no verificó ficha ni elegibilidad particular de Quepia. Comprobar tipo de empresa y ficha existente antes de importar, y revisar duplicados después. Bing Webmaster Tools es útil para el sitio independientemente de esa ficha. Apple Business Connect y asociaciones locales pueden evaluarse después por elegibilidad y uso real; no están verificados aquí. No afirmar que un mapa de ChatGPT proviene exclusivamente de Google Business o de Bing.

## 7. Auditoría técnica y pendientes

La conexión HTTP directa desde el entorno a quepia.com fue rechazada por el proxy (403 CONNECT). Ese rechazo pertenece al entorno, **no al servidor de Quepia**. El navegador de investigación recuperó páginas HTML, pero no robots/sitemap. No se infiere un bloqueo del sitio ni inexistencia de archivos.

| Componente | Verificación de esta sesión | Siguiente comprobación |
|---|---|---|
| HTTPS, HTTP→HTTPS, www/apex | HTTPS recuperable por herramienta web; códigos/redirecciones no comprobados. | Desde red permitida, guardar cadena de respuesta de las cuatro variantes y confirmar una URL principal. |
| robots/sitemap | Fuente `app/robots.ts` permite público y excluye rutas privadas; `app/sitemap.ts` incluye servicios, rubros, zonas y proyectos con UUID. Publicación actual sin verificación directa. | HTTP 200 y contenido correcto; URLs finales, fechas reales y ausencia de privadas. No usar robots como control de acceso. |
| noindex/X-Robots-Tag | Metadata pública index/follow; privadas con headers noindex en configuración. | Revisar respuestas finales; no mezclar disallow con la expectativa de que el bot lea noindex. Privadas deben seguir autenticadas. |
| canonical/títulos/descripciones | Definidos en fuente; metadata específica de servicios y territorios. | Comparar HTML publicado, canonical absoluto, duplicados y páginas elegidas por Google. |
| JavaScript y enlaces | La herramienta recupera textos, FAQ y enlaces; SSR/ISR en Next. | Ver HTML sin JS, hidratación y enlaces a casos/servicios; comparar captura renderizada. |
| Móvil/rendimiento | Auditoría previa del 5/10 contiene verificaciones locales; no se repitieron aquí. | Lighthouse móvil repetido en condiciones iguales y datos de campo CrUX/Search Console si existen. No diagnosticar video/animación sin medir LCP, INP y CLS. |
| Imágenes/alt | Fuente usa galerías e imágenes con descripciones; no inspección completa hoy. | Revisar alt por función, dimensiones, tamaños, carga y errores; decorativas con alt vacío. |
| Search Console/Bing | Sin acceso a propiedades ni datos. | Propiedad verificada, sitemap enviado, inspección de páginas prioritarias y exportaciones de 90 días. |
| JSON-LD | Organization/LocalBusiness/ProfessionalService en layout; Service y FAQPage por página, AboutPage/Person; coherencia parcial revisada en código. | Validar JSON generado y hechos visibles; Rich Results Test cuando aplique y Schema Validator. No garantiza ranking ni rich results; FAQ comerciales tienen visibilidad restringida. |
| Contacto/conversiones | Eventos y controles en fuente; no prueba de entrega a buzón comercial. | Validar destinatario/remitente y envío autorizado; evento único de éxito, sin PII y sin duplicación de etiquetas. |

**Marcado recomendado:** conservar una entidad estable `https://quepia.com/#organization`; usar Organization si no se ha confirmado naturaleza local de atención. Evaluar ProfessionalService/LocalBusiness según operación real, sin cambiar el tipo solo por SEO. Mantener nombre, URL, logo comprobado, email, teléfono actual y `sameAs` solo de perfiles oficiales. El año 2020 existe en fuente, pero no se comprobó documentalmente aquí; validar antes de extender la afirmación. No inventar dirección, coordenadas, horarios, premios o ratings. Service debe apuntar a la entidad y reflejar servicios visibles; no sumar pauta. Revisar la afirmación local de “más de 50 proyectos” antes de repetirla en otros canales.

### Rastreadores de IA

Se revisó documentación oficial vigente durante la sesión:

- [OpenAI](https://developers.openai.com/api/docs/bots): OAI-SearchBot corresponde a búsqueda; GPTBot a posible entrenamiento; sus controles son independientes. ChatGPT-User accede por acciones del usuario y no determina inclusión en búsqueda. Mantener acceso público de búsqueda y comprobar bloqueos del WAF con IPs oficiales, no solo un User-Agent fácilmente falsificable.
- [Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers): Googlebot rastrea búsqueda. Google-Extended controla usos de entrenamiento **y grounding** de determinados productos Gemini; no afecta inclusión ni ranking en Google Search. No tratarlo como un interruptor solo de entrenamiento o solo de búsqueda.
- [Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers): PerplexityBot sirve búsqueda y no entrenamiento de modelos base; Perplexity-User sirve solicitudes del usuario. Comprobar IPs publicadas y reglas de servidor si hay bloqueos reales.
- Bing/Copilot: comprobar acceso de Bingbot y estado de indexación con Bing Webmaster Tools; no hay evidencia aquí de un bloqueo ni garantía de uso en una respuesta.

La regla `*` del código permite las páginas públicas a los bots de búsqueda indicados; no hace falta agregar un grupo específico que pueda perder las exclusiones privadas. **No se modificaron robots ni decisiones de entrenamiento.** Auditar logs y política publicada antes de cualquier cambio. llms.txt ya existe y es complementario; no es requisito ni prueba de que un asistente lo lea. Priorizar contenido público, rastreabilidad y respaldo.

## 8. Cinco casos y referencias externas

Todos los casos tienen evidencia primaria del propio portfolio, no verificación independiente del resultado de negocio. Completar los campos desconocidos con entrevistas al equipo, archivos y autorización del cliente. No publicar objetivos históricos reconstruidos como si estuvieran documentados.

Fichas recuperadas directamente durante esta sesión: [Rohi Sommiers](https://quepia.com/trabajos/rohi-sommiers-f4289b9f-03fa-4b7b-a983-875b3124ecf1), [Hotel Bahía Norte](https://quepia.com/trabajos/hotel-bahia-norte-social-media-6aea1c25-87db-4cc6-be7c-896f9df366c5) y [Mike Donas](https://quepia.com/trabajos/mike-donas-foto-de-producto-ae2a64c7-368b-4330-8520-c8131bffd0cb). Para Noe y AILE se verificó el contenido del portfolio general; conservar sus rutas reales cuando se implemente la ampliación.

| Cliente/sector | Situación y objetivo a validar | Alcance y entregables comprobables | Resultado observable; pendientes |
|---|---|---|---|
| Rohi Sommiers / comercio | Necesidad editorial: comunicar promociones y novedades; confirmar situación previa y objetivo contratado. | Diseño de campañas, descuentos, placas informativas e institucionales para formatos digitales; descripción y galería publicadas. | Sistema de piezas reconocibles; no afirmar ventas. Confirmar fecha, ejecución de publicación y permiso de testimonio. |
| Hotel Bahía Norte / hotelería | Comunicar oferta de temporada; validar calendario y punto de partida. | Piezas y línea visual con fotografía, diseño y mensajes promocionales. | Contenido visual disponible en galería; no atribuir reservas. Confirmar quién fotografió, publicó y atendió consultas, fechas y autorización. |
| Mike Donas / gastronomía | Mostrar producto en canales digitales; validar brief original. | Sesión de foto con dirección de arte gastronómica y versiones para e-commerce/promoción/redes. | Banco de imágenes y adaptaciones observables; no afirmar aumento de pedidos. Confirmar cantidad contratada, fecha y permiso. |
| Noe García Roñoni / inmobiliaria | Necesidad de presentación coherente; validar diagnóstico y objetivo original. | Branding, edición de video y diseño gráfico publicados; no convertir etiquetas en prueba de gestión mensual. | Aplicaciones visibles de identidad; verificar entregables de fotografía por separado y fecha. |
| AILE / institución | Renovación visual; validar razones y requisitos iniciales. | Rediseño de identidad y coherencia entre comunicación institucional y digital. | Identidad y aplicaciones visibles; sin métricas de participación. Confirmar fechas, materiales y testimonio autorizado. |

Estructura de ficha final: cliente/sector → situación documentada → objetivo confirmado → alcance real → trabajo → entregables → resultado verificable → fecha → testimonio autorizado, si existe. Separar siempre resultados de producción y efectos comerciales. Los tres resúmenes existentes pueden conservarse y completarse; no borrarlos para empezar de cero.

**Referencias legítimas:** preparar con cada cliente un caso compartido; proponer créditos cuando corresponda; solicitar enlace desde una página donde el trabajo esté explicado; enlazar al cliente con autorización; mantener Instagram completo y enlazado a casos. Evaluar asociaciones profesionales/comerciales de Carlos Paz y Córdoba si hay participación real, y directorios curados del sector que acepten el perfil pertinente. No se certificó afiliación ni elegibilidad de un directorio concreto. Proponer notas basadas en procesos y proyectos, no rankings autoproducidos. Cada referencia debe tener URL, contexto, fecha, permiso y contacto responsable. No se enviaron solicitudes.

## 9. Plan de 30, 60 y 90 días

Esfuerzo orientativo por equipo, no presupuesto confirmado. Impacto esperado describe una oportunidad, sin posiciones ni ventas garantizadas. Días contados desde el inicio aprobado del plan.

| Plazo | Acción/motivo | Responsable | Dependencia | Esfuerzo | Impacto esperado / comprobación |
|---|---|---|---|---|---|
| 0–30 | H2/H7: cerrar alcance por tarea y revisar FAQ de la rama | Dirección + comercial | Respuestas sobre operación/reportes | 2–4 h | Menos expectativas ambiguas; propuestas y FAQ coincidentes. |
| 0–30 | H1: revisar definición y textos completos; implementar los aprobados | Contenido + desarrollo | Alcance validado | 4–8 h | Mayor claridad; revisión de página y preguntas de visitantes. |
| 0–30 | H4: matriz de identidad y revisión de teléfono/perfiles | Dirección | Acceso a canales | 2–3 h | Contactos por vías correctas; enlaces y datos cotejados. |
| 0–30 | H8/H9: verificar producción, cuentas y línea de base | Desarrollo + analítica | Red y propiedades autorizadas | 4–8 h | Detectar bloqueos o medición incompleta; checklist y exportaciones. |
| 0–30 | H5: documentar Rohi y Bahía Norte | Contenido + responsable de proyecto | Archivos y permisos | 6–10 h | Evidencia de contenido; dos fichas completas. |
| 31–60 | Completar Mike, Noe y AILE; enlazarlos a servicios | Contenido | Brief/fechas/autorización | 8–14 h | Más pruebas de encaje; cinco casos verificables. |
| 31–60 | H4: corregir ficha existente o preparar alta elegible | Dirección + responsable local | Identificación y elegibilidad; autorización externa | 3–6 h + verificación | Mejor representación local; ficha real y consistente. |
| 31–60 | Referencias compartidas y reseñas honestas | Dirección | Autorización para contacto y clientes reales | 3–5 h | Respaldo independiente; URLs y opiniones legítimas. |
| 31–60 | Validar Bing for Business y Webmaster Tools | Desarrollo + dirección | Disponibilidad país/acceso | 2–4 h | Indexación y representación; informe de verificación. |
| 31–60 | Comparar dudas comerciales con FAQ/precios | Comercial + contenido | Registro de consultas | 2–4 h | Mejor comparación de propuestas; dudas frecuentes resueltas. |
| 61–90 | Optimizar las páginas con impresiones y encaje probado | SEO + contenido | Datos de al menos un período comparable | 4–8 h | Más clics relevantes; comparación por servicio y consultas. |
| 61–90 | Ajustar producción/formulario por calidad de leads | Comercial + desarrollo | Leads clasificados y medición válida | 3–6 h | Mejor calificación; tasa de contacto útil, no solo clics. |
| Mensual | Protocolo de 18 consultas en asistentes | SEO | Acceso a plataformas y registro | 2–4 h por ronda | Cambios observables de mención/precisión/fuentes; variabilidad documentada. |

## 10. Sistema de medición

**Línea de base pendiente:** extraer 90 días de Search Console y Bing; separar marca (Quepia y errores habituales) de servicios, país/ciudad cuando la herramienta lo permita y páginas. Registrar clics, impresiones, CTR y posición media solo como métrica del proveedor, no como ranking universal. Inventariar páginas indexables y las efectivamente indexadas por cada buscador. No usar `site:` como conteo completo.

En Analytics, revisar formulario exitoso (`generate_lead`) por separado de `click_whatsapp`, `click_phone` y `click_email`. Validar una sola emisión por envío y ausencia de datos personales. Un clic a WhatsApp no prueba conversación; un envío aceptado por proveedor no prueba oportunidad comercial. Usar un registro de leads con servicio, ciudad, necesidad, canal, encaje, estado y motivo de descarte. Calificado = necesidad dentro de oferta y cobertura, posibilidad de contacto y alcance evaluable; no exigir presupuesto ya definido al primer contacto.

Métricas de negocio: contactos únicos; proporción calificada; solicitudes de propuesta; propuestas aceptadas; plazo hasta respuesta real. Definir deduplicación por conversación con acceso restringido y sin PII en Analytics. Comparar períodos y estacionalidad, anotando cambios del sitio y campañas. No atribuir causalidad a SEO por coincidencia temporal.

Perfil local: registrar vistas/interacciones que provea el panel, clics al sitio, llamadas y solicitudes aplicables. Para tráfico de asistentes, clasificar referrers identificables como chatgpt.com, perplexity.ai, copilot.microsoft.com y gemini.google.com cuando aparezcan; no etiquetar todo “directo” como IA. Conservar UTM legítimas, sin inventar parámetros en enlaces ajenos. Pregunta opcional al contacto: “¿Cómo conociste Quepia?” con respuesta libre. El tráfico referido y las menciones son indicadores diferentes.

### Protocolo mensual de asistentes

Usar los ID de consultas **1, 2, 3, 5, 7, 8, 10, 13, 14, 15, 17, 22, 23, 24, 31, 34, 37 y 43** del CSV: 18 preguntas, conservando su redacción. Hay preguntas sin ubicación explícita para observar qué ciudad infiere cada plataforma y preguntas geográficas de control.

1. Ejecutar cada consulta en conversación nueva en ChatGPT, Gemini, Copilot y Perplexity cuando se tenga acceso. Registrar modelo/versión visible, plan, sesión/incógnito y modalidad; activar búsqueda de forma consistente cuando sea posible y anotar si realmente se usó. No simular acceso a una plataforma.
2. Mantener ubicación y configuración conocidas, respetando privacidad. Registrar ubicación explícita en pregunta, ubicación inferida en respuesta y ubicación disponible al proveedor; no asumir que incógnito elimina geolocalización.
3. Guardar fecha/hora en Argentina, pregunta exacta, respuesta/captura, mención de Quepia, servicios atribuidos, sede, precisión, fuentes citadas, enlace usado y presencia en texto/mapa. Registrar “sin fuente” y “no accesible” por separado.
4. Repetir en una segunda sesión los resultados principales o contradictorios. No regenerar hasta lograr una recomendación deseada. Anotar las repeticiones para no cambiar el denominador silenciosamente.
5. Calcular mención por plataforma e intención, descripción correcta y citas hacia fuentes propias/externas. No convertir orden de lista en posición SEO ni mezclar respuestas con y sin búsqueda.
6. Comparar meses reconociendo cambios del modelo y variabilidad. Una mejora requiere patrón y calidad, acompañados de contactos útiles; una consulta aislada no prueba éxito o fracaso.

La [plantilla de registro](./registro-asistentes.csv) permite iniciar el protocolo. Los campos están vacíos porque no se ejecutaron esas pruebas. Las exportaciones comerciales y de búsqueda deberán incorporarse cuando haya acceso autorizado.

## Implementación en esta rama

Se añadieron seis FAQ específicas a gestión de redes: delegación de contenido, mensajes/comentarios, producción, branding conjunto, diferencia con community management y exclusión de pauta. Usan capacidades publicadas y la decisión editorial existente; no prometen operación diaria no confirmada. El componente existente genera FAQ visible y JSON-LD desde los mismos datos.

Se cambió la descripción SEO de home para priorizar redes, branding y producción de contenido, preservando marca, URLs, diseño y lema. No se modificó teléfono, política de rastreo/entrenamiento, base de datos, perfiles ni producción. Los textos alternativos de este documento son especificaciones de implementación, no cambios ya publicados. La validación de la rama se registra en `VALIDACION.md`.

Validación final: lint de archivos modificados y typecheck aprobados; build de producción aprobado con 50 páginas generadas usando el proxy del entorno. El HTML de redes contiene diez FAQ cuyas preguntas y respuestas coinciden con el JSON-LD; la descripción SEO de home aparece en el HTML generado. Persisten advertencias previas del repositorio fuera de estos cambios. Se verificó con Node 24 disponible; repetir en el runtime Node 22 declarado antes de publicar.
