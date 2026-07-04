const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const API_BASE = process.env.INTERNAL_API_URL || "http://localhost:8080";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_BASE}/v1/:path*`,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
