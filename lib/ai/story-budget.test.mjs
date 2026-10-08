import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'

const stories = projectModule('lib/ai/stories.ts')
test('rejected requests release reserves while ambiguous failures retain them', async () => {
  const generation = projectModule('lib/ai/story-generation.ts', {'server-only': {}, '@/lib/sistema/supabase/admin': {}, '@/lib/sistema/assets-storage': {ASSET_BUCKET:'sistema-assets'}, '@/lib/ai/creative-studio-context': {}, '@/lib/zernio/server': {ZernioRouteError:Error}})
  const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY, originalError = console.error
  process.env.OPENAI_API_KEY = 'test-key'
  console.error = () => {}
  try {
    for (const status of [400, 500, 'timeout']) {
      const updates = []
      const admin = {from: () => ({update: value => {updates.push(value); const query = {eq: () => query, in: async () => ({error:null})}; return query}})}
      globalThis.fetch = async () => {
        if (status === 'timeout') throw new DOMException('Timed out', 'TimeoutError')
        return new Response(JSON.stringify({error:{message:'Invalid prompt'}}), {status})
      }
      await generation.runStoryJob(admin, {id:'job',task_id:'task',project_id:'project',settings:{...stories.EMPTY_STORY,renderMode:'full-ai',backgroundSource:'ai'},base_path:null,usage:null,provider_request_id:null,reference_paths:[],logo_path:null,model:'test',brand_context:''})
      const failure = updates.at(-1)
      if (status === 400) assert.equal(failure.cost_usd, 0, JSON.stringify(failure))
      else assert.equal(Object.hasOwn(failure, 'cost_usd'), false)
      assert.equal(failure.status, status === 'timeout' ? 'needs_attention' : 'failed')
    }
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  }
})
