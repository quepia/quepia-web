'use client';

import { Suspense, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  GOOGLE_TAG_ID,
  GOOGLE_GTM_ID,
  trackPublicEvent,
  trackLead,
  META_PIXEL_ID,
  isTrackableRoute,
  trackPageView,
} from '@/lib/marketing-analytics';

function getGoogleTagBootstrap(tagId: string) {
  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', '${tagId}', { send_page_view: true });
  `;
}

function getMetaPixelBootstrap(pixelId: string) {
  return `
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `;
}

function MarketingAnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasTrackedInitialView = useRef(false);
  const search = searchParams?.toString() ?? '';
  const isPublicRoute = isTrackableRoute(pathname);
  useEffect(() => {
    if (!isPublicRoute) return;
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const name = /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//.test(href) ? 'click_whatsapp' : href.startsWith('mailto:') ? 'click_email' : href.startsWith('tel:') ? 'click_phone' : '';
      if (name) trackPublicEvent(name, { page: pathname || '/', service: anchor.dataset.service || (pathname?.startsWith('/servicios/') ? pathname.split('/')[2] : 'general') });
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [pathname, isPublicRoute]);
  useEffect(() => {
    if (pathname !== '/gracias') return;
    const lead = sessionStorage.getItem('quepia-lead');
    if (!lead) return;
    try {
      const payload = JSON.parse(lead);
      trackLead({ service: payload.service, source: payload.source });
      sessionStorage.removeItem('quepia-lead');
    } catch { sessionStorage.removeItem('quepia-lead'); }
  }, [pathname]);

  useEffect(() => {
    if (!pathname || !isPublicRoute) {
      return;
    }

    if (!hasTrackedInitialView.current) {
      hasTrackedInitialView.current = true;
      return;
    }

    const url = search ? `${pathname}?${search}` : pathname;
    trackPageView(url);
  }, [pathname, search, isPublicRoute]);

  if (!isPublicRoute) {
    return null;
  }

  return (
    <>
      {GOOGLE_TAG_ID && !GOOGLE_GTM_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-tag" strategy="afterInteractive">
            {getGoogleTagBootstrap(GOOGLE_TAG_ID)}
          </Script>
        </>
      ) : null}

      {GOOGLE_GTM_ID ? <Script id="google-tag-manager" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id=${GOOGLE_GTM_ID}';document.head.appendChild(s);`}</Script> : null}
      {META_PIXEL_ID ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {getMetaPixelBootstrap(META_PIXEL_ID)}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}

export default function MarketingAnalytics() {
  return (
    <Suspense fallback={null}>
      <MarketingAnalyticsInner />
    </Suspense>
  );
}
