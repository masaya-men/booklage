import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React Strict Mode — GSAP Draggable doesn't survive kill+recreate cycle
  // TODO: Find a proper workaround and re-enable
  reactStrictMode: false,
};

export default nextConfig;
