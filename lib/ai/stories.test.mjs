import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { projectModule } from "../../scripts/lib/load-project-module.mjs"

const stories=projectModule("lib/ai/stories.ts")
const composition=projectModule("lib/ai/story-composition.ts")
test("usage accounting handles reported and missing consumption without inventing costs",()=>{
  assert.equal(stories.imageUsageCost({input_tokens_details:{text_tokens:1000,image_tokens:2000},output_tokens:5000}),0.171)
  assert.equal(stories.imageUsageCost(null),null)
  assert.equal(stories.imageUsageCost({output_tokens:5000}),null)
  assert.equal(stories.imageUsageCost({input_tokens_details:{text_tokens:-1,image_tokens:0},output_tokens:1}),null)
  assert.equal(stories.storyReservation({...stories.EMPTY_STORY,renderMode:"legacy",mode:"faithful"}),0)
})
test("composition preserves original geometry and brand logo pixels",async()=>{
  const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#00ff00"}}).png().toBuffer()
  const logo=await sharp({create:{width:100,height:50,channels:4,background:"#ff0000"}}).png().toBuffer()
  const final=await composition.composeStory(base,{...stories.EMPTY_STORY,mode:"faithful",photoFit:"contain",backgroundColor:"#0000ff"},logo)
  const meta=await sharp(final).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1920)
  const pixel=async(x,y)=>Array.from(await sharp(final).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer())
  assert.deepEqual(await pixel(540,960),[0,255,0])
  assert.deepEqual(await pixel(20,20),[0,0,255])
  assert.deepEqual(await pixel(910,175),[255,0,0])
})
test("text composition escapes markup and keeps readable text within export dimensions",async()=>{
  assert.equal(composition.escapeSvg('<script>&"'),"&lt;script&gt;&amp;&quot;")
  assert.ok(composition.wrapStoryText("x".repeat(90)).every(line=>line.length<=25))
  const base=await sharp({create:{width:1080,height:1920,channels:3,background:"#111111"}}).png().toBuffer()
  for(const format of ["story","portrait","square"]){
    const result=await composition.composeStory(base,{...stories.EMPTY_STORY,format,headline:"Reservá tu lugar & disfrutá",cta:"Escribinos hoy"})
    const meta=await sharp(result).metadata()
    assert.equal(meta.width,stories.STORY_FORMATS[format].width);assert.equal(meta.height,stories.STORY_FORMATS[format].height)
  }
})

test("OpenAI receives exactly one image request with a legal story size and real references",async()=>{
  const originalFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY="test-key"
  const calls=[]
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{b64_json:Buffer.from("image").toString("base64")}],usage:{input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:3}}),{headers:{"x-request-id":"test-request"}})}
  try{
    const generationModule=projectModule("lib/ai/story-generation.ts",{"server-only":{},"@/lib/sistema/supabase/admin":{},"@/lib/sistema/assets-storage":{ASSET_BUCKET:"sistema-assets"},"@/lib/ai/creative-studio-context":{},"@/lib/zernio/server":{ZernioRouteError:Error}})
    const base={model:"gpt-image-2.5-sunburst",prompt:"Prompt",settings:stories.EMPTY_STORY,references:[]}
    await generationModule.generateOpenAIImage(base)
    const json=JSON.parse(calls[0].options.body)
    assert.equal(json.n,1);assert.equal(json.size,"1152x2048");assert.equal(json.quality,"high")
    await generationModule.generateOpenAIImage({...base,references:[Buffer.from("reference")]})
    assert.ok(calls[1].url.endsWith("/edits"))
    assert.equal(calls[1].options.body.get("n"),"1")
    assert.equal(calls[1].options.body.getAll("image[]").length,1)
    assert.equal(calls[1].options.body.has("input_fidelity"),false)
    assert.equal(calls[1].options.headers["Content-Type"],undefined)
    globalThis.fetch=async()=>{calls.push({failed:true});return new Response("{}",{status:429})}
    await assert.rejects(generationModule.generateOpenAIImage(base),/límite/)
    assert.equal(calls.length,3,"failed requests must not trigger automatic paid retries")
  } finally {globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
})

