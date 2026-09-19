// Carga de volumen sobre la capa semántica (PGlite: cota conservadora).
import { createSocialDb, IDS, rpc, seedClientWithAccounts } from "../../supabase/tests/social/harness.mjs"
const db = await createSocialDb()
const DAY = 86_400_000
const accounts = []
for (let c = 0; c < 5; c += 1) {
  const seeded = await seedClientWithAccounts(db, { name: `Cliente ${c}`, projects: 4, accounts: [0, 1, 2, 3].map((i) => ({ zernioId: `acc_${c}_${i}`, profileIndex: i })) })
  accounts.push(...[0, 1, 2, 3].map((i) => `acc_${c}_${i}`))
}
let n = 0
const t0 = performance.now()
for (const account of accounts) {
  const posts = []
  for (let i = 0; i < 200; i += 1) {
    n += 1
    posts.push({ zernio_account_id: account, platform: "instagram", zernio_external_post_id: `e${n}`, platform_post_id: `p${n}`,
      published_at: new Date(Date.now() - (i * 0.9 + 1) * DAY).toISOString(), media_type: i % 2 ? "video" : "carousel", media_product_type: i % 2 ? "REELS" : "FEED",
      metrics: { views: 1000 + i, reach: 600 + i, likes: 30 + (i % 9), comments: i % 5, shares: i % 3, saves: i % 4 } })
  }
  await rpc(db, "social_ingest_posts", [posts, "analytics", new Date().toISOString()])
}
await db.exec(`INSERT INTO public.sistema_social_post_metric_snapshots(post_id, metric_key, observed_on, value, observed_at, source)
  SELECT p.id, m.k, (p.published_at AT TIME ZONE 'UTC')::date + d, 10 * d, now(), 'timeline'
  FROM public.sistema_social_posts p CROSS JOIN generate_series(0, 29) d CROSS JOIN (VALUES ('views'), ('likes'), ('reach')) m(k)
  ON CONFLICT DO NOTHING`)
await db.exec(`INSERT INTO public.sistema_social_account_daily(account_id, client_id, metric_key, day, value, source)
  SELECT a.id, a.client_id, 'followers', current_date - d, 1000 + d, 'bench' FROM public.sistema_zernio_accounts a CROSS JOIN generate_series(0, 179) d`)
const count = (await db.query("SELECT (SELECT count(*) FROM public.sistema_social_posts) p, (SELECT count(*) FROM public.sistema_social_post_metric_snapshots) s")).rows[0]
console.log(`datos: ${count.p} publicaciones, ${count.s} snapshots, carga ${Math.round(performance.now() - t0)} ms`)
const to = new Date().toISOString().slice(0, 10)
const from = new Date(Date.now() - 89 * DAY).toISOString().slice(0, 10)
for (const [op, params] of [["overview", {}], ["compare_periods", {}], ["rank_posts", { metric: "views", age_days: 7 }], ["rank_posts", { metric: "engagement_rate_reach" }],
  ["compare_formats", { metric: "views", age_days: 7 }], ["timeseries", { metric: "views", attribution: "received" }], ["timeseries", { metric: "followers" }], ["coverage", {}], ["attention", {}]]) {
  const times = []
  for (let i = 0; i < 3; i += 1) {
    const t = performance.now()
    const result = await rpc(db, "social_query", [IDS.admin, op, { from, to, ...params }])
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    times.push(performance.now() - t)
  }
  console.log(`${op} ${JSON.stringify(params)}: ${Math.round(Math.max(...times))} ms (peor de 3, 90 días, 20 cuentas)`)
}
