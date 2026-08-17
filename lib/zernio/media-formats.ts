export const ZERNIO_MEDIA_FORMATS = {
  original: {
    label: "Original",
    shortLabel: "Original",
    width: null,
    height: null,
    hint: "Sin recorte",
  },
  portrait: {
    label: "Vertical 4:5",
    shortLabel: "4:5",
    width: 1080,
    height: 1350,
    hint: "Recomendado para feed",
  },
  square: {
    label: "Cuadrado 1:1",
    shortLabel: "1:1",
    width: 1080,
    height: 1080,
    hint: "Feed y carrusel",
  },
  landscape: {
    label: "Horizontal 1.91:1",
    shortLabel: "1.91:1",
    width: 1080,
    height: 566,
    hint: "Formato horizontal",
  },
} as const

export type ZernioMediaFormat = keyof typeof ZERNIO_MEDIA_FORMATS

export type ZernioMediaEdit = {
  assetId: string
  format: ZernioMediaFormat
  zoom: number
  positionX: number
  positionY: number
}

export function isZernioMediaFormat(value: unknown): value is ZernioMediaFormat {
  return typeof value === "string" && value in ZERNIO_MEDIA_FORMATS
}

export function defaultZernioMediaEdit(assetId: string): ZernioMediaEdit {
  return {
    assetId,
    format: "original",
    zoom: 1,
    positionX: 50,
    positionY: 50,
  }
}
