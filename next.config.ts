import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    compiler: {
        reactRemoveProperties: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
    // experimental: {
    //   // even if empty, pass an options object `{}` to the plugin
    //   swcPlugins: [["@effector/swc-plugin", {}]],
    // },
};

export default nextConfig;
