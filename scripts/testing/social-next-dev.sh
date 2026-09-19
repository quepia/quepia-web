#!/usr/bin/env bash
# Next.js contra el stack social local (sin Supabase ni Zernio reales).
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=local-anon
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=local-anon
export SUPABASE_SERVICE_ROLE_KEY=local-service
export ZERNIO_API_KEY=local-fake-key
export SOCIAL_ZERNIO_API_BASE=http://localhost:54321/zernio/api/v1
export ZERNIO_WEBHOOK_SECRET_OPERATIONS=local-webhook-secret
export ZERNIO_WEBHOOK_SECRET_ANALYTICS=local-webhook-secret-analytics
export CRON_SECRET=local-cron-secret
exec pnpm exec next dev -p 3100
