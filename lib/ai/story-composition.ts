import path from "node:path"
import { openSync, type Font } from "fontkit"
import sharp, { type OverlayOptions } from "sharp"
import { STORY_FORMATS, type StorySettings } from "./stories"

export function escapeSvg(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!)
}
export function wrapStoryText(text: string, maxChars = 25) {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = "" }
      // Break unusually long words instead of overflowing the safe zone.
      let rest = word
      while (rest.length > maxChars) {
        if (line) { lines.push(line); line = "" }
        lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars)
      }
      line = line ? `${line} ${rest}` : rest
    }
    if (line) lines.push(line)
  }
  return lines
}


const fonts = new Map<string, Font>()
function storyFont(headline: boolean) {
  const filename = headline ? "BarlowCondensed-Bold.ttf" : "Barlow-SemiBold.ttf"
  if (!fonts.has(filename)) {
    const font = openSync(path.join(process.cwd(), "public/fonts/story", filename))
    if (!("layout" in font)) throw new Error("La fuente de historias no es válida")
    fonts.set(filename, font)
  }
  return fonts.get(filename)!
}

/** Convert glyphs to paths so rendering never depends on server font discovery. */
export async function renderStoryText(text: string, width: number, maxHeight: number, color: string, headline = false, maxSize = 150) {
  const font = storyFont(headline)
  if ([...text].some(char=>!/[\s]/.test(char) && !font.hasGlyphForCodePoint(char.codePointAt(0)!)))
    throw new Error("El texto contiene un símbolo que la fuente no admite. Usá texto sin emojis.")
  for (let size=maxSize;size>=24;size-=4) {
    const scale=size/font.unitsPerEm
    const measure=(value:string)=>font.layout(value).advanceWidth*scale
    const lines:string[]=[]
    for(const paragraph of text.split("\n")) {
      let line=""
      for(const word of paragraph.split(/\s+/).filter(Boolean)) {
        if(line && measure(`${line} ${word}`)>width) {lines.push(line);line=""}
        line=line?`${line} ${word}`:word
      }
      if(line) lines.push(line)
    }
    const lineHeight=size*(headline?0.92:1.18)
    const height=Math.ceil((font.ascent-font.descent)*scale+Math.max(0,lines.length-1)*lineHeight)
    if(height>maxHeight || lines.some(line=>measure(line)>width-8)) continue
    const paths=lines.map((line,i)=>{
      const run=font.layout(line)
      let cursor=(width-run.advanceWidth*scale)/2
      const baseline=i*lineHeight+font.ascent*scale
      return run.glyphs.map((glyph,j)=>{
        const position=run.positions[j]
        const outline=`<path d="${glyph.path.toSVG()}" transform="translate(${cursor+position.xOffset*scale} ${baseline-position.yOffset*scale}) scale(${scale} ${-scale})"/>`
        cursor+=position.xAdvance*scale
        return outline
      }).join("")
    }).join("")
    const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="${color}">${paths}</g></svg>`)
    const rendered=await sharp(svg).trim().png().toBuffer({resolveWithObject:true})
    return {bytes:rendered.data,width:rendered.info.width,height:rendered.info.height}
  }
  throw new Error("El texto es demasiado largo para esta composición; acortá el titular")
}

export async function composeStory(base: Buffer, settings: StorySettings, logo?: Buffer | null) {
  const {width,height}=STORY_FORMATS[settings.format]
  const image=await sharp(base,{limitInputPixels:40_000_000}).rotate()
    .resize(width,height,{fit:settings.mode==="faithful"?settings.photoFit:"cover",background:settings.backgroundColor}).png().toBuffer()
  const layers: OverlayOptions[]=[]
  const safeY=settings.format==="story"?240:90
  const outdoor=settings.design==="outdoor"
  const panelWidth=width-144
  const svg=(content:string)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`)
  const box=(x:number,y:number,w:number,h:number,fill:string,stroke?:string,dashed=false)=>{
    layers.push({input:svg(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(48,h/2)}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="3"`:""}/>${dashed?`<rect x="${x+12}" y="${y+12}" width="${w-24}" height="${h-24}" rx="${Math.min(38,h/2-12)}" fill="none" stroke="${settings.primaryColor}" stroke-width="2" stroke-dasharray="12 9"/>`:""}`),top:0,left:0})
  }
  if(settings.headline || settings.cta || settings.kicker || settings.supportingText) {
    layers.push({input:svg(`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${outdoor?settings.primaryColor:"#000000"}" stop-opacity="0.08"/><stop offset="65%" stop-color="${outdoor?settings.primaryColor:"#000000"}" stop-opacity="0.12"/><stop offset="100%" stop-color="${outdoor?settings.primaryColor:"#000000"}" stop-opacity="0.75"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#shade)"/>`),top:0,left:0})
    const headline=settings.headline?await renderStoryText(settings.headline,panelWidth-64,height*0.30,outdoor?settings.primaryColor:settings.textColor,true,settings.format==="story"?224:152):null
    const supporting=settings.supportingText?await renderStoryText(settings.supportingText,panelWidth-80,height*0.14,outdoor?settings.primaryColor:settings.textColor,false,52):null
    const cta=settings.cta?await renderStoryText(settings.cta,panelWidth-104,120,settings.panelColor,false,46):null
    const kicker=settings.kicker?await renderStoryText(settings.kicker,panelWidth-100,95,outdoor?settings.primaryColor:settings.panelColor,true,56):null
    const titleH=headline?headline.height+64:0
    const blockH=titleH+(kicker?kicker.height+82:0)+(supporting?supporting.height+86:0)+(cta?cta.height+92:0)
    let y=settings.headlinePosition==="top"?safeY:Math.max(safeY,height-safeY-blockH)
    if(outdoor) y=Math.max(safeY,Math.min(safeY+80,height-safeY-blockH))
    if(kicker) {
      const h=kicker.height+44
      box(150,y,width-300,h,outdoor?settings.accentColor:settings.primaryColor,settings.panelColor,outdoor)
      // Render the label within the smaller pill to prevent long labels crossing its edges.
      const label=await renderStoryText(settings.kicker,width-380,95,outdoor?settings.primaryColor:settings.panelColor,true,56)
      layers.push({input:label.bytes,top:Math.round(y+(h-label.height)/2),left:Math.round((width-label.width)/2)})
      y+=h+38
    }
    if(headline) {
      if(outdoor) box(72,y,panelWidth,titleH,settings.panelColor)
      layers.push({input:headline.bytes,top:Math.round(y+32),left:Math.round((width-headline.width)/2)})
      y+=titleH+32
    }
    if(supporting) {
      if(outdoor) box(72,y,panelWidth,supporting.height+54,settings.panelColor,settings.accentColor)
      layers.push({input:supporting.bytes,top:Math.round(y+27),left:Math.round((width-supporting.width)/2)})
      y+=supporting.height+86
    }
    if(cta) {
      box(92,y,width-184,cta.height+52,settings.primaryColor,settings.panelColor)
      layers.push({input:cta.bytes,top:Math.round(y+26),left:Math.round((width-cta.width)/2)})
    }
    if(outdoor) layers.push({input:svg(`<path d="M-30 120 Q${width/2} 30 ${width+30} 140" fill="none" stroke="${settings.accentColor}" stroke-width="4"/><path d="M-30 ${height-260} Q${width/2} ${height-90} ${width+30} ${height-260}" fill="none" stroke="${settings.accentColor}" stroke-width="4"/>`),top:0,left:0})
  }
  if(logo && settings.includeLogo) {
    const resized=await sharp(logo,{limitInputPixels:20_000_000}).rotate().resize(outdoor?250:230,outdoor?220:130,{fit:"inside",withoutEnlargement:true}).png().toBuffer()
    const dimensions=await sharp(resized).metadata()
    layers.push({input:resized,top:outdoor?height-safeY-(dimensions.height || 130):safeY-100,left:outdoor?Math.round((width-(dimensions.width || 230))/2):width-(dimensions.width || 230)-80})
  }
  return sharp(image).composite(layers).png().toBuffer()
}
