"use client"

import { useState } from "react"
import { Book, ChevronRight, Layout, Users, Settings, Rocket, Database, Palette, FileText, Briefcase } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

export function DocsView() {
    const [activeSection, setActiveSection] = useState("vision")

    const sections = [
        { id: "vision", title: "Visión General", icon: Book },
        { id: "arquitectura", title: "Arquitectura", icon: Database },
        { id: "inicio", title: "Inicio Rápido", icon: Rocket },
        { id: "auth", title: "Autenticación", icon: Users },
        { id: "kanban", title: "Dashboard y Kanban", icon: Layout },
        { id: "tareas", title: "Gestión de Tareas", icon: FileText },
        { id: "sidebar", title: "Barra Lateral", icon: Settings },
        { id: "header", title: "Encabezado Superior", icon: Layout },
        { id: "flujos", title: "Guía de Uso", icon: Briefcase },
        { id: "datos", title: "Estructura de Datos", icon: Database },
        { id: "personalizacion", title: "Personalización", icon: Palette },
    ]

    return (
        <div className="flex bg-[#0a0a0a] text-white h-full overflow-hidden">
            {/* Docs Sidebar */}
            <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0">
                <div className="p-6 border-b border-white/[0.06]">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Book className="h-5 w-5 text-quepia-cyan" />
                        Documentación
                    </h2>
                    <p className="text-xs text-white/40 mt-1">Sistema de Gestión de Proyectos</p>
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                                activeSection === section.id
                                    ? "bg-white/[0.08] text-white"
                                    : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                            )}
                        >
                            <section.icon className={cn("h-4 w-4", activeSection === section.id ? "text-quepia-cyan" : "text-white/30")} />
                            <span>{section.title}</span>
                            {activeSection === section.id && <ChevronRight className="h-3 w-3 ml-auto text-white/30" />}
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-white/[0.06]">
                    <p className="text-[10px] text-white/25 text-center">v0.1.0 (MVP) — Quepia Creative Systems</p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
                {activeSection === "vision" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Sistema de Gestión de Proyectos</h1>
                        <p className="text-white/60 leading-relaxed">
                            El <strong className="text-white">Sistema de Gestión de Proyectos de Quepia</strong> es una aplicación web diseñada para equipos creativos que necesitan organizar y gestionar proyectos de marketing digital, redes sociales y comunicación. El sistema utiliza una metodología <strong className="text-white">Kanban</strong> para visualizar el flujo de trabajo a través de columnas que representan diferentes etapas del proceso.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Características Principales</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Autenticación Segura</h3>
                                <p className="text-sm text-white/50">Inicio de sesión y registro seguro con Supabase Auth.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-2">Tablero Kanban</h3>
                                <p className="text-sm text-white/50">Tablero intuitivo con 4 columnas de trabajo para visualizar el flujo.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Gestión Detallada</h3>
                                <p className="text-sm text-white/50">Tareas con subtareas, links, prioridades y asignaciones.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-2">Navegación Jerárquica</h3>
                                <p className="text-sm text-white/50">Proyectos y clientes organizados en estructura de árbol.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Diseño Premium</h3>
                                <p className="text-sm text-white/50">Tema oscuro moderno con animaciones fluidas.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-2">Interfaz Responsive</h3>
                                <p className="text-sm text-white/50">Adaptable a diferentes tamaños de pantalla.</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "arquitectura" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Arquitectura del Sistema</h1>

                        <h2 className="text-xl font-semibold mb-4">Tecnologías Utilizadas</h2>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Componente</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Tecnología</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    <tr><td className="p-3 text-white/50">Framework</td><td className="p-3 text-white">Next.js 16 (App Router)</td></tr>
                                    <tr><td className="p-3 text-white/50">Frontend</td><td className="p-3 text-white">React 19 + TypeScript</td></tr>
                                    <tr><td className="p-3 text-white/50">Estilos</td><td className="p-3 text-white">Tailwind CSS 4</td></tr>
                                    <tr><td className="p-3 text-white/50">Autenticación</td><td className="p-3 text-white">Supabase Auth</td></tr>
                                    <tr><td className="p-3 text-white/50">Iconos</td><td className="p-3 text-white">Lucide React</td></tr>
                                    <tr><td className="p-3 text-white/50">Animaciones</td><td className="p-3 text-white">Framer Motion</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Estructura de Archivos</h2>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 font-mono text-sm text-white/60 leading-relaxed">
                            <pre>{`app/
├── (auth)/
│   └── login/
│       ├── page.tsx           # Página de login/registro
│       └── server-actions.ts  # Acciones de autenticación
├── auth/callback/route.ts     # Callback de OAuth
├── sistema/
│   └── page.tsx               # Dashboard principal
├── globals.css                # Estilos globales
├── layout.tsx                 # Layout raíz
└── page.tsx                   # Página de inicio

components/sistema/quepia/
├── app-sidebar.tsx            # Barra lateral de navegación
├── kanban-board.tsx           # Tablero Kanban
├── task-detail-modal.tsx      # Modal de detalle de tarea
├── top-header.tsx             # Encabezado superior
├── docs-view.tsx              # Vista de documentación
├── dashboard-overview.tsx     # Vista general
├── calendar-view.tsx          # Vista de calendario
└── ...                        # Más componentes

lib/supabase/
├── client.ts                  # Cliente Supabase (browser)
├── middleware.ts              # Middleware de sesión
└── server.ts                  # Cliente Supabase (server)`}</pre>
                        </div>
                    </div>
                )}

                {activeSection === "inicio" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Guía de Inicio Rápido</h1>

                        <h2 className="text-xl font-semibold mb-4">Instalación</h2>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 font-mono text-sm text-white/70 space-y-2">
                            <p className="text-white/40"># Instalar dependencias</p>
                            <p>npm install</p>
                            <br />
                            <p className="text-white/40"># Configurar variables de entorno</p>
                            <p className="text-white/40"># Crear archivo .env.local con:</p>
                            <p>NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase</p>
                            <p>NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key</p>
                            <br />
                            <p className="text-white/40"># Iniciar servidor de desarrollo</p>
                            <p>npm run dev</p>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Acceso al Sistema</h2>
                        <ol className="list-decimal list-inside text-white/60 space-y-3 ml-2">
                            <li>Abrir <code className="bg-white/[0.08] px-2 py-0.5 rounded text-quepia-cyan text-sm">http://localhost:3000</code> en el navegador</li>
                            <li>En la página de login, ingresar credenciales o registrarse</li>
                            <li>Serás redirigido al Dashboard automáticamente</li>
                        </ol>
                    </div>
                )}

                {activeSection === "auth" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Autenticación</h1>
                        <p className="text-xs text-white/30 mb-4">app/(auth)/login/page.tsx</p>

                        <p className="text-white/60 leading-relaxed">
                            El sistema de autenticación permite a los usuarios iniciar sesión o registrarse en la plataforma. Utiliza Supabase Auth para gestionar sesiones de forma segura.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Componentes Visuales</h2>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2">
                            <li><strong className="text-white">Formulario de login</strong> con campos de email y contraseña</li>
                            <li><strong className="text-white">Botón &quot;Iniciar Sesión&quot;</strong> — Para usuarios existentes</li>
                            <li><strong className="text-white">Botón &quot;Registrarse&quot;</strong> — Para nuevos usuarios</li>
                            <li><strong className="text-white">Diseño visual</strong> con efectos de gradiente y glassmorphism</li>
                        </ul>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Cuándo Usar</h2>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2">
                            <li>Al acceder por primera vez al sistema</li>
                            <li>Cuando la sesión expire</li>
                            <li>Para cambiar de cuenta de usuario</li>
                        </ul>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Flujo de Uso</h2>
                        <ol className="list-decimal list-inside text-white/60 space-y-2 ml-2">
                            <li>Ingresar email válido</li>
                            <li>Ingresar contraseña (mínimo 6 caracteres)</li>
                            <li>Click en &quot;Iniciar Sesión&quot; o &quot;Registrarse&quot;</li>
                            <li>El sistema redirige automáticamente al Dashboard</li>
                        </ol>
                    </div>
                )}

                {activeSection === "kanban" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Dashboard y Vista Kanban</h1>
                        <p className="text-xs text-white/30 mb-4">app/sistema/page.tsx — components/sistema/quepia/kanban-board.tsx</p>

                        <p className="text-white/60 leading-relaxed">
                            El Dashboard es la vista principal del sistema, presentando un tablero Kanban que visualiza el flujo de trabajo del equipo. Las tareas se organizan en columnas que representan etapas del proceso creativo.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Columnas del Kanban</h2>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Columna</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Propósito</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Uso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    <tr>
                                        <td className="p-3 text-white font-medium">Planificación</td>
                                        <td className="p-3 text-white/50">Ideas y material base por producir</td>
                                        <td className="p-3 text-white/50">Recursos, links de Drive, plantillas</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 text-white font-medium">Material a Producir</td>
                                        <td className="p-3 text-white/50">Contenido en producción</td>
                                        <td className="p-3 text-white/50">Tareas activas siendo trabajadas</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 text-white font-medium">Edición</td>
                                        <td className="p-3 text-white/50">Material en revisión/edición</td>
                                        <td className="p-3 text-white/50">Contenido que necesita ajustes</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 text-white font-medium">Listo para Publicar</td>
                                        <td className="p-3 text-white/50">Contenido aprobado</td>
                                        <td className="p-3 text-white/50">Material finalizado</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Interacciones</h2>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2">
                            <li><strong className="text-white">Click en tarea</strong> — Abre el modal de detalle</li>
                            <li><strong className="text-white">Hover</strong> — Efecto de sombra y elevación</li>
                            <li><strong className="text-white">Scroll horizontal</strong> — Navegar entre columnas</li>
                            <li><strong className="text-white">Botón &quot;Add task&quot;</strong> — Agregar nueva tarea a la columna</li>
                        </ul>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Cuándo Usar</h2>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2">
                            <li><strong className="text-white">Vista diaria</strong> del equipo para ver el estado de proyectos</li>
                            <li><strong className="text-white">Reuniones de seguimiento</strong> para actualizar estados</li>
                            <li><strong className="text-white">Planificación</strong> de nuevas tareas y asignaciones</li>
                        </ul>
                    </div>
                )}

                {activeSection === "tareas" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Gestión de Tareas</h1>
                        <p className="text-xs text-white/30 mb-4">components/sistema/quepia/task-detail-modal.tsx</p>

                        <p className="text-white/60 leading-relaxed">
                            El modal de detalle de tarea permite ver y gestionar toda la información relacionada con una tarea específica, incluyendo subtareas, comentarios, links y metadatos.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Secciones del Modal</h2>

                        <h3 className="text-lg font-semibold text-quepia-cyan mb-3">Header</h3>
                        <ul className="list-disc list-inside text-white/60 space-y-1 ml-2 mb-6">
                            <li><strong className="text-white">Breadcrumb:</strong> Proyecto / Sección</li>
                            <li><strong className="text-white">Navegación:</strong> Flechas para tarea anterior/siguiente</li>
                            <li><strong className="text-white">Acciones:</strong> Menú de opciones y cierre</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-quepia-cyan mb-3">Contenido Principal</h3>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2 mb-6">
                            <li><strong className="text-white">Título:</strong> Campo editable del nombre de la tarea</li>
                            <li><strong className="text-white">Links Relacionados:</strong> URLs clickeables que se abren en nueva pestaña</li>
                            <li><strong className="text-white">Descripción:</strong> Campo &quot;PRINCIPAL&quot; para notas importantes</li>
                            <li><strong className="text-white">Sub-tareas:</strong> Indicador de progreso, checkboxes, botón para agregar</li>
                            <li><strong className="text-white">Comentarios:</strong> Campo de entrada con soporte para adjuntos</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-quepia-cyan mb-3">Barra Lateral del Modal</h3>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Campo</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Descripción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    <tr><td className="p-3 text-white">Project</td><td className="p-3 text-white/50">Proyecto y sección asignados</td></tr>
                                    <tr><td className="p-3 text-white">Assignee</td><td className="p-3 text-white/50">Persona asignada a la tarea</td></tr>
                                    <tr><td className="p-3 text-white">Date</td><td className="p-3 text-white/50">Fecha de inicio</td></tr>
                                    <tr><td className="p-3 text-white">Deadline</td><td className="p-3 text-white/50">Fecha límite</td></tr>
                                    <tr><td className="p-3 text-white">Priority</td><td className="p-3 text-white/50">Prioridad (P1-P4)</td></tr>
                                    <tr><td className="p-3 text-white">Labels</td><td className="p-3 text-white/50">Etiquetas de categorización</td></tr>
                                    <tr><td className="p-3 text-white">Reminders</td><td className="p-3 text-white/50">Recordatorios configurados</td></tr>
                                    <tr><td className="p-3 text-white">Location</td><td className="p-3 text-white/50">Ubicación (si aplica)</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Prioridades</h2>
                        <div className="flex gap-3">
                            <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
                                <span className="font-bold text-red-400">P1</span> <span className="text-white/50">Urgente</span>
                            </div>
                            <div className="px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm">
                                <span className="font-bold text-orange-400">P2</span> <span className="text-white/50">Alta</span>
                            </div>
                            <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
                                <span className="font-bold text-yellow-400">P3</span> <span className="text-white/50">Media</span>
                            </div>
                            <div className="px-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm">
                                <span className="font-bold text-white/40">P4</span> <span className="text-white/50">Baja</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "sidebar" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Barra Lateral (Sidebar)</h1>
                        <p className="text-xs text-white/30 mb-4">components/sistema/quepia/app-sidebar.tsx</p>

                        <p className="text-white/60 leading-relaxed">
                            La barra lateral proporciona navegación principal al sistema, acceso a diferentes vistas y gestión de proyectos.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Menú Principal</h2>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Opción</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Función</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    <tr><td className="p-3 text-white">Search</td><td className="p-3 text-white/50">Búsqueda global</td></tr>
                                    <tr><td className="p-3 text-white">Inbox</td><td className="p-3 text-white/50">Notificaciones y mensajes</td></tr>
                                    <tr><td className="p-3 text-white">Today</td><td className="p-3 text-white/50">Tareas del día</td></tr>
                                    <tr><td className="p-3 text-white">Upcoming</td><td className="p-3 text-white/50">Próximas tareas</td></tr>
                                    <tr><td className="p-3 text-white">Filters &amp; Labels</td><td className="p-3 text-white/50">Filtros avanzados</td></tr>
                                    <tr><td className="p-3 text-white">Completed</td><td className="p-3 text-white/50">Tareas completadas</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Favoritos</h2>
                        <p className="text-white/60">Acceso rápido a vistas guardadas. Hacé click en la estrella de un proyecto para agregarlo a favoritos.</p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Mis Proyectos</h2>
                        <p className="text-white/60 mb-4">Estructura jerárquica de proyectos:</p>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 font-mono text-sm text-white/60 leading-relaxed">
                            <pre>{`📁 Quepia Consultora/
  📁 Noe - Redes/
    # Inmobiliaria - Noe Garcia (4)
    # Concejo y PRO - Noe G...
  📁 Quepia/
    # Interno Quepia (6)`}</pre>
                        </div>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2 mt-4">
                            <li><strong className="text-white">Carpetas</strong> pueden expandirse/colapsarse</li>
                            <li><strong className="text-white">Proyectos (#)</strong> muestran contador de tareas</li>
                            <li><strong className="text-white">Click derecho</strong> para editar, favoritos o eliminar</li>
                        </ul>
                    </div>
                )}

                {activeSection === "header" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Encabezado Superior</h1>
                        <p className="text-xs text-white/30 mb-4">components/sistema/quepia/top-header.tsx</p>

                        <p className="text-white/60 leading-relaxed">
                            El encabezado superior proporciona navegación contextual y acciones colaborativas para el proyecto actual.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Navegación</h2>
                        <ul className="list-disc list-inside text-white/60 space-y-2 ml-2">
                            <li><strong className="text-white">Flechas (← →)</strong> para navegar entre vistas</li>
                            <li><strong className="text-white">Breadcrumb:</strong> Muestra la ruta actual (ej. Quepia Consultora / Noe - Redes)</li>
                        </ul>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Acciones</h2>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Botón</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Función</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    <tr><td className="p-3 text-white">Share</td><td className="p-3 text-white/50">Compartir proyecto con equipo</td></tr>
                                    <tr><td className="p-3 text-white">Analytics</td><td className="p-3 text-white/50">Ver estadísticas del proyecto</td></tr>
                                    <tr><td className="p-3 text-white">Comments</td><td className="p-3 text-white/50">Comentarios del proyecto</td></tr>
                                    <tr><td className="p-3 text-white">More</td><td className="p-3 text-white/50">Opciones adicionales</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeSection === "flujos" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Guía de Uso por Funcionalidad</h1>

                        <h2 className="text-xl font-semibold mb-4">Flujo de Trabajo Típico</h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">1. Crear una Nueva Tarea</h3>
                                <p className="text-sm text-white/50 font-mono">Sidebar → Click &quot;Add task&quot; → Seleccionar columna → Completar detalles → Guardar</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">2. Mover Tarea entre Columnas</h3>
                                <p className="text-sm text-white/50 font-mono">Kanban → Click en tarea → Actualizar estado en sidebar del modal</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">3. Asignar Tarea</h3>
                                <p className="text-sm text-white/50 font-mono">Modal de tarea → Sidebar &quot;Assignee&quot; → Seleccionar miembro → Confirmar</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">4. Agregar Subtareas</h3>
                                <p className="text-sm text-white/50 font-mono">Modal → Sección &quot;Sub-tasks&quot; → Click &quot;Add sub-task&quot; → Escribir nombre</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">5. Establecer Prioridad</h3>
                                <p className="text-sm text-white/50 font-mono">Modal → Sidebar &quot;Priority&quot; → Seleccionar P1, P2, P3 o P4</p>
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Casos de Uso Específicos</h2>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-3">Para Gerentes de Proyecto</h3>
                                <ol className="list-decimal list-inside text-sm text-white/50 space-y-1">
                                    <li>Usar <strong className="text-white">vista Today</strong> para daily standups</li>
                                    <li>Revisar <strong className="text-white">analytics</strong> para reportes de progreso</li>
                                    <li>Asignar tareas mediante el modal de detalle</li>
                                    <li>Usar <strong className="text-white">filtros</strong> para ver tareas por prioridad</li>
                                </ol>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-3">Para Creadores de Contenido</h3>
                                <ol className="list-decimal list-inside text-sm text-white/50 space-y-1">
                                    <li>Revisar columna <strong className="text-white">Material a Producir</strong></li>
                                    <li>Acceder a <strong className="text-white">links de Drive</strong> desde las tareas</li>
                                    <li>Completar <strong className="text-white">subtareas</strong> de producción</li>
                                    <li>Mover tareas a <strong className="text-white">Edición</strong> cuando terminen</li>
                                </ol>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-magenta mb-3">Para Editores</h3>
                                <ol className="list-decimal list-inside text-sm text-white/50 space-y-1">
                                    <li>Monitorear columna <strong className="text-white">Edición</strong></li>
                                    <li>Revisar <strong className="text-white">descripciones</strong> para lineamientos</li>
                                    <li>Usar <strong className="text-white">comentarios</strong> para feedback</li>
                                    <li>Mover a <strong className="text-white">Listo para Publicar</strong> al aprobar</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "datos" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Estructura de Datos</h1>

                        <h2 className="text-xl font-semibold mb-4">Tipos de Datos Principales</h2>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 font-mono text-sm text-white/60 leading-relaxed">
                            <pre>{`// Tarea
interface Task {
    id: string
    title: string
    description?: string
    link?: string
    assignee?: { name: string; avatar?: string }
    priority?: "P1" | "P2" | "P3" | "P4"
    labels?: string[]
    subtasks?: { total: number; completed: number }
}

// Columna del Kanban
interface Column {
    id: string
    title: string
    count: number
    tasks: Task[]
}

// Proyecto
interface Project {
    id: string
    name: string
    color?: string
    icon?: "folder" | "hash"
    count?: number
    children?: Project[]
}

// Subtarea
interface SubTask {
    id: string
    title: string
    completed: boolean
    assignee?: { name: string; avatar?: string }
}`}</pre>
                        </div>
                    </div>
                )}

                {activeSection === "personalizacion" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Personalización</h1>

                        <h2 className="text-xl font-semibold mb-4">Temas</h2>
                        <p className="text-white/60 mb-4">El sistema utiliza CSS variables para el tema. Los colores principales son:</p>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 font-mono text-sm text-white/60 leading-relaxed">
                            <pre>{`--quepia-magenta: #c026d3;    /* Gradient start */
--quepia-cyan: #2ae7e4;       /* Gradient end / Accent */
--quepia-purple: #8b5cf6;     /* Secondary accent */
--background: #050505;        /* Dark background */`}</pre>
                        </div>

                        <div className="flex gap-3 mt-4">
                            <div className="w-16 h-16 rounded-xl bg-[#c026d3] flex items-center justify-center text-xs font-mono">magenta</div>
                            <div className="w-16 h-16 rounded-xl bg-[#2ae7e4] flex items-center justify-center text-xs font-mono text-black">cyan</div>
                            <div className="w-16 h-16 rounded-xl bg-[#8b5cf6] flex items-center justify-center text-xs font-mono">purple</div>
                            <div className="w-16 h-16 rounded-xl bg-[#050505] border border-white/10 flex items-center justify-center text-xs font-mono">bg</div>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Extensión de Funcionalidades</h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Agregar nuevas columnas al Kanban</h3>
                                <p className="text-sm text-white/50 mb-2">Editar el archivo del dashboard y agregar un nuevo objeto Column.</p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Agregar nuevos proyectos</h3>
                                <p className="text-sm text-white/50 mb-2">Los proyectos se gestionan desde la barra lateral con el botón (+).</p>
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Estado Actual (MVP)</h2>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-400">✓</span>
                                <span className="text-white/60">Interfaz completa funcional</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-400">✓</span>
                                <span className="text-white/60">Integración con Supabase</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-400">✓</span>
                                <span className="text-white/60">Autenticación segura</span>
                            </div>
                        </div>

                        <h3 className="text-lg font-semibold text-white/80 mt-6 mb-3">Próximas Funcionalidades</h3>
                        <ol className="list-decimal list-inside text-white/50 space-y-1 ml-2 text-sm">
                            <li>Drag &amp; drop nativo entre columnas</li>
                            <li>Filtros y búsqueda avanzada</li>
                            <li>Notificaciones en tiempo real</li>
                            <li>Modo offline</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    )
}
