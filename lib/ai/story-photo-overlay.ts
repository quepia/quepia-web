import sharp from "sharp"
import type { StorySettings } from "./stories"

/** Alpha composition only: no typography, color treatments or design generated locally. */
export async function composeStoryPhotoOverlay(photo: Buffer, overlay: Buffer, settings: StorySettings) {
  const {data,info}=await sharp(overlay,{limitInputPixels:40_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  let transparent=0, visible=0
  for(let i=3;i<data.length;i+=4) {
    if(data[i]<32) transparent++
    if(data[i]>128) visible++
  }
  const pixels=info.width*info.height
  if(transparent/pixels<0.05 || visible/pixels<0.005)
    throw new Error("OpenAI no devolvió una capa de diseño con transparencia válida. El resultado y su consumo quedaron guardados; no se regeneró automáticamente.")
  const background=await sharp(photo,{limitInputPixels:40_000_000}).rotate()
    .resize(info.width,info.height,{fit:settings.photoFit,background:settings.backgroundColor}).png().toBuffer()
  return sharp(background).composite([{input:overlay,top:0,left:0}]).png().toBuffer()
}
