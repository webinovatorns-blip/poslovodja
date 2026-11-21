import type { NextConfig } from "next";

import { appBasePath } from "./src/config/base-path";
import { securityHeaders } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  // Production is mounted at /poslovodja. Local development stays at /.
  basePath: appBasePath,
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    // `source` is prefixed with basePath automatically (/poslovodja in production).
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
