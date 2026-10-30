import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import gateway from "./api/gateway.js";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-api",
      configureServer(server) {
        server.middlewares.use("/api/gateway", (req, res) => {
          gateway(req, res);
        });
      },
    },
  ],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1000 },
});
