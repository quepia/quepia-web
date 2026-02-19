import { createClient } from '@/lib/supabase/client';

const BUCKET_NAME = 'project-images';
const MAX_UPLOAD_RETRIES = 2;
const UPLOAD_TIMEOUT_MS = 45_000;
const MAX_IMAGE_DIMENSION = 2400;
const MIN_SIZE_TO_COMPRESS = 1_200_000;

interface SignedUploadTarget {
    bucket: string;
    path: string;
    token: string;
    publicUrl: string;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(input: string): string {
    const value = input
        .trim()
        .replaceAll('\\', '/')
        .split('/')
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\.+/, '')
        .slice(0, 120);

    return value && value.length > 0 ? value : `upload-${Date.now()}.jpg`;
}

async function compressImageIfNeeded(file: File): Promise<File> {
    const imageLike = /^image\/(png|jpe?g|webp)$/i.test(file.type);
    if (!imageLike || typeof window === 'undefined' || typeof createImageBitmap !== 'function') {
        return file;
    }

    let bitmap: ImageBitmap | null = null;
    try {
        bitmap = await createImageBitmap(file);
        const maxSide = Math.max(bitmap.width, bitmap.height);
        const needsResize = maxSide > MAX_IMAGE_DIMENSION;
        const needsCompress = file.size > MIN_SIZE_TO_COMPRESS;

        if (!needsResize && !needsCompress) {
            bitmap.close();
            return file;
        }

        const scale = Math.min(1, MAX_IMAGE_DIMENSION / maxSide);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return file;
        }

        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const quality = file.size > 8_000_000 ? 0.72 : file.size > 4_000_000 ? 0.8 : 0.86;
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((output) => resolve(output), 'image/jpeg', quality);
        });

        if (!blob) return file;
        if (blob.size >= file.size * 0.95 && !needsResize) return file;

        const baseName = sanitizeFilename(file.name).replace(/\.[^.]+$/, '') || `upload-${Date.now()}`;
        return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch {
        if (bitmap) bitmap.close();
        return file;
    }
}

async function postBinaryWithTimeout(url: string, file: File): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        return await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function requestSignedUploadTarget(folder: string, file: File): Promise<SignedUploadTarget> {
    const response = await fetch('/api/storage/upload-url', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            folder,
            filename: sanitizeFilename(file.name),
            contentType: file.type || 'application/octet-stream',
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
        throw new Error(detail);
    }

    if (
        typeof payload?.bucket !== 'string' ||
        typeof payload?.path !== 'string' ||
        typeof payload?.token !== 'string' ||
        typeof payload?.publicUrl !== 'string'
    ) {
        throw new Error('respuesta inválida al crear upload firmado');
    }

    return payload as SignedUploadTarget;
}

/**
 * Upload an image to Supabase Storage
 * @param file - File to upload
 * @param folder - Optional folder path (e.g., 'proyectos')
 * @returns Public URL of the uploaded image
 */
export async function uploadImage(file: File, folder: string = 'proyectos'): Promise<string> {
    const preparedFile = await compressImageIfNeeded(file);
    const filename = sanitizeFilename(preparedFile.name || file.name);
    let lastError = 'Error desconocido';

    try {
        const target = await requestSignedUploadTarget(folder, preparedFile);
        const supabase = createClient();
        const { error } = await supabase.storage
            .from(target.bucket)
            .uploadToSignedUrl(target.path, target.token, preparedFile);
        if (error) {
            throw new Error(error.message);
        }
        return target.publicUrl;
    } catch (error) {
        lastError = error instanceof Error ? error.message : 'fallo subida firmada';
    }

    for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt += 1) {
        try {
            const query = new URLSearchParams({
                folder,
                filename,
            });

            const response = await postBinaryWithTimeout(`/api/storage/upload?${query.toString()}`, preparedFile);

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
                lastError = detail;
            } else if (typeof payload?.url === 'string' && payload.url.length > 0) {
                return payload.url;
            } else {
                lastError = 'respuesta inválida del servidor';
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                lastError = `timeout de subida (${UPLOAD_TIMEOUT_MS / 1000}s)`;
            } else {
                lastError = error instanceof Error ? error.message : 'fallo de red';
            }
        }

        if (attempt < MAX_UPLOAD_RETRIES) {
            await delay(400 * (attempt + 1));
        }
    }

    throw new Error(`Error uploading image: ${lastError}`);
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
    // Extract path from URL
    const urlParts = url.split(`${BUCKET_NAME}/`);
    if (urlParts.length < 2) {
        console.warn('Invalid image URL for deletion:', url);
        return;
    }

    const path = urlParts[1];

    const response = await fetch('/api/storage/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
        throw new Error(`Error deleting image: ${detail}`);
    }
}
