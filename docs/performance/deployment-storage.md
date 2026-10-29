# Almacenamiento de deployments — 2026-10-29

## Diagnóstico

Equipo: `quepias-projects` (`team_pYvhjW6ELx7innLvuia6V0qZ`).
El correo recibido informa un uso del 75% de 10 GB. Tras iniciar sesión en
el navegador, el panel mostró 9,16 GB de Deployment Storage y 8,86 GB de
Functions Storage (selección Last 30 Days). Desglose de Deployment Storage:
quepia-web 9,14 GB, sistema-lafuga 20,51 MB y quepia-mcp 0 B.

Inventario consultado mediante el conector Vercel, paginando hasta el final:

| Proyecto | Deployments listados |
| --- | ---: |
| quepia-web | 88 |
| quepia-mcp | 85 |
| sistema-lafuga | 3 |

La cantidad de deployments por sí sola no determina el almacenamiento facturado.

## Optimización local aplicada

Se conservaron las rutas públicas, resolución 1920 × 1080 y cantidad de cuadros.
H.264 CRF 27 para el loop y CRF 23 para animaciones, audio AAC 128 kbps
cuando existe y MP4 con `faststart`.

| Archivo en public | Bytes anteriores | Bytes nuevos | SSIM de video |
| --- | ---: | ---: | ---: |
| LOOP FONDO QUEPIA.prproj.mp4 | 39.688.335 | 23.114.768 | 0,971773 |
| VIDEOS CARDS/ANIMACIONES QUEPIA.mp4 | 14.793.072 | 5.257.119 | 0,989734 |

Ahorro total: 26.109.520 bytes (~26.1 MB decimales). Se verificaron con
FFprobe los streams y cuadros; además se comparó visualmente un cuadro del
video de animaciones. Los originales siguen disponibles en el historial Git.

Estos cambios reducen futuros deployments; no liberan los deployments históricos.
No se eliminaron archivos públicos sin referencias locales, porque pueden estar
enlazados directamente o desde contenido administrado externamente.

## Retención automática configurada

En quepia-web, Settings > Build and Deployment > Deployment Retention Policy:

| Estado | Antes | Guardado |
| --- | --- | --- |
| Cancelados | 30 días | 1 día |
| Fallidos | 30 días | 1 día |
| Preproducción | 30 días | 1 semana |
| Producción | 30 días | 2 semanas |

El panel confirmó `Deployment retention policy updated`. Comprobante de la
sesión: `/tmp/quepia-retention-saved.png`.

No se hicieron borrados manuales ni purgas definitivas. No se modificaron
La Fuga, MCP, bases de datos, archivos de clientes, dominios ni credenciales.
La limpieza queda a cargo de la política de Vercel, con sus excepciones para
deployments protegidos y su flujo de recuperación de versiones eliminadas.

Se verificó después del cambio el deployment `dpl_Emdc1VjxZL2tPX2y5iu38b8WLkyH`,
commit `a3ca8ea00f80c11d6558cbf2fa08335b2c6761ef`, marcado Ready, Production y
Current, con `quepia.com` asignado. Durante la sesión hubo un deployment nuevo
ajeno a esta optimización; por eso el inventario inicial no es un total final.

## Pendiente

- Comprobar el consumo cuando Vercel procese la nueva política. No se verificó
  todavía una reducción del almacenamiento remoto.
- Verificar el deployment que genera el push de los dos videos optimizados y
  este registro a main. El cambio se prepara de forma aislada, sin incluir los
  demás cambios locales en curso.

Documentación: https://vercel.com/docs/deployment-storage/optimize
