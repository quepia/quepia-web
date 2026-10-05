// Correcciones de presentación; no escribe en Supabase.
const accents: Record<string, string> = {"cromatica": "cromática", "produccion": "producción", "fotografica": "fotográfica", "iluminacion": "iluminación", "catalogo": "catálogo", "diseno": "diseño", "fotografia": "fotografía", "asuncion": "asunción", "bahia": "bahía", "sesion": "sesión", "direccion": "dirección", "gastronomica": "gastronómica", "arquitectonica": "arquitectónica", "fotografico": "fotográfico", "arquitectonico": "arquitectónico", "composicion": "composición", "lineas": "líneas", "correccion": "corrección", "comunicacion": "comunicación", "grafico": "gráfico", "historico": "histórico", "evolucion": "evolución", "difusion": "difusión", "creacion": "creación", "tipografica": "tipográfica", "fisicos": "físicos", "construccion": "construcción", "linea": "línea", "asociacion": "asociación", "jerarquia": "jerarquía", "jovenes": "jóvenes", "campana": "campaña", "cercania": "cercanía", "aplicacion": "aplicación", "versatil": "versátil", "vectorizacion": "vectorización", "impresion": "impresión"};
export function correctPublicCopy(value: string): string {
  return value.replace(new RegExp(`\\b(${Object.keys(accents).join('|')})\\b`, 'gi'), word => {
    const corrected = accents[word.toLowerCase()];
    return word[0] === word[0].toUpperCase() ? corrected[0].toUpperCase() + corrected.slice(1) : corrected;
  });
}
export function correctProjectCopy<T extends { titulo: string; descripcion: string | null }>(project: T): T {
  return { ...project, titulo: correctPublicCopy(project.titulo), descripcion: project.descripcion ? correctPublicCopy(project.descripcion) : null };
}
