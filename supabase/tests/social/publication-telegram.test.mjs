import test from 'node:test'
import assert from 'node:assert/strict'
import { createSocialDb, IDS, asRole } from './harness.mjs'
const db = await createSocialDb({only:['social_foundations','social_publication_telegram']})
const project = (await db.query('INSERT INTO sistema_projects(nombre, owner_id) VALUES ($1,$2) RETURNING id', ['Brandalise',IDS.admin])).rows[0].id
const task = (await db.query('INSERT INTO sistema_tasks(project_id,titulo) VALUES ($1,$2) RETURNING id', [project,'Reel publicado'])).rows[0].id
const publication = (await db.query("INSERT INTO sistema_zernio_publications(project_id,task_id,request_id,zernio_post_id,status) VALUES ($1,$2,gen_random_uuid(),'post123','scheduled') RETURNING id",[project,task])).rows[0].id
const platform=(account, status='published')=>({status,platform:'instagram',accountId:{_id:account,displayName:account},platformPostUrl:'https://instagram.com/p/test',publishedAt:'2026-10-02T22:30:00Z'})

test('Only successful per-platform confirmations queue a notice; duplicate sync does not repeat it', async()=>{
 await asRole(db,'service_role',"UPDATE sistema_zernio_publications SET platform_results=$1,status='partial' WHERE id=$2",[JSON.stringify([platform('account1'),platform('account2','failed')]),publication])
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sistema_publication_telegram_notices')).rows[0].n,1)
 await db.query('UPDATE sistema_zernio_publications SET platform_results=platform_results WHERE id=$1',[publication])
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sistema_publication_telegram_notices')).rows[0].n,1)
 await db.query("UPDATE sistema_zernio_publications SET platform_results=$1,status='published' WHERE id=$2",[JSON.stringify([platform('account1'),platform('account2')]),publication])
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sistema_publication_telegram_notices')).rows[0].n,2)
})
test('Claims prevent parallel dispatch and sent messages stay sent',async()=>{
 const claimed=await asRole(db,'service_role','SELECT * FROM claim_publication_telegram_notices(3)')
 assert.equal(claimed.rows.length,2)
 assert.equal((await asRole(db,'service_role','SELECT * FROM claim_publication_telegram_notices(3)')).rows.length,0)
 await db.query("UPDATE sistema_publication_telegram_notices SET status='sent',sent_at=now()")
 assert.equal((await asRole(db,'service_role','SELECT * FROM claim_publication_telegram_notices(3)')).rows.length,0)
})
test('Browser roles cannot read notices or claim sends',async()=>{
 await assert.rejects(asRole(db,'authenticated','SELECT * FROM sistema_publication_telegram_notices'),/permission denied/)
 await assert.rejects(asRole(db,'anon','SELECT * FROM claim_publication_telegram_notices(3)'),/permission denied/)
})
