interface ProjectImagesSource {
  imagen_url: string | null
  galeria_urls?: string[] | null
}

function normalizeImageUrls(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0))]
}

export function getProjectCoverImage(source: ProjectImagesSource): string | null {
  return normalizeImageUrls([source.imagen_url, ...(source.galeria_urls ?? [])])[0] ?? null
}

export function getProjectGalleryImages(source: ProjectImagesSource): string[] {
  const cover = source.imagen_url?.trim() ?? ""
  const gallery = normalizeImageUrls(source.galeria_urls ?? [])

  if (!cover) {
    return gallery
  }

  if (gallery.includes(cover)) {
    return [cover, ...gallery.filter((imageUrl) => imageUrl !== cover)]
  }

  return [cover, ...gallery]
}
