import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    compiler: {
        reactRemoveProperties: true,
    },
    // experimental: {
    //   // even if empty, pass an options object `{}` to the plugin
    //   swcPlugins: [["@effector/swc-plugin", {}]],
    // },
};

export default nextConfig;
