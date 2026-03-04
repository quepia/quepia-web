"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
    Book,
    ChevronRight,
    LayoutDashboard,
    LayoutGrid,
    Shield,
    Settings,
    Star,
    Bell,
    type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"

type DocSection = {
    id: string
    title: string
    icon: LucideIcon
}

type TabRow = {
    tab: string
    paraQueSirve: string
    quePodesHacer: string
    acceso: string
}

const sections: DocSection[] = [
    { id: "inicio", title: "Inicio", icon: Book },
    { id: "tabs-principales", title: "Pestañas Principales", icon: LayoutDashboard },
    { id: "proyectos", title: "Proyectos y Kanban", icon: LayoutGrid },
    { id: "tabs-admin", title: "Pestañas Admin", icon: Shield },
    { id: "atajos", title: "Accesos Rápidos", icon: Settings },
    { id: "dudas", title: "Dudas Frecuentes", icon: Book },
]

const DOC_SECTION_IDS = new Set(sections.map((section) => section.id))

const mainTabs: TabRow[] = [
    {
        tab: "Dashboard",
        paraQueSirve: "Ver un resumen general del trabajo.",
        quePodesHacer: "Revisar tareas de hoy, vencidas, próximas, actividad reciente y acceso rápido a proyectos.",
        acceso: "Todos",
    },
    {
        tab: "Buscar",
        paraQueSirve: "Encontrar tareas rápido.",
        quePodesHacer: "Buscar por título, descripción o etiquetas y marcar tareas como completadas.",
        acceso: "Todos",
    },
    {
        tab: "Inbox",
        paraQueSirve: "Ver actividad reciente de tareas.",
        quePodesHacer: "Abrir cambios recientes (últimos días), detectar qué se actualizó y entrar al detalle.",
        acceso: "Todos",
    },
    {
        tab: "Hoy",
        paraQueSirve: "Concentrarte en lo urgente del día.",
        quePodesHacer: "Ver tareas vencidas y de hoy, y marcar completadas con un click.",
        acceso: "Todos",
    },
    {
        tab: "Próximo",
        paraQueSirve: "Planificar lo que viene.",
        quePodesHacer: "Ver tareas agrupadas por fecha (hoy, mañana, próximas fechas o sin fecha).",
        acceso: "Todos",
    },
    {
        tab: "Calendario",
        paraQueSirve: "Organizar tareas y eventos por día.",
        quePodesHacer: "Crear eventos manuales, importar eventos con IA, ver tareas por fecha y limpiar eventos del mes.",
        acceso: "Todos",
    },
    {
        tab: "Carga",
        paraQueSirve: "Visualizar carga semanal en horas.",
        quePodesHacer: "Moverte por semanas y abrir tareas desde el calendario de carga.",
        acceso: "Todos",
    },
    {
        tab: "Filtros",
        paraQueSirve: "Filtrar tareas por criterios.",
        quePodesHacer: "Aplicar filtros por prioridad, estado y proyecto (misma base que Buscar).",
        acceso: "Todos",
    },
    {
        tab: "Completado",
        paraQueSirve: "Revisar lo ya terminado.",
        quePodesHacer: "Ver tareas completadas por periodo y reabrirlas si hace falta.",
        acceso: "Todos",
    },
    {
        tab: "Portafolios",
        paraQueSirve: "Ver avance por carpeta y cliente.",
        quePodesHacer: "Comparar progreso, vencimientos y horas; abrir un proyecto desde esa vista.",
        acceso: "Todos",
    },
    {
        tab: "Documentación",
        paraQueSirve: "Consultar cómo usar el sistema.",
        quePodesHacer: "Leer esta guía, entender cada pestaña y resolver dudas de uso diario.",
        acceso: "Todos",
    },
]

