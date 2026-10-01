import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'
const telegram = projectModule('lib/zernio/publication-telegram.ts', {
 '@/lib/sistema/supabase/admin': {}, '@/lib/sistema/telegram-service': {}, './sync-publications': {},
})
test('Notice contains the confirmed account, network, task, time and HTTPS link',()=>{
 const msg=telegram.publicationTelegramMessage({platform:'instagram',payload:{account:'Grupo Brandalise',task:'Reel',project:'Brandalise',published_at:'2026-10-02T22:30:00Z',url:'https://instagram.com/p/reel'}})
 assert.equal(msg.headline,'✅ Publicación confirmada')
 assert.ok(msg.lines.includes('Cuenta: Grupo Brandalise'))
 assert.ok(msg.lines.includes('Red: instagram'))
 assert.ok(msg.lines.includes('Tarea: Reel'))
 assert.ok(msg.lines.some(line=>line.includes('19:30')))
 assert.ok(msg.lines.some(line=>line.includes('https://instagram.com/p/reel')))
})
test('Invalid dates and unsafe URLs are omitted',()=>{
 const msg=telegram.publicationTelegramMessage({platform:'facebook',payload:{published_at:'invalid',url:'javascript:bad'}})
 assert.ok(!msg.lines.some(line=>line.startsWith('Publicada:')||line.startsWith('Ver publicación:')))
})

test('Failed delivery is persisted for retry; success records sent with the lease guard',async()=>{
 const oldToken=process.env.TELEGRAM_BOT_TOKEN,oldChat=process.env.TELEGRAM_CHAT_ID
 process.env.TELEGRAM_BOT_TOKEN='test';process.env.TELEGRAM_CHAT_ID='test'
 const updates=[],guards=[]
 let success=false
 const notice={id:'notice1',lease_token:'lease1',attempts:1,platform:'instagram',payload:{task:'Reel'}}
 const db={rpc:async()=>({data:[notice],error:null}),from:()=>({update(value){updates.push(value);const q={eq(field,value){guards.push([field,value]);return q},then(resolve){resolve({error:null})}};return q}})}
 const service=projectModule('lib/zernio/publication-telegram.ts',{
  '@/lib/sistema/supabase/admin':{createAdminClient:()=>db},
  '@/lib/sistema/telegram-service':{sendTelegramTextNotice:async()=>success?{sent:1,failed:0,errors:[]}:{sent:0,failed:1,errors:['temporary failure']}},
  './sync-publications':{},
 })
 try {
  assert.deepEqual(await service.dispatchPublicationTelegramNotices(),{sent:0,failed:1})
  assert.equal(updates[0].status,'pending');assert.equal(updates[0].sent_at,null)
  success=true
  assert.deepEqual(await service.dispatchPublicationTelegramNotices(),{sent:1,failed:0})
  assert.equal(updates[1].status,'sent');assert.ok(updates[1].sent_at)
  assert.ok(guards.some(([field,value])=>field==='lease_token'&&value==='lease1'))
 } finally {
  if(oldToken===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=oldToken
  if(oldChat===undefined)delete process.env.TELEGRAM_CHAT_ID;else process.env.TELEGRAM_CHAT_ID=oldChat
 }
})
