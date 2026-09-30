import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent renderer: ship the caption font and the ffmpeg binaries with the agent API functions.
  outputFileTracingIncludes: {
    "/api/agent/**/*": ["./assets/fonts/**/*", "./node_modules/ffmpeg-static/ffmpeg"],
    "/api/cron": ["./assets/fonts/**/*", "./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
