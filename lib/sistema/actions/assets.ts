"use server"

import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { revalidatePath } from "next/cache"
import type { Annotation, Asset, AssetInsert, AssetVersion, AssetVersionInsert, AssetWithVersions } from "@/types/sistema"
import { ASSET_SIGNED_URL_TTL, createSignedUrl, isStoragePath } from "@/lib/sistema/assets-storage"

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null && 'message' in error) return String((error as any).message)
    return String(error)
}

async function hydrateAssetUrls(assets: AssetWithVersions[]) {
    const hydrated = await Promise.all(
        assets.map(async (asset) => {
            const versions = await Promise.all(
                (asset.versions || []).map(async (version) => {
                    const storagePath = version.storage_path || version.file_url
                    const thumbnailPath = version.thumbnail_path || version.thumbnail_url
                    const previewPath = version.preview_path || version.preview_url

                    const fileUrl = isStoragePath(storagePath)
                        ? (await createSignedUrl(storagePath!, ASSET_SIGNED_URL_TTL))
                        : storagePath

                    const thumbnailUrl = isStoragePath(thumbnailPath)
                        ? (await createSignedUrl(thumbnailPath!, ASSET_SIGNED_URL_TTL))
                        : thumbnailPath

                    const previewUrl = isStoragePath(previewPath)
                        ? (await createSignedUrl(previewPath!, ASSET_SIGNED_URL_TTL))
                        : previewPath

                    return {
                        ...version,
                        file_url: fileUrl || version.file_url,
                        thumbnail_url: thumbnailUrl || version.thumbnail_url,
                        preview_url: previewUrl || version.preview_url,
                        storage_path: storagePath,
                        thumbnail_path: thumbnailPath,
                        preview_path: previewPath
                    }
                })
            )

            return { ...asset, versions }
        })
    )

    return hydrated
}

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
        return { success: false, error: extractErrorMessage(error) }
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
        return { success: false, error: extractErrorMessage(error) }
    }
}

export async function serverGetAssetsForTask(taskId: string) {
    const supabase = await createClient()
    try {
        const { data, error } = await supabase
            .from("sistema_assets")
            .select(`
                *,
                creator:sistema_users!sistema_assets_created_by_fkey(id, nombre, avatar_url),
                versions:sistema_asset_versions(*)
            `)
            .eq("task_id", taskId)
            .order("created_at", { ascending: false })

        if (error) throw error

        const sorted = (data || []).map((a: any) => ({
            ...a,
            versions: (a.versions || []).sort((x: AssetVersion, y: AssetVersion) => y.version_number - x.version_number),
        }))

        const hydrated = await hydrateAssetUrls(sorted as AssetWithVersions[])
        return { success: true, data: hydrated }
    } catch (error) {
        console.error("Error fetching assets:", error)
        return { success: false, error: extractErrorMessage(error) }
    }
}

export async function logAssetAccess(params: {
    asset_id?: string
    asset_version_id?: string
    project_id?: string
    task_id?: string
    actor_user_id?: string | null
    client_access_id?: string | null
    event_type: "view" | "download" | "zip"
    source: "admin" | "client"
    ip?: string | null
    user_agent?: string | null
}) {
    const supabase = createAdminClient()
    try {
        await supabase.from("sistema_asset_access_logs").insert({
            asset_id: params.asset_id || null,
            asset_version_id: params.asset_version_id || null,
            project_id: params.project_id || null,
            task_id: params.task_id || null,
            actor_user_id: params.actor_user_id || null,
            client_access_id: params.client_access_id || null,
            event_type: params.event_type,
            source: params.source,
            ip: params.ip || null,
            user_agent: params.user_agent || null,
        })
    } catch (error) {
        console.error("Error logging asset access:", error)
    }
}

export async function toggleAssetAccess(assetId: string, revoked: boolean) {
    const supabase = await createClient()
    try {
        const { data: userData } = await supabase.auth.getUser()
        const updates = revoked
            ? { access_revoked: true, access_revoked_at: new Date().toISOString(), access_revoked_by: userData.user?.id || null }
            : { access_revoked: false, access_revoked_at: null, access_revoked_by: null }

        const { error } = await supabase.from("sistema_assets").update(updates).eq("id", assetId)
        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error("Error updating asset access:", error)
        return { success: false, error: extractErrorMessage(error) }
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
                versions:sistema_asset_versions ( id, file_url, thumbnail_url, storage_path, thumbnail_path, preview_path, file_type, original_filename, created_at )
            `)
            .eq("access_revoked", false)
            .in("approval_status", ["pending_review", "changes_requested"])
            .order("updated_at", { ascending: false })
            .limit(10)

        if (error) throw error
        const hydrated = await hydrateAssetUrls((data || []) as AssetWithVersions[])
        return { success: true, data: hydrated as any[] }
    } catch (error) {
        console.error("Error fetching pending assets:", error)
        return { success: false, error: "Error al cargar reviews pendientes" }
    }
}

/**
 * Reorder carousel assets by updating their group_order values.
 * @param assetIds Array of asset IDs in the desired order
 */
export async function reorderCarouselAssets(assetIds: string[]) {
    const supabase = await createClient()

    try {
        // Update each asset's group_order based on its position in the array
        const updates = assetIds.map((id, index) =>
            supabase
                .from("sistema_assets")
                .update({ group_order: index })
                .eq("id", id)
        )

        await Promise.all(updates)
        return { success: true }
    } catch (error) {
        console.error("Error reordering assets:", error)
        return { success: false, error: extractErrorMessage(error) }
    }
}

/**
 * Rename all assets in a carousel group.
 * Updates the nombre field with the new name + position suffix.
 */
export async function renameCarouselAssets(groupId: string, newName: string) {
    const supabase = await createClient()

    try {
        // Get all assets in the group ordered by group_order
        const { data: assets, error: fetchError } = await supabase
            .from("sistema_assets")
            .select("id, group_order")
            .eq("group_id", groupId)
            .order("group_order", { ascending: true })

        if (fetchError) throw fetchError

        // Update each asset's name with position suffix
        const total = assets?.length || 0
        const updates = (assets || []).map((asset, idx) =>
            supabase
                .from("sistema_assets")
                .update({ nombre: `${newName} (${idx + 1}/${total})` })
                .eq("id", asset.id)
        )

        await Promise.all(updates)
        return { success: true }
    } catch (error) {
        console.error("Error renaming carousel:", error)
        return { success: false, error: extractErrorMessage(error) }
    }
}

/**
 * Delete all assets in a carousel group.
 */
export async function deleteCarouselGroup(groupId: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from("sistema_assets")
            .delete()
            .eq("group_id", groupId)

        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error("Error deleting carousel group:", error)
        return { success: false, error: extractErrorMessage(error) }
    }
}

/**
 * Get the next group_order value for adding slides to an existing carousel.
 */
export async function getNextGroupOrder(groupId: string): Promise<number> {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from("sistema_assets")
            .select("group_order")
            .eq("group_id", groupId)
            .order("group_order", { ascending: false })
            .limit(1)

        if (error) throw error
        return (data?.[0]?.group_order ?? -1) + 1
    } catch (error) {
        console.error("Error getting next group order:", error)
        return 0
    }
}
