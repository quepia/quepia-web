-- ============================================================
-- 055: Modulo de Efemerides
-- ============================================================

-- 1. Catalogo global de efemerides
CREATE TABLE IF NOT EXISTS sistema_efemerides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    descripcion text,
    fecha_mes int NOT NULL CHECK (fecha_mes BETWEEN 1 AND 12),
    fecha_dia int NOT NULL CHECK (fecha_dia BETWEEN 1 AND 31),
    categoria text NOT NULL DEFAULT 'general'
        CHECK (categoria IN ('patria','comercial','conmemorativa','otro','general')),
    dias_anticipacion int NOT NULL DEFAULT 7,
    recurrente boolean NOT NULL DEFAULT true,
    activa boolean NOT NULL DEFAULT true,
    global boolean NOT NULL DEFAULT true,
    project_id uuid REFERENCES sistema_projects(id) ON DELETE CASCADE,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Estado de efemeride por proyecto (asset tracking)
CREATE TABLE IF NOT EXISTS sistema_efemerides_proyectos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    efemeride_id uuid NOT NULL REFERENCES sistema_efemerides(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    anio int NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','en_progreso','lista','publicada')),
    asset_url text,
    asset_storage_path text,
    thumbnail_url text,
    notas text,
    calendar_event_id uuid REFERENCES sistema_calendar_events(id) ON DELETE SET NULL,
    task_id uuid REFERENCES sistema_tasks(id) ON DELETE SET NULL,
    uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (efemeride_id, project_id, anio)
);

-- 3. Log de notificaciones enviadas
CREATE TABLE IF NOT EXISTS sistema_efemerides_notificaciones_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    efemeride_id uuid NOT NULL REFERENCES sistema_efemerides(id) ON DELETE CASCADE,
    anio int NOT NULL,
    notificada_at timestamptz NOT NULL DEFAULT now(),
    tipo text NOT NULL DEFAULT 'anticipacion'
        CHECK (tipo IN ('anticipacion','dia'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_efemerides_fecha ON sistema_efemerides(fecha_mes, fecha_dia);
CREATE INDEX IF NOT EXISTS idx_efemerides_activa ON sistema_efemerides(activa) WHERE activa = true;
CREATE INDEX IF NOT EXISTS idx_efemerides_proyectos_lookup ON sistema_efemerides_proyectos(efemeride_id, project_id, anio);
CREATE INDEX IF NOT EXISTS idx_efemerides_notif_log ON sistema_efemerides_notificaciones_log(efemeride_id, anio);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_efemerides_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_efemerides_updated ON sistema_efemerides;
CREATE TRIGGER trg_efemerides_updated
    BEFORE UPDATE ON sistema_efemerides
    FOR EACH ROW EXECUTE FUNCTION update_efemerides_updated_at();

DROP TRIGGER IF EXISTS trg_efemerides_proyectos_updated ON sistema_efemerides_proyectos;
CREATE TRIGGER trg_efemerides_proyectos_updated
    BEFORE UPDATE ON sistema_efemerides_proyectos
    FOR EACH ROW EXECUTE FUNCTION update_efemerides_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE sistema_efemerides ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_efemerides_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_efemerides_notificaciones_log ENABLE ROW LEVEL SECURITY;

-- Admins: full CRUD on efemerides catalog
CREATE POLICY efemerides_admin_all ON sistema_efemerides
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_users WHERE id = auth.uid() AND role = 'admin')
    );

-- Members: read global efemerides + custom ones for their projects
CREATE POLICY efemerides_member_select ON sistema_efemerides
    FOR SELECT USING (
        global = true
        OR EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_efemerides.project_id
            AND user_id = auth.uid()
        )
    );

-- Admins: full CRUD on efemerides_proyectos
CREATE POLICY efemerides_proy_admin_all ON sistema_efemerides_proyectos
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_users WHERE id = auth.uid() AND role = 'admin')
    );

-- Members: select their project assignments
CREATE POLICY efemerides_proy_member_select ON sistema_efemerides_proyectos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_efemerides_proyectos.project_id
            AND user_id = auth.uid()
        )
    );

-- Members: insert/update their project assignments
CREATE POLICY efemerides_proy_member_write ON sistema_efemerides_proyectos
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_efemerides_proyectos.project_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY efemerides_proy_member_update ON sistema_efemerides_proyectos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_efemerides_proyectos.project_id
            AND user_id = auth.uid()
        )
    );

-- Notificaciones log: admin only
CREATE POLICY efemerides_notif_admin ON sistema_efemerides_notificaciones_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- Seed: Efemerides argentinas comunes
-- ============================================================

INSERT INTO sistema_efemerides (nombre, descripcion, fecha_mes, fecha_dia, categoria, dias_anticipacion) VALUES
    ('Año Nuevo', 'Celebración del inicio del nuevo año', 1, 1, 'conmemorativa', 14),
    ('Día de San Valentín', 'Día de los Enamorados', 2, 14, 'comercial', 14),
    ('Día de la Mujer', 'Día Internacional de la Mujer', 3, 8, 'conmemorativa', 10),
    ('Día de la Memoria', 'Día Nacional de la Memoria por la Verdad y la Justicia', 3, 24, 'patria', 7),
    ('Día del Trabajador', 'Día Internacional del Trabajador', 5, 1, 'patria', 7),
    ('25 de Mayo', 'Día de la Revolución de Mayo', 5, 25, 'patria', 10),
    ('Día de la Bandera', 'Día de la Bandera Argentina', 6, 20, 'patria', 10),
    ('Día del Padre', 'Tercer domingo de junio (referencia al 20)', 6, 20, 'comercial', 14),
    ('Día de la Independencia', 'Declaración de la Independencia Argentina', 7, 9, 'patria', 10),
    ('Día del Amigo', 'Día del Amigo', 7, 20, 'comercial', 10),
    ('Día de la Madre', 'Tercer domingo de octubre (referencia al 20)', 10, 20, 'comercial', 14),
    ('Halloween', 'Noche de Brujas', 10, 31, 'comercial', 14),
    ('Navidad', 'Celebración de Navidad', 12, 25, 'conmemorativa', 21),
    ('Día del Maestro', 'Día del Maestro en Argentina', 9, 11, 'conmemorativa', 7),
    ('Día del Estudiante', 'Día del Estudiante y Día de la Primavera', 9, 21, 'conmemorativa', 10)
ON CONFLICT DO NOTHING;