const adminTabs: TabRow[] = [
    {
        tab: "CRM",
        paraQueSirve: "Gestionar leads y oportunidades.",
        quePodesHacer: "Mover leads entre etapas, editar datos, crear propuesta y crear proyecto desde el lead.",
        acceso: "Solo admin",
    },
    {
        tab: "Propuestas",
        paraQueSirve: "Armar y enviar propuestas comerciales.",
        quePodesHacer: "Crear propuestas con secciones/items/precios, usar plantillas, generar borrador con IA, enviar y copiar link.",
        acceso: "Solo admin",
    },
    {
        tab: "Contabilidad",
        paraQueSirve: "Control financiero del negocio.",
        quePodesHacer: "Gestionar cuentas, pagos, gastos, aportes, inversiones, historial, categorías y gráficos.",
        acceso: "Solo admin",
    },
    {
        tab: "Efemérides",
        paraQueSirve: "Planificar fechas clave por cliente.",
        quePodesHacer: "Crear/importar efemérides, ver estado por proyecto y subir assets para generar tareas.",
        acceso: "Solo admin",
    },
    {
        tab: "Usuarios",
        paraQueSirve: "Administrar equipo y permisos.",
        quePodesHacer: "Invitar usuarios, cambiar roles y eliminar accesos.",
        acceso: "Solo admin",
    },
    {
        tab: "Portfolio",
        paraQueSirve: "Administrar proyectos del sitio público.",
        quePodesHacer: "Crear/editar/eliminar proyectos del portfolio web, categorías, orden e imágenes.",
        acceso: "Solo admin",
    },
    {
        tab: "Servicios",
        paraQueSirve: "Administrar servicios comerciales.",
        quePodesHacer: "Crear/editar/eliminar servicios, icono, descripción, features y orden.",
        acceso: "Solo admin",
    },
    {
        tab: "Equipo",
        paraQueSirve: "Administrar miembros del equipo del sitio.",
        quePodesHacer: "Crear/editar perfiles, imagen, rol, bio, redes y visibilidad.",
        acceso: "Solo admin",
    },
    {
        tab: "Configuración",
        paraQueSirve: "Editar textos y datos del sitio.",
        quePodesHacer: "Actualizar información de contacto, redes, horarios y contenido global por categorías.",
        acceso: "Solo admin",
    },
]

