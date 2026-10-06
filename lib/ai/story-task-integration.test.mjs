import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'
const {readStorySettings,storyBasePrompt}=projectModule('lib/ai/stories.ts')
test('legacy labeled multiline copy populates the editor and image prompt',()=>{
 const settings=readStorySettings({}, {descripcion:'Objetivo: reservas\nVisual: paisaje\n**Titular exacto:** Escapate\neste finde\nTexto secundario: Cabañas junto al río\nCTA: Escribinos\nRestricciones: Sin precios\nReferencias: photo123456789'})
 assert.equal(settings.headline,'Escapate\neste finde')
 assert.equal(settings.supportingText,'Cabañas junto al río')
 assert.equal(settings.cta,'Escribinos');assert.equal(settings.rules,'Sin precios')
 assert.ok(storyBasePrompt(settings,'Marca').includes('Escribinos'))
})
test('saved copy and explicitly cleared fields win over the task description',()=>{
 const settings=readStorySettings({story:{headline:'Nuevo titular',cta:'',supportingText:'Texto guardado',format:'obsolete'}},{descripcion:'Titular: Viejo\nCTA: Reservá\nTexto secundario: Viejo'})
 assert.equal(settings.headline,'Nuevo titular');assert.equal(settings.cta,'');assert.equal(settings.supportingText,'Texto guardado');assert.equal(settings.format,'story')
})
test('narrative and overlong blocks are not treated as exact image copy',()=>{
 assert.equal(readStorySettings({}, {descripcion:'Una historia con un titular emotivo y CTA para reservar.'}).headline,'')
 assert.equal(readStorySettings({}, {descripcion:'Texto exacto: '+ 'a'.repeat(121)+'\nCTA: Consultanos'}).headline,'')
 assert.equal(readStorySettings({}, {descripcion:'Texto exacto: '+ 'a'.repeat(121)+'\nCTA: Consultanos'}).cta,'Consultanos')
})
