import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Local development only: runs the files in /api as if they were Vercel functions,
 * so `npm run dev` gives you the app AND the API on one port. On Vercel this plugin is not used.
 */
function devApi(): Plugin {
  return {
    name: "bolkhata-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
        if (!/^[a-z]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          let raw = "";
          for await (const chunk of req) raw += chunk;
          const vreq = Object.assign(req, {
            query: Object.fromEntries(url.searchParams),
            body: raw ? JSON.parse(raw) : undefined,
          });
          const vres = Object.assign(res, {
            status(code: number) { res.statusCode = code; return vres; },
            json(data: unknown) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return vres; },
          });
          await mod.default(vreq, vres);
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "dev_api_error", message: String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env values available to the /api code during local dev (server side only).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [
      react(),
      tailwindcss(),
      devApi(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "Bol Khata — बोल खाता",
          short_name: "Bol Khata",
          description: "Bolo, aur likh gaya. Voice udhaar khata for chaiwalas and kirana shops.",
          lang: "hi",
          start_url: "/",
          display: "standalone",
          background_color: "#fbf4e8",
          theme_color: "#5a3620",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
              handler: "CacheFirst",
              options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
    ],
  };
});
