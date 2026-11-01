-- Analítica disponible automáticamente en conexiones MCP autorizadas.
-- private.mcp_social_run sigue validando admin global activo/autorizado en cada lectura.
UPDATE private.mcp_capabilities
SET granted_by_default = true
WHERE capability = 'social.analytics.read';

INSERT INTO private.mcp_client_capabilities(client_id, capability)
SELECT client_id, 'social.analytics.read'
FROM private.mcp_client_policies
ON CONFLICT (client_id, capability) DO NOTHING;

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
SELECT id, 'social.analytics.read'
FROM private.mcp_access_grants
WHERE revoked_at IS NULL
ON CONFLICT (grant_id, capability) DO NOTHING;
