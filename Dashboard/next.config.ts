import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  eslint: {
    // ❗ allow building even if ESLint finds errors
    ignoreDuringBuilds: true,
  },

  typescript: {
    // ❗ allow building even if TypeScript finds type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
