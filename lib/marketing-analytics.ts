export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';
export const GOOGLE_TAG_ID =
  process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ??
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ??
  '';

const EXCLUDED_ROUTE_PREFIXES = [
  '/admin',
  '/auth',
  '/sistema',
  '/cliente',
  '/review',
  '/propuesta',
];

export function isTrackableRoute(pathname?: string | null) {
  if (!pathname) {
    return false;
  }

  return !EXCLUDED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
    _fbq?: Window['fbq'];
    gtag?: (...args: unknown[]) => void;
  }
}

interface LeadTrackingPayload {
  email?: string;
  service?: string;
  source?: string;
}

export function trackPageView(url: string) {
  if (META_PIXEL_ID && typeof window.fbq === 'function') {
    window.fbq('track', 'PageView');
  }

  if (GOOGLE_TAG_ID && typeof window.gtag === 'function') {
    window.gtag('config', GOOGLE_TAG_ID, {
      page_path: url,
      page_location: window.location.href,
    });
  }
}

export function trackLead(payload: LeadTrackingPayload = {}) {
  if (META_PIXEL_ID && typeof window.fbq === 'function') {
    window.fbq('track', 'Lead', {
      content_name: payload.service || 'contact_form',
      lead_source: payload.source || 'contact_form',
    });
  }

  if (GOOGLE_TAG_ID && typeof window.gtag === 'function') {
    window.gtag('event', 'generate_lead', {
      lead_source: payload.source || 'contact_form',
      service: payload.service || 'contact_form',
      email_present: Boolean(payload.email),
    });
  }
}
