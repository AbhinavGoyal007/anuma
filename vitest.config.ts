import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL("./src", import.meta.url))),
      // `server-only` throws on import outside a Server Component, which is the
      // point of it. Under vitest the guard has nothing to protect, so it is
      // stubbed rather than removed from the modules that legitimately declare it.
      "server-only": path.resolve(fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url))),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
