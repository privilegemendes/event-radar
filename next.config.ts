import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "3000--dev--speaking-engine--irmak--apps.us-east-2.cdrstable.dev",
    "3000--dev--event-radar--irmak--apps.us-east-2.cdrstable.dev",
  ],
};

export default nextConfig;
