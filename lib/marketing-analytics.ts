export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';
const configuredGoogleTag = process.env.NEXT_PUBLIC_GA_ID ?? process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
export const GOOGLE_TAG_ID = /^(G|AW|GT)-[A-Z0-9]+$/.test(configuredGoogleTag) ? configuredGoogleTag : '';

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

  if (GOOGLE_GTM_ID) {
    trackPublicEvent('virtual_page_view', { page_path: url, page_location: window.location.href });
  } else if (GOOGLE_TAG_ID && typeof window.gtag === 'function') {
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

  trackPublicEvent('generate_lead', {
    lead_source: payload.source || 'contact_form',
    service: payload.service || 'contact_form',
    email_present: Boolean(payload.email),
    page: window.location.pathname,
  });
}

export const GOOGLE_GTM_ID = /^GTM-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GTM_ID || '') ? process.env.NEXT_PUBLIC_GTM_ID! : '';
export function trackPublicEvent(event: string, parameters: Record<string, string | boolean> = {}) {
  if (typeof window === 'undefined' || !isTrackableRoute(window.location.pathname)) return;
  window.dataLayer = window.dataLayer || [];
  if (GOOGLE_GTM_ID) window.dataLayer.push({ event, ...parameters });
  else if (GOOGLE_TAG_ID) {
    const send = window.gtag || ((...args: unknown[]) => { window.dataLayer!.push(args); });
    send('event', event, parameters);
  }
}
