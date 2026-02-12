-- Migration 052: Seed YouTube project template
DO $$
DECLARE
  template_exists BOOLEAN;
  seed_user_id UUID;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM sistema_project_templates
    WHERE lower(trim(nombre)) = 'youtube'
  )
  INTO template_exists;

  IF template_exists THEN
    RETURN;
  END IF;

  SELECT id
  INTO seed_user_id
  FROM sistema_users
  ORDER BY created_at ASC
  LIMIT 1;

  IF seed_user_id IS NULL THEN
    RAISE NOTICE 'Skipping YouTube template seed: no users in sistema_users yet.';
    RETURN;
  END IF;

  INSERT INTO sistema_project_templates (
    nombre,
    descripcion,
    created_by,
    structure
  ) VALUES (
    'YouTube',
    'Flujo de produccion y publicacion para videos de YouTube',
    seed_user_id,
    '{
      "columns": [
        { "name": "IDEAS", "order": 0 },
        { "name": "GUION", "order": 1 },
        { "name": "GRABACION", "order": 2 },
        { "name": "EDICION", "order": 3 },
        { "name": "THUMBNAIL + SEO", "order": 4 },
        { "name": "PROGRAMADO", "order": 5 },
        { "name": "PUBLICADO", "order": 6 }
      ],
      "default_tasks": [
        {
          "title": "Definir idea y hook",
          "column_index": 0,
          "type": "strategy",
          "priority": "P2",
          "description": "Definir concepto, angulo y resultado esperado del video."
        },
        {
          "title": "Escribir guion v1",
          "column_index": 1,
          "type": "copy",
          "priority": "P2",
          "description": "Esqueleto + CTA + estructura de retencion."
        },
        {
          "title": "Grabar material principal",
          "column_index": 2,
          "type": "video",
          "priority": "P2",
          "estimated_hours": 2
        },
        {
          "title": "Editar video final",
          "column_index": 3,
          "type": "video",
          "priority": "P2"
        },
        {
          "title": "Preparar metadata de YouTube",
          "column_index": 4,
          "type": "video",
          "priority": "P2",
          "type_metadata": {
            "youtube": {
              "title": "",
              "description": "",
              "source_type": "drive",
              "source_url": "",
              "published_url": "",
              "thumbnail_path": null,
              "thumbnail_url": null,
              "tags": [],
              "playlist": "",
              "scheduled_at": null
            }
          }
        },
        {
          "title": "Subir y programar",
          "column_index": 5,
          "type": "revision",
          "priority": "P2"
        },
        {
          "title": "Publicar y revisar metricas iniciales",
          "column_index": 6,
          "type": "strategy",
          "priority": "P3"
        }
      ]
    }'::jsonb
  );
END $$;
