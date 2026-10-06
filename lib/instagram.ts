export const DEFAULT_INSTAGRAM_HANDLE = 'quepiastudio';
export const DEFAULT_INSTAGRAM_URL = `https://instagram.com/${DEFAULT_INSTAGRAM_HANDLE}`;
// Único perfil oficial de Quepia (confirmado 06/10/2026). No hay LinkedIn, Facebook, YouTube, TikTok ni Behance.
export const OFFICIAL_INSTAGRAM_URL = 'https://www.instagram.com/quepiastudio/';

const extractInstagramHandle = (value?: string | null) => {
    if (!value) {
        return DEFAULT_INSTAGRAM_HANDLE;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_INSTAGRAM_HANDLE;
    }

    const withoutDomain = trimmed.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    const withoutAt = withoutDomain.replace(/^@/, '');
    const handle = withoutAt.split(/[/?#]/)[0]?.trim();

    return handle || DEFAULT_INSTAGRAM_HANDLE;
};

export const getInstagramUrl = (value?: string | null) => {
    if (!value?.trim()) {
        return DEFAULT_INSTAGRAM_URL;
    }

    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `https://instagram.com/${extractInstagramHandle(trimmed)}`;
};

export const getInstagramLabel = (value?: string | null) => `@${extractInstagramHandle(value)}`;
