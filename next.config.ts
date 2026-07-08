import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    async headers() {
        return [
            {
                source: '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-store, max-age=0, must-revalidate',
                    },
                ],
            },
        ];
    },
    compiler: {
        reactRemoveProperties: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
            {
                protocol: 'https',
                hostname: '*.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
    // Оптимизация для Windows для предотвращения EPERM ошибок
    onDemandEntries: {
        maxInactiveAge: 60 * 1000,
        pagesBufferLength: 5,
    },
    // experimental: {
    //   // even if empty, pass an options object `{}` to the plugin
    //   swcPlugins: [["@effector/swc-plugin", {}]],
    // },
};

export default nextConfig;
