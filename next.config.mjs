/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is advisory here; do not block production builds on style rules.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
