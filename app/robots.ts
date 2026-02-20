import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/sistema',
        '/cliente',
        '/cliente/',
        '/propuesta',
        '/propuesta/',
        '/review',
        '/review/',
        '/auth',
        '/auth/',
        '/api',
        '/api/',
      ],
    },
    sitemap: 'https://quepia.com/sitemap.xml',
  };
}
