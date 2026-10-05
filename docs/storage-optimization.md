# Optimización de Storage

Los nuevos originales del sistema se guardan en Google Drive. Supabase conserva
solo miniaturas WebP de hasta 200 px y previsualizaciones de hasta 800 px. Los ZIP
se descargan directamente sin dejar otra copia permanente en Storage.

`scripts/optimize-supabase-storage.mjs` reemplaza imágenes existentes en su misma
ruta; nunca elimina objetos, registros ni versiones. Por defecto simula los
reemplazos y guarda los originales de los candidatos en el directorio de respaldo.

Antes de ejecutarlo, exportar un inventario reciente con esta consulta de lectura:

```sql
select bucket_id as bucket, name as path,
       metadata->>'mimetype' as mime,
       coalesce((metadata->>'size')::bigint, 0) as bytes,
       updated_at
from storage.objects
order by bucket_id, name;
```

Guardar el resultado como `inventory.json` en un directorio persistente fuera del
repositorio y de Supabase. El script verifica que las credenciales correspondan
al proyecto de Quepia, descarga cada candidato, compara tamaños, guarda el original
y verifica su SHA-256 antes de reemplazarlo mediante la API de Storage. Luego
descarga la copia nueva sin caché y comprueba su SHA-256. Si esa verificación falla,
restaura el original. Se detiene ante tres errores para evitar repetir fallos.

```sh
node scripts/optimize-supabase-storage.mjs --backup-dir=/ruta/al/respaldo
node scripts/optimize-supabase-storage.mjs --backup-dir=/ruta/al/respaldo --execute
```

La operación puede reanudarse con el mismo comando y directorio. Los reemplazos
ya verificados se reconocen por su checksum. No se vuelven a comprimir. Si el objeto
remoto cambió desde el reemplazo, se detiene ese objeto para revisión.

Los originales creativos PNG mantienen dimensiones, formato y transparencia. La
compresión por paleta solo se acepta con error RGB ponderado por alfa de como
máximo 2 sobre 255 y alfa idéntico; de lo contrario se usa PNG sin pérdida. Los
JPEG/WebP originales del sistema y los videos permanecen intactos. Los JPEG de
la web usan calidad 84 y un lado máximo de 2400 px, sin ampliar imágenes pequeñas.
Los originales de todos los archivos reemplazados quedan recuperables.

El respaldo de la ejecución del 5 de octubre de 2026 está en
`/Volumes/Kingston/RESPALDOS QUEPIA/2026-10-05-storage`:

- `originals/<bucket>/<ruta>`: bytes originales completos.
- `records/*.json`: rutas, formatos, tamaños y checksums antes y después.
- `verified-replacements.jsonl`: reemplazos confirmados.
- `execution-summary.json`: resumen de la última ejecución.

Para recuperar un original, comprobar su SHA-256 contra `originalSha256` del
registro y reemplazar el objeto con `storage.from(bucket).update(path, bytes,
{ contentType: originalMime, upsert: false, cacheControl: '0' })`. Verificar la
descarga con una URL sin caché. No borrar filas de `storage.objects` por SQL.
