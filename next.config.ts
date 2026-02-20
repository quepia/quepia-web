import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co https://*.supabase.com https://api.resend.com https://vitals.vercel-insights.com https://*.vercel-insights.com",
      "frame-ancestors 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    ];

    const noIndexHeader = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Block indexing of private/internal routes
      {
        source: '/sistema/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
      {
        source: '/cliente/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
      {
        source: '/auth/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
      {
        source: '/propuesta/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
      {
        source: '/review/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
      {
        source: '/api/:path*',
        headers: [...securityHeaders, noIndexHeader],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
  webpack: (config, { isServer }) => {
    // Handle WASM files (needed by @react-three/rapier)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // Prevent WASM from being processed on server side
    if (isServer) {
      config.externals = config.externals || [];
    }
    return config;
  },
};

export default nextConfig;
