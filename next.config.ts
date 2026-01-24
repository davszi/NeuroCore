import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // In Next.js 15, 'instrumentationHook' is automatic if instrumentation.ts exists.
  // We use the stable 'serverExternalPackages' instead of the experimental option.
  serverExternalPackages: ['ssh2', 'node-ssh'],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure native modules are not bundled on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        ssh2: false, 
      };
    }
    return config;
  },
};

export default nextConfig;