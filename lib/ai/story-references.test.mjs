import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {projectModule} from '../../scripts/lib/load-project-module.mjs'
const project='00000000-0000-4000-8000-000000000003',task='00000000-0000-4000-8000-000000000004',assetId='00000000-0000-4000-8000-000000000005'
const stories=projectModule('lib/ai/stories.ts')
const references=projectModule('lib/ai/story-references.ts',{'server-only':{},'@/lib/sistema/assets-storage':{ASSET_BUCKET:'sistema-assets'},'@/lib/zernio/server':{ZernioRouteError:class extends Error{constructor(status,message){super(message);this.status=status}}},'@/lib/sistema/google-drive-backup':{}})
function serverFor(asset){
  const filters=[]
  const query={select(){return this},eq(key,value){filters.push([key,value]);return this},in(){return Promise.resolve({data:[asset],error:null})}}
  return {filters,from(){return query}}
}
const asset={id:assetId,task_id:task,current_version:2,access_revoked:false,versions:[{version_number:1,file_type:'image/png',storage_path:'obsolete'},{version_number:2,file_type:'image/jpeg',file_size:20*1024*1024,storage_path:`${project}/${task}/foto.jpg`}]}
test('references reuse current project images from another task and allow normalization of large photos',async()=>{
  const server=serverFor(asset)
  assert.deepEqual(await references.referencePaths(server,'different-story',project,[assetId]),[`${project}/${task}/foto.jpg`])
  assert.ok(server.filters.some(([key,value])=>key==='project_id'&&value===project))
  const drive={...asset,versions:[{...asset.versions[1],drive_file_id:'drive-file-123456',storage_path:null}]}
  assert.deepEqual(await references.referencePaths(serverFor(drive),task,project,[assetId]),['drive:drive-file-123456'])
})
test('revoked references, foreign paths and combined reference overflow are rejected before provider calls',async()=>{
  await assert.rejects(references.referencePaths(serverFor({...asset,access_revoked:true}),task,project,[assetId]),/no está disponible/)
  await assert.rejects(references.referencePaths(serverFor({...asset,versions:[{...asset.versions[1],storage_path:'foreign-project/photo.png'}]}),task,project,[assetId]),/ruta válida/)
  await assert.rejects(references.referencePaths(serverFor(asset),task,project,[assetId,assetId,assetId],['drive-file-123456','drive-file-654321']),/cuatro/)
})
test('preparation includes the full task description, exact requested copy and actual selected reference bytes',async()=>{
  const photo=await sharp({create:{width:80,height:80,channels:3,background:'#009900'}}).png().toBuffer()
  let captured,pathsArgs
  const preparation=projectModule('lib/ai/story-preparation.ts',{'server-only':{},'ai':{Output:{object:value=>value},generateText:async input=>{captured=input;return{output:{prompt:'Foto real al atardecer',headline:'Invented replacement',cta:'Invented CTA',references:[],design:'outdoor',kicker:'FINDE LARGO',supportingText:'',primaryColor:'#123b2a',accentColor:'#f7bf28',panelColor:'#f5f1df'}}}},'./vertex':{vertexModel:{}},'./creative-studio-context':{formatBrandGuidelines:()=> 'Brief de marca',formatTaskContext:task=>task.description},'./story-references':{storyReferenceCatalog:async()=>[],referencePaths:async(...args)=>{pathsArgs=args;return['drive:photo']},readStoryReference:async()=>photo}})
  const description='Objetivo: reservas. Visual: usar las instalaciones reales; no inventar servicios.'
  const result=await preparation.prepareStory({}, {task:{id:task,projectId:project,typeMetadata:{},title:'Título administrativo',description},brief:{},activeStrategyContext:'Estrategia'}, {...stories.EMPTY_STORY,referenceDriveFileIds:['drive-file-123456'],headline:'Texto exacto',cta:'Consultanos'})
  assert.equal(result.headline,'Texto exacto');assert.equal(result.cta,'Consultanos');assert.equal(result.mode,'faithful');assert.equal(stories.storyReservation(result),0)
  assert.equal(captured.messages[0].content[0].type,'image')
  assert.ok(Buffer.isBuffer(captured.messages[0].content[0].image))
  assert.ok(captured.messages[0].content.at(-1).text.includes(description))
  assert.deepEqual(pathsArgs[4],['drive-file-123456'])
})

test('missing Drive bank never silently falls back to an invented AI background',async()=>{
  let modelCalls=0
  const preparation=projectModule('lib/ai/story-preparation.ts',{'server-only':{},'ai':{Output:{object:value=>value},generateText:async()=>{modelCalls++;throw Error('not expected')}},'./vertex':{vertexModel:{}},'./creative-studio-context':{},'./story-references':{storyReferenceCatalog:async()=>[]}})
  await assert.rejects(preparation.prepareStory({}, {task:{id:task,projectId:project,typeMetadata:{},description:''},brief:{}},stories.EMPTY_STORY),/Vinculá una carpeta/)
  assert.equal(modelCalls,0)
})