test("story defaults reuse the task description and date without turning the card title into copy",()=>{
  const description='Objetivo: reservas\nVisual: foto del camping\nTexto exacto: Se viene el finde\nCTA: Consultanos'
  const settings=stories.readStorySettings({}, {descripcion:description,due_date:'2026-10-09'})
  assert.equal(settings.request,description);assert.equal(settings.date,'2026-10-09');assert.equal(settings.headline,'Se viene el finde');assert.equal(settings.cta,'Consultanos')
  const explicit=stories.readStorySettings({story:{request:'Otra pieza',date:'2026-10-10'}},{descripcion:description,due_date:'2026-10-09'})
  assert.equal(explicit.request,'Otra pieza');assert.equal(explicit.date,'2026-10-10')
  assert.equal(stories.isStoryColumn(' HISTORIAS '),true)
  assert.equal(stories.isStoryColumn('Historias Instagram'),true)
  assert.equal(stories.isStoryColumn('Diseño'),false)
})

test("bundled outlined typography renders Spanish accents with no system font dependency",async()=>{
  const previous=process.env.FONTCONFIG_FILE
  const regular=await composition.renderStoryText('¡ESTAMOS ABIERTOS! ÁÉÍÓÚ ñ',872,500,'#ffffff',true,180)
  process.env.FONTCONFIG_FILE='/missing-system-fonts.conf'
  try {
    const independent=await composition.renderStoryText('¡ESTAMOS ABIERTOS! ÁÉÍÓÚ ñ',872,500,'#ffffff',true,180)
    assert.deepEqual(independent.bytes,regular.bytes)
    assert.ok(independent.height<=500);assert.ok(independent.width<=872)
    await assert.rejects(composition.renderStoryText('Promo 🏕️',872,500,'#ffffff'),/sin emojis/)
  } finally {if(previous===undefined)delete process.env.FONTCONFIG_FILE;else process.env.FONTCONFIG_FILE=previous}
})

test("outdoor composition exports every format with large text and separate supporting copy",async()=>{
  const base=await sharp({create:{width:1080,height:1920,channels:3,background:'#448877'}}).png().toBuffer()
  for(const format of ['story','portrait','square']) {
    const bytes=await composition.composeStory(base,{...stories.EMPTY_STORY,format,design:'outdoor',headline:'¡ESTAMOS\nABIERTOS!',kicker:'FINDE LARGO',supportingText:'14 A 17 HS',cta:'Consultanos'})
    const meta=await sharp(bytes).metadata()
    assert.equal(meta.width,stories.STORY_FORMATS[format].width)
    assert.equal(meta.height,stories.STORY_FORMATS[format].height)
  }
})

test("recovery reuses saved pixels and retains consumption and a preview when asset registration fails",async()=>{
  const pixels=await sharp({create:{width:40,height:70,channels:3,background:'#008800'}}).png().toBuffer()
  const updates=[],uploads=[],originalFetch=globalThis.fetch
  let calls=0
  globalThis.fetch=async()=>{calls++;throw new Error('A recovery must never call the provider')}
  const admin={storage:{from:()=>({download:async()=>({data:new Blob([pixels]),error:null}),upload:async(path)=>{uploads.push(path);return{error:null}}})},from:()=>({update:value=>{
    updates.push(value)
    const q={eq:()=>q,in:async()=>({error:null}),then:resolve=>resolve({error:null})}
    return q
  }}),rpc:async()=>({error:{code:'test_failure',message:'Unable to register'}})}
  const generation=projectModule('lib/ai/story-generation.ts',{'server-only':{},'@/lib/sistema/supabase/admin':{},'@/lib/sistema/assets-storage':{ASSET_BUCKET:'sistema-assets'},'@/lib/ai/creative-studio-context':{},'@/lib/zernio/server':{ZernioRouteError:Error}})
  const usage={input_tokens_details:{text_tokens:1000,image_tokens:2000},output_tokens:5000}
  const job={id:'job',task_id:'task',project_id:'project',settings:{...stories.EMPTY_STORY,renderMode:"full-ai",backgroundSource:"ai"},base_path:'project/task/stories/job/base.png',usage,provider_request_id:'original-request',reference_paths:[],logo_path:null,model:'existing-model'}
  const priorError=console.error;console.error=()=>{}
  try {
    await generation.runStoryJob(admin,job)
    assert.equal(calls,0)
    assert.ok(uploads.includes('project/task/stories/job/final.png'))
    const failure=updates.at(-1)
    assert.equal(failure.base_path,job.base_path)
    assert.equal(failure.output_path,'project/task/stories/job/final.png')
    assert.equal(failure.cost_usd,0.171)
    assert.equal(failure.provider_request_id,'original-request')
  } finally {globalThis.fetch=originalFetch;console.error=priorError}
})

