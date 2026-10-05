import { NextResponse } from "next/server"
import { z } from "zod"
import { storySession } from "@/lib/ai/story-generation"
import { storyReferenceCatalog, readStoryReference, referencePaths } from "@/lib/ai/story-references"
import sharp from "sharp"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request: Request) {
  try {
    const url=new URL(request.url),projectId=z.string().uuid().parse(url.searchParams.get("projectId"))
    const session=await storySession(projectId)
    const {data:brief,error}=await session.server.from("sistema_client_briefs").select("*").eq("project_id",projectId).maybeSingle()
    if(error) throw error
    const id=url.searchParams.get("id"),source=url.searchParams.get("source")
    if(id) {
      const paths=await referencePaths(session.server,"",projectId,source==="asset"?[z.string().uuid().parse(id)]:[],source==="drive"?[id]:[],brief)
      if(paths.length!==1) return NextResponse.json({error:"Referencia inválida"},{status:400})
      // Reference validation above limits access to this project's assets and linked bank.
      const image=await sharp(await readStoryReference(session.server,paths[0])).resize(320,320,{fit:"inside"}).webp({quality:75}).toBuffer()
      return new Response(new Uint8Array(image),{headers:{"Content-Type":"image/webp","Cache-Control":"private, max-age=300"}})
    }
    return NextResponse.json({references:await storyReferenceCatalog(session.server,projectId,brief)})
  }catch {return NextResponse.json({error:"No se pudo cargar el banco. Revisá que la cuenta de Drive tenga acceso a la carpeta del brief."},{status:400})}
}
