/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🚫 disable sourcemaps in dev & production
  productionBrowserSourceMaps: false,

  webpack(config, { dev }) {
    if (dev) {
      config.devtool = false; // disable source maps
    }
    return config;
  },

  // 🧩 patch turbopack sourcemap resolution
  experimental: {
    turbo: {
      resolveAlias: {
        "source-map-js": false,
      },
    },
  },
};

export default nextConfig;
