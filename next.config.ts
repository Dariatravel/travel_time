import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    experimental: {
        prefetch: false,
    },
    compiler: {
        reactRemoveProperties: true,
    },
    // experimental: {
    //   // even if empty, pass an options object `{}` to the plugin
    //   swcPlugins: [["@effector/swc-plugin", {}]],
    // },
};

export default nextConfig;
