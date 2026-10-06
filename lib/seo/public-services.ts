// Nombres públicos de los servicios cargados en el panel (tabla `servicios`).
// En Quepia, "marketing" significa estrategia de marca y comunicación, nunca pauta.
const publicTitles: Record<string, string> = {
  marketing: 'Estrategia de marca',
};

export function publicServiceTitle(titulo: string): string {
  return publicTitles[titulo.trim().toLowerCase()] ?? titulo;
}
