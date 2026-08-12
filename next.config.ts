import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /**
   * `ffmpeg-static` resolves to a binary that is spawned at runtime, so nothing
   * in the module graph references the file itself and Next's tracing leaves it
   * out of the deployment. Audio preprocessing then silently falls back to
   * sending the untrimmed recording — the pipeline keeps working and the saving
   * quietly disappears, which is the hardest kind of regression to notice.
   */
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default withWorkflow(nextConfig);