test("brand plates correct low contrast and editorial text has a local backing on bright photos", async()=>{
  for (const [text,background] of [["#eeeeee","#ffffff"],["#123b2a","#123b2a"],["#f0da11","#f5f1df"]]) {
    assert.ok(composition.storyContrast(composition.readableStoryColor(text,background),background)>=4.5)
  }
  const base=await sharp({create:{width:1080,height:1920,channels:3,background:"#ffffff"}}).png().toBuffer()
  const final=await composition.composeStory(base,{...stories.EMPTY_STORY,design:"editorial",headlinePosition:"top",headline:"Se viene el finde",supportingText:"Disfrutá tus vacaciones",textColor:"#ffffff",includeLogo:false})
  const inside=await sharp(final).extract({left:100,top:300,width:1,height:1}).removeAlpha().raw().toBuffer()
  assert.ok(inside[0]<100,"the backing must protect text even against a white photo")
})

test("new and existing stories default to complete OpenAI generation with paid reservations",()=>{
  const settings=stories.readStorySettings({story:{mode:"faithful",backgroundSource:"bank",prompt:"Old background without text"}})
  assert.equal(settings.renderMode,"ai-overlay");assert.equal(settings.mode,"creative");assert.equal(settings.prompt,"")
  assert.equal(stories.storyReservation(settings),1)
  const prompt=stories.storyBasePrompt({...settings,renderMode:"full-ai",headline:"¡Estamos abiertos!",cta:"Consultanos"},"Brief")
  assert.match(prompt,/pieza gráfica terminada/);assert.match(prompt,/¡Estamos abiertos!/);assert.match(prompt,/integralo fielmente/)
  assert.doesNotMatch(prompt,/No readable text|Leave clear negative space/)
})
test("complete generation sends photos, design examples and logo and saves provider pixels unchanged",async()=>{
  const pixels=await sharp({create:{width:64,height:112,channels:3,background:'#aa4422'}}).png().toBuffer()
  const uploads=[],updates=[],fetches=[],originalFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key'
  globalThis.fetch=async(url,options)=>{fetches.push({url,options});return new Response(JSON.stringify({data:[{b64_json:pixels.toString('base64')}],usage:{input_tokens_details:{text_tokens:10,image_tokens:20},output_tokens:30}}),{headers:{'x-request-id':'complete-piece'}})}
  const admin={storage:{from:()=>({download:async()=>({data:new Blob([pixels]),error:null}),upload:async(path,bytes)=>{uploads.push({path,bytes});return{error:null}}})},from:()=>({update:value=>{updates.push(value);const q={eq:()=>q,in:async()=>({error:null}),then:resolve=>resolve({error:null})};return q}}),rpc:async()=>({error:null})}
  const generation=projectModule('lib/ai/story-generation.ts',{'server-only':{},'@/lib/sistema/supabase/admin':{},'@/lib/sistema/assets-storage':{ASSET_BUCKET:'sistema-assets'},'@/lib/ai/creative-studio-context':{},'@/lib/zernio/server':{ZernioRouteError:Error},'./story-references':{readStoryReference:async()=>pixels},'./story-composition':{composeStory:async()=>{throw Error('No overlays permitted')}}})
  try {
    await generation.runStoryJob(admin,{id:'full-job',project_id:'project',task_id:'task',settings:{...stories.EMPTY_STORY,renderMode:"full-ai",headline:'Texto exacto'},base_path:null,reference_paths:['photo','design'],logo_path:'logo',brand_context:'Imagen 1: foto; Imagen 2: diseño; Imagen 3: logo',model:'gpt-image-2.5-sunburst'})
    assert.equal(fetches.length,1);assert.match(fetches[0].url,/images\/edits$/)
    assert.equal(fetches[0].options.body.getAll('image[]').length,3)
    assert.match(fetches[0].options.body.get('prompt'),/Texto exacto/)
    assert.deepEqual(uploads.find(file=>file.path.endsWith('/final.png')).bytes,pixels)
    assert.ok(updates[0].cost_usd>0);assert.equal(updates[0].provider_request_id,'complete-piece')
  } finally {globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
})

test("transparent graphic layers preserve original photo pixels and reject opaque provider output",async()=>{
  const overlayModule=projectModule('lib/ai/story-photo-overlay.ts')
  const photo=await sharp({create:{width:64,height:112,channels:3,background:'#804020'}}).png().toBuffer()
  const overlay=await sharp({create:{width:64,height:112,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:20,height:20,channels:4,background:'#00ff00'}}).png().toBuffer(),left:10,top:10}]).png().toBuffer()
  const final=await overlayModule.composeStoryPhotoOverlay(photo,overlay,stories.EMPTY_STORY)
  const pixel=async(x,y)=>Array.from(await sharp(final).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer())
  assert.deepEqual(await pixel(50,80),[128,64,32]);assert.deepEqual(await pixel(15,15),[0,255,0])
  await assert.rejects(overlayModule.composeStoryPhotoOverlay(photo,photo,stories.EMPTY_STORY),/transparencia válida/)
  const prompt=stories.storyBasePrompt(stories.EMPTY_STORY,'Brief')
  assert.match(prompt,/FONDO TRANSPARENTE REAL/);assert.match(prompt,/NO reproduzcas ni redibujes/)
})
test("overlay jobs request true transparency and recovery reuses the saved original and generated layer",async()=>{
  const photo=await sharp({create:{width:64,height:112,channels:3,background:'#804020'}}).png().toBuffer()
  const overlay=await sharp({create:{width:64,height:112,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:20,height:20,channels:4,background:'#00ff00'}}).png().toBuffer(),left:10,top:10}]).png().toBuffer()
  const files=new Map(),updates=[],calls=[],originalFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key';let originalReads=0
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{b64_json:overlay.toString('base64')}],usage:{input_tokens_details:{text_tokens:10,image_tokens:20},output_tokens:30}}))}
  let failRegistration=true
  const admin={storage:{from:()=>({download:async path=>({data:files.has(path)?new Blob([files.get(path)]):null,error:null}),upload:async(path,bytes)=>{files.set(path,bytes);return{error:null}}})},from:()=>({update:value=>{updates.push(value);const q={eq:()=>q,in:async()=>({error:null}),then:resolve=>resolve({error:null})};return q}}),rpc:async()=>({error:failRegistration?{code:'test_failure',message:'Registration failed'}:null})}
  const generation=projectModule('lib/ai/story-generation.ts',{'server-only':{},'@/lib/sistema/supabase/admin':{},'@/lib/sistema/assets-storage':{ASSET_BUCKET:'sistema-assets'},'@/lib/ai/creative-studio-context':{},'@/lib/zernio/server':{ZernioRouteError:Error},'./story-references':{readStoryReference:async()=>{originalReads++;return photo}},'./story-composition':{composeStory:async()=>{throw Error('No locally rendered designs')}}})
  const job={id:'overlay-job',project_id:'project',task_id:'task',settings:stories.EMPTY_STORY,base_path:null,reference_paths:['photo'],logo_path:null,brand_context:'Foto original',model:'gpt-image-2.5-sunburst'}
  const priorError=console.error;console.error=()=>{}
  try{
    await generation.runStoryJob(admin,job)
    assert.equal(calls.length,1);assert.equal(calls[0].options.body.get('background'),'transparent')
    const failure=updates.at(-1);assert.ok(failure.cost_usd>0);assert.ok(failure.base_path)
    const firstFinal=files.get(failure.output_path)
    assert.deepEqual(files.get('project/task/stories/overlay-job/background.png'),photo)
    failRegistration=false
    await generation.runStoryJob(admin,{...job,base_path:failure.base_path,usage:failure.usage})
    assert.equal(calls.length,1);assert.equal(originalReads,1)
    assert.deepEqual(files.get(failure.output_path),firstFinal)
    const pixel=Array.from(await sharp(firstFinal).extract({left:50,top:80,width:1,height:1}).removeAlpha().raw().toBuffer())
    assert.deepEqual(pixel,[128,64,32])
  }finally{console.error=priorError;globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
})

