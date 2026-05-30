// Proxy API calls to the chalkboard server so the browser never deals with
// CORS and the studio can be deployed independently of the backend.
const API = process.env.CHALKBOARD_API || 'http://localhost:4140';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/:path*` }];
  },
};

export default nextConfig;