export function DocsView() {
    const searchParams = useSearchParams()
    const [activeSection, setActiveSection] = useState(() => {
        const fromUrl = searchParams.get("docs")
        return fromUrl && DOC_SECTION_IDS.has(fromUrl) ? fromUrl : "inicio"
    })

    useEffect(() => {
        const fromUrl = searchParams.get("docs")
        const nextSection = fromUrl && DOC_SECTION_IDS.has(fromUrl) ? fromUrl : "inicio"
        if (nextSection !== activeSection) {
            setActiveSection(nextSection)
        }
    }, [activeSection, searchParams])

    const handleSectionChange = (sectionId: string) => {
        setActiveSection(sectionId)

        if (typeof window !== "undefined") {
            const url = new URL(window.location.href)
            url.searchParams.set("view", "docs")
            url.searchParams.set("docs", sectionId)
            window.history.replaceState({}, "", url)
        }
    }

    return (
        <div className="flex bg-[#0a0a0a] text-white h-full overflow-hidden">
            {/* Docs Sidebar */}
            <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0">
                <div className="p-6 border-b border-white/[0.06]">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Book className="h-5 w-5 text-quepia-cyan" />
                        Documentación
                    </h2>
                    <p className="text-xs text-white/40 mt-1">Guía de uso real para el equipo</p>
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {sections.map(section => (
                        <button
                            key={section.id}
                            onClick={() => handleSectionChange(section.id)}
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
                {activeSection === "inicio" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Cómo usar el sistema</h1>
                        <p className="text-white/60 leading-relaxed">
                            Esta guía describe el uso real del sistema para una persona de equipo en el día a día.
                            La idea es que sepas <strong className="text-white">qué hace cada pestaña</strong> y en qué momento conviene usarla.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Qué ve un usuario normal</h3>
                                <p className="text-sm text-white/50">
                                    Dashboard, búsqueda, calendario, tareas por fecha, carga, completadas, portafolios y proyectos en Kanban.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Qué agrega un admin</h3>
                                <p className="text-sm text-white/50">
                                    CRM, propuestas, contabilidad, efemérides y paneles de administración de usuarios/contenido.
                                </p>
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Flujo recomendado (rápido)</h2>
                        <ol className="list-decimal list-inside text-white/60 space-y-2 ml-2">
                            <li>Empieza en <strong className="text-white">Dashboard</strong> para ver el estado general.</li>
                            <li>Revisa <strong className="text-white">Hoy</strong> y <strong className="text-white">Próximo</strong>.</li>
                            <li>Abre tu cliente/proyecto desde <strong className="text-white">Proyectos</strong> y trabaja en Kanban.</li>
                            <li>Usa <strong className="text-white">Calendario</strong> para planificar entregas y eventos.</li>
                        </ol>
                    </div>
                )}

                {activeSection === "tabs-principales" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Pestañas Principales</h1>
                        <p className="text-white/60 leading-relaxed">
                            Estas pestañas aparecen en el menú lateral para cualquier usuario. Cada una tiene un objetivo distinto.
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Pestaña</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Para qué sirve</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Qué podés hacer</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Acceso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    {mainTabs.map((row) => (
                                        <tr key={row.tab}>
                                            <td className="p-3 text-white font-medium">{row.tab}</td>
                                            <td className="p-3 text-white/50">{row.paraQueSirve}</td>
                                            <td className="p-3 text-white/50">{row.quePodesHacer}</td>
                                            <td className="p-3 text-white/40">{row.acceso}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                            <p className="text-sm text-white/60">
                                Nota: <strong className="text-white">Buscar</strong> y <strong className="text-white">Filtros</strong> usan la misma vista,
                                pero &quot;Filtros&quot; está pensada para entrar directo al filtrado por prioridad, estado o proyecto.
                            </p>
                        </div>
                    </div>
                )}

                {activeSection === "proyectos" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Proyectos y Kanban</h1>
                        <p className="text-white/60 leading-relaxed">
                            Cuando abres un proyecto desde el bloque <strong className="text-white">Proyectos</strong> del sidebar,
                            entras a su tablero Kanban.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Cómo se trabaja en un proyecto</h2>
                        <ol className="list-decimal list-inside text-white/60 space-y-3 ml-2">
                            <li>Selecciona el proyecto en el sidebar (o en Favoritos).</li>
                            <li>Crea tareas con el botón <strong className="text-white">Agregar tarea</strong> en la columna correspondiente.</li>
                            <li>Mueve tareas entre columnas arrastrando (si no hay bloqueos).</li>
                            <li>Abre una tarea para editar su detalle completo.</li>
                        </ol>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Qué puedes hacer dentro de una tarea</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Edición principal</h3>
                                <p className="text-sm text-white/50">
                                    Título, descripción, links, comentarios, subtareas, etiquetas y dependencias.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Organización</h3>
                                <p className="text-sm text-white/50">
                                    Responsable, prioridad, fecha, deadline, tipo de tarea y horas estimadas.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Assets</h3>
                                <p className="text-sm text-white/50">
                                    Subir archivos, enviar a revisión y seguir estado de aprobación.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Control de tablero</h3>
                                <p className="text-sm text-white/50">
                                    Mostrar/ocultar completadas, limpiar completadas y configurar límites WIP por columna.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                            <p className="text-sm text-white/60">
                                Si no puedes mover una tarea a otra columna, normalmente es por alguno de estos controles:
                                límite WIP de la columna, subtareas bloqueantes sin completar o dependencias pendientes.
                            </p>
                        </div>
                    </div>
                )}

                {activeSection === "tabs-admin" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Pestañas de Administración</h1>
                        <p className="text-white/60 leading-relaxed">
                            Estas pestañas aparecen solo en cuentas con rol admin.
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="bg-white/[0.04]">
                                        <th className="text-left p-3 text-white/70 font-medium">Pestaña</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Para qué sirve</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Qué podés hacer</th>
                                        <th className="text-left p-3 text-white/70 font-medium">Acceso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    {adminTabs.map((row) => (
                                        <tr key={row.tab}>
                                            <td className="p-3 text-white font-medium">{row.tab}</td>
                                            <td className="p-3 text-white/50">{row.paraQueSirve}</td>
                                            <td className="p-3 text-white/50">{row.quePodesHacer}</td>
                                            <td className="p-3 text-white/40">{row.acceso}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Detalle útil: Contabilidad</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {["Cuentas", "Pagos", "Gastos", "Aportes", "Inversiones", "Historial", "Categorías", "Gráficos"].map((item) => (
                                <div key={item} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/65">
                                    {item}
                                </div>
                            ))}
                        </div>
                        <p className="text-sm text-white/45">
                            La pestaña <strong className="text-white">Portafolios</strong> (general) muestra avance de trabajo;
                            la pestaña <strong className="text-white">Portfolio</strong> (admin) gestiona el contenido del sitio público.
                        </p>
                    </div>
                )}

                {activeSection === "atajos" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Accesos Rápidos</h1>
                        <p className="text-white/60 leading-relaxed">
                            Además de las pestañas, hay accesos que aceleran tareas frecuentes.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Barra lateral (parte superior)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2 flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Configuración
                                </h3>
                                <p className="text-sm text-white/50">
                                    Abre preferencias de notificaciones (email, avisos in-app y frecuencia).
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2 flex items-center gap-2">
                                    <Book className="h-4 w-4" />
                                    Documentación
                                </h3>
                                <p className="text-sm text-white/50">
                                    Te trae a esta guía en cualquier momento.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2 flex items-center gap-2">
                                    <Bell className="h-4 w-4" />
                                    Inbox rápido
                                </h3>
                                <p className="text-sm text-white/50">
                                    Acceso directo a actividad reciente sin buscar en el menú.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2 flex items-center gap-2">
                                    <Star className="h-4 w-4" />
                                    Favoritos
                                </h3>
                                <p className="text-sm text-white/50">
                                    Marca proyectos para acceder más rápido desde el bloque &quot;Favoritos&quot;.
                                </p>
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Menú contextual de proyectos</h2>
                        <p className="text-white/60">
                            Con click derecho sobre un proyecto puedes: <strong className="text-white">editar</strong>,
                            <strong className="text-white"> gestionar miembros</strong>, <strong className="text-white">agregar/quitar favoritos</strong> o <strong className="text-white">eliminar</strong>.
                        </p>

                        <h2 className="text-xl font-semibold mt-8 mb-4">Encabezado superior</h2>
                        <p className="text-white/60">
                            Incluye cambio de tema claro/oscuro, acceso a brief y perfil de cliente, y acciones rápidas en móvil.
                        </p>
                    </div>
                )}

                {activeSection === "dudas" && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold mb-4">Dudas Frecuentes</h1>

                        <div className="space-y-4">
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">No veo una pestaña del menú</h3>
                                <p className="text-sm text-white/50">
                                    Puede ser por permisos. Las pestañas con funciones de gestión avanzadas son solo para admin.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Inbox no es chat, ¿qué muestra?</h3>
                                <p className="text-sm text-white/50">
                                    Muestra actividad reciente de tareas (actualizaciones y cambios), no conversaciones tipo mensajería.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">¿Por qué no puedo mover una tarea?</h3>
                                <p className="text-sm text-white/50">
                                    Revisa límite WIP de la columna destino, dependencias pendientes o subtareas bloqueantes sin completar.
                                </p>
                            </div>
                            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                                <h3 className="font-semibold text-quepia-cyan mb-2">Buscar y Filtros parecen iguales</h3>
                                <p className="text-sm text-white/50">
                                    Sí, usan la misma vista base. Filtros está orientado a trabajar por prioridad, estado o proyecto.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
