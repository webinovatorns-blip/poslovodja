import type { NextConfig } from "next";

import { appBasePath } from "./src/config/base-path";

const nextConfig: NextConfig = {
  // Production is mounted at /poslovodja. Local development stays at /.
  basePath: appBasePath,
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
