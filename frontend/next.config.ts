import type { NextConfig } from "next";

// Static export: no SSR server to pay for or secure (docs/architecture.md, section 4).
// Dynamic pages use query-string routes (for example /student/module?id=...),
// because path-parameter pages do not combine with Amplify's catch-all rewrite.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