test('OpenAI bad requests preserve a sanitized reason and request ID without automatic retries',async()=>{
  const originalFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY,originalLog=console.error
  process.env.OPENAI_API_KEY='test-key'
  const logs=[];let calls=0
  console.error=(...args)=>logs.push(args)
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'invalid_value',param:'size',message:'Unsupported size; key sk-private-test https://example.com/private'}}),{status:400,headers:{'x-request-id':'request-400'}})}
  try{
    const generation=projectModule('lib/ai/story-generation.ts',{'server-only':{},'@/lib/sistema/supabase/admin':{},'@/lib/sistema/assets-storage':{ASSET_BUCKET:'sistema-assets'},'@/lib/ai/creative-studio-context':{},'@/lib/zernio/server':{ZernioRouteError:Error}})
    await assert.rejects(generation.generateOpenAIImage({model:'gpt-image-2.5-sunburst',prompt:'Private prompt',settings:stories.EMPTY_STORY,references:[]}),error=>{
      assert.match(error.message,/Unsupported size/)
      assert.doesNotMatch(error.message,/sk-private|example.com/)
      return true
    })
    assert.equal(calls,1);assert.equal(logs[0][1].requestId,'request-400');assert.equal(logs[0][1].param,'size')
    assert.doesNotMatch(JSON.stringify(logs),/Private prompt|sk-private|example.com/)
  }finally{globalThis.fetch=originalFetch;console.error=originalLog;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
})

