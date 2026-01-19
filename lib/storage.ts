import { createClient } from '@/lib/supabase/client';

const BUCKET_NAME = 'project-images';

/**
 * Upload an image to Supabase Storage
 * @param file - File to upload
 * @param folder - Optional folder path (e.g., 'proyectos')
 * @returns Public URL of the uploaded image
 */
export async function uploadImage(file: File, folder: string = 'proyectos'): Promise<string> {
    const supabase = createClient();

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) {
        throw new Error(`Error uploading image: ${error.message}`);
    }

    return getPublicUrl(fileName);
}

/**
 * Get public URL for a storage path
 */
export function getPublicUrl(path: string): string {
    const supabase = createClient();
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
}

/**
 * Delete an image from Supabase Storage
 * @param url - Public URL of the image to delete
 */
export async function deleteImage(url: string): Promise<void> {
    const supabase = createClient();

    // Extract path from URL
    const urlParts = url.split(`${BUCKET_NAME}/`);
    if (urlParts.length < 2) {
        console.warn('Invalid image URL for deletion:', url);
        return;
    }

    const path = urlParts[1];

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

    if (error) {
        throw new Error(`Error deleting image: ${error.message}`);
    }
}
