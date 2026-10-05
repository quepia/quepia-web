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
  assert.equal(stories.storyReservation({...stories.EMPTY_STORY,mode:"faithful"}),0)
})
test("composition preserves original geometry and brand logo pixels",async()=>{
  const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#00ff00"}}).png().toBuffer()
  const logo=await sharp({create:{width:100,height:50,channels:4,background:"#ff0000"}}).png().toBuffer()
  const final=await composition.composeStory(base,{...stories.EMPTY_STORY,mode:"faithful",backgroundColor:"#0000ff"},logo)
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
