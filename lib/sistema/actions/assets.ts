"use server"

import { createClient } from "@/lib/sistema/supabase/server"
import { revalidatePath } from "next/cache"
import type { Annotation, Asset, AssetInsert, AssetVersion, AssetVersionInsert, AssetWithVersions } from "@/types/sistema"

export async function serverCreateAsset(asset: AssetInsert) {
    const supabase = await createClient()
    try {
        const { data, error } = await supabase
            .from("sistema_assets")
            .insert(asset)
            .select()
            .single()
        if (error) throw error
        return { success: true, data: data as Asset }
    } catch (error) {
        console.error("Error creating asset:", error)
        return { success: false, error: String(error) }
    }
}

export async function serverAddVersion(version: AssetVersionInsert) {
    const supabase = await createClient()
    try {
        const { data, error } = await supabase
            .from("sistema_asset_versions")
            .insert(version)
            .select()
            .single()
        if (error) throw error

        // Update asset current_version
        await supabase
            .from("sistema_assets")
            .update({ current_version: version.version_number })
            .eq("id", version.asset_id)

        return { success: true, data: data as AssetVersion }
    } catch (error) {
        console.error("Error adding version:", error)
        return { success: false, error: String(error) }
    }
}

export async function getAnnotations(assetVersionId: string) {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from("sistema_annotations")
            .select("*")
            .eq("asset_version_id", assetVersionId)
            .order("created_at", { ascending: true })

        if (error) throw error
        return { success: true, data: data as Annotation[] }
    } catch (error) {
        console.error("Error fetching annotations:", error)
        return { success: false, error: "Error al cargar anotaciones" }
    }
}

export async function createAnnotation(data: {
    asset_version_id: string
    x_percent: number
    y_percent: number
    feedback_type: string
    contenido: string
    author_name?: string
}) {
    const supabase = await createClient()

    try {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id

        const annotationData: any = {
            ...data,
            author_id: userId,
        }

        // If no logged in user (e.g. client viewing shared link), ensure author_name is provided
        // Ideally the client portal would handle this differently, but for now we assume system usage mainly

        const { data: newAnnotation, error } = await supabase
            .from("sistema_annotations")
            .insert(annotationData)
            .select()
            .single()

        if (error) throw error

        // Revalidate paths might be needed if viewed in server component context, 
        // but annotations are mostly client-side fetched in the modal.
        return { success: true, data: newAnnotation as Annotation }
    } catch (error) {
        console.error("Error creating annotation:", error)
        return { success: false, error: "Error al crear anotación" }
    }
}

export async function resolveAnnotation(id: string, resolved: boolean) {
    const supabase = await createClient()

    try {
        const { data: userData } = await supabase.auth.getUser()

        const updates = {
            resolved,
            resolved_by: resolved ? userData.user?.id : null,
            resolved_at: resolved ? new Date().toISOString() : null
        }

        const { error } = await supabase
            .from("sistema_annotations")
            .update(updates)
            .eq("id", id)

        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error("Error updating annotation:", error)
        return { success: false, error: "Error al actualizar anotación" }
    }
}

export async function getPendingAssets() {
    const supabase = await createClient()

    try {
        // Fetch assets that are pending review or have changes requested
        // This is a simplified query, might need joining with tasks/projects for more context
        const { data, error } = await supabase
            .from("sistema_assets")
            .select(`
                *,
                task:task_id ( id, titulo, project:project_id ( id, nombre, color ) ),
                versions:sistema_asset_versions ( id, file_url, created_at )
            `)
            .in("approval_status", ["pending_review", "changes_requested"])
            .order("updated_at", { ascending: false })
            .limit(10)

        if (error) throw error
        return { success: true, data: data as any[] }
    } catch (error) {
        console.error("Error fetching pending assets:", error)
        return { success: false, error: "Error al cargar reviews pendientes" }
    }
}
