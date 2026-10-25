import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {"/api/quality/**/*":["./assets/quality-fonts/*"],"/api/mobile/quality/**/*":["./assets/quality-fonts/*"]},
};

export default nextConfig;
