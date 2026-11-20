/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Lets a production build run beside a running dev server (NEXT_DIST_DIR=.next-build pnpm build).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
