/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Export static routes with trailing slashes so Electron can serve nested workflow pages.
  trailingSlash: true,
};

export default nextConfig;