test('long brief context fits OpenAI while preserving full story directions, copy, rules and image roles',()=>{
  const settings=stories.storySettingsSchema.parse({...stories.EMPTY_STORY,prompt:'P'.repeat(16000),request:'R'.repeat(4000),rules:'REGLAS EXACTAS '+ 'S'.repeat(2980),headline:'Sepelio: el mito',supportingText:'Información importante',cta:'Consultanos',kicker:'BRANDALISE'})
  const brand='IDENTIDAD DE MARCA\n'+'B'.repeat(40000)+'\nFINAL DEL BRIEF\nRoles de las imágenes adjuntas:\nImagen 1: foto. Imagen 2: LOGOTIPO.'
  for(const renderMode of ['full-ai','ai-overlay']){
    const prompt=stories.storyBasePrompt({...settings,renderMode},brand)
    assert.ok(prompt.length<=32000)
    for(const exact of [settings.prompt,settings.request,settings.rules,settings.headline,settings.supportingText,settings.cta,settings.kicker,'IDENTIDAD DE MARCA','FINAL DEL BRIEF','Imagen 2: LOGOTIPO.']) assert.ok(prompt.includes(exact),exact.slice(0,40))
    assert.match(prompt,/Contexto adicional abreviado/)
  }
  const short=stories.storyBasePrompt({...stories.EMPTY_STORY,prompt:'Pedido único',request:'Pedido único'},'Brief corto')
  assert.equal(short.split('Pedido único').length-1,1)
  assert.ok(short.includes('Brief corto'))
})

test('actual multipart encoding keeps prompts within the limit even with mixed line endings',async()=>{
  const settings={...stories.EMPTY_STORY,prompt:'Dirección\ncreativa\r\ncon reglas\rfinal',request:'Texto\nexacto',rules:'Regla\nprioritaria'}
  const prompt=stories.storyBasePrompt(settings,'BRIEF\n'.repeat(10000)+'Roles de las imágenes adjuntas:\nImagen 1: foto original')
  const form=new FormData();form.set('prompt',prompt)
  form.append('image[]',new Blob(['photo'],{type:'image/png'}),'photo.png')
  const encoded=new Request('https://example.com',{method:'POST',body:form})
  const received=(await encoded.formData()).get('prompt')
  assert.equal(received.length,prompt.length)
  assert.ok(received.length<=32000)
  assert.ok(received.includes(stories.imagePromptTransportText(settings.prompt)))
  assert.ok(received.includes(stories.imagePromptTransportText(settings.request)))
  assert.ok(received.includes('Imagen 1: foto original'))
})
