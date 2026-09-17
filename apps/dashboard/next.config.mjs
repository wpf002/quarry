/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma must stay external to the server bundle.
  serverExternalPackages: ['@prisma/client', '@quarry/db', '@quarry/autonomy'],
};
export default nextConfig;
