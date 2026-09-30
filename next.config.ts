import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shorts Agent (server-side rendering on Vercel): keep the ffmpeg binary as a real file
  // and ship it + the caption font with the agent's API functions. No effect on other routes.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/agent/**/*": ["./node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**/*"],
  },
};

export default nextConfig;
