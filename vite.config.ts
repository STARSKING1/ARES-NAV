import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://trek.nasa.gov",
  "connect-src 'self' https://trek.nasa.gov",
  "worker-src 'self' blob:",
  "font-src 'self'"
].join("; ");

const injectContentSecurityPolicy = (): Plugin => ({
  name: "ares-content-security-policy",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`
    )
});

export default defineConfig({
  plugins: [react(), injectContentSecurityPolicy()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
