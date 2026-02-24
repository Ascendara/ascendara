import MillionLint from "@million/lint";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import pkg from "./package.json";

const plugins = [react()];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: plugins,
  publicDir: path.join(__dirname, "src/public"),
  envDir: __dirname,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REVISION__: JSON.stringify(execSync("git rev-parse HEAD").toString()),
  },
  root: path.join(__dirname, "src"),
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api/igdb": {
        target: "https://api.igdb.com/v4",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/igdb/, ""),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log(
              "Received Response from the Target:",
              proxyRes.statusCode,
              req.url
            );
          });
        },
      },
      "/api/torbox": {
        target: "https://api.torbox.app/v1/api",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/torbox/, ""),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Torbox proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Sending Request to Torbox API:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log(
              "Received Response from Torbox API:",
              proxyRes.statusCode,
              req.url
            );
          });
        },
      },
      "/api/khinsider": {
        target: "https://downloads.khinsider.com",
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/api\/khinsider/, ""),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Khinsider proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Khinsider: Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log(
              "Khinsider: Received Response from the Target:",
              proxyRes.statusCode,
              req.url
            );
          });
        },
      },
      "/api/giantbomb": {
        target: "https://www.giantbomb.com/api",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/giantbomb/, ""),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("GiantBomb proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Sending GiantBomb Request:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log("Received GiantBomb Response:", proxyRes.statusCode, req.url);
          });
        },
      },
      "/api/flingtrainer": {
        target: "https://flingtrainer.com",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/flingtrainer/, ""),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("FlingTrainer proxy error", err);
          });
        },
      },
      "/api/steam/search": {
        target: "https://store.steampowered.com/api",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/steam\/search/, "/storesearch"),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Steam Store Search proxy error", err);
          });
        },
      },
      "/api/steam/applist": {
        target: "https://api.steampowered.com",
        changeOrigin: true,
        rewrite: path =>
          path.replace(/^\/api\/steam\/applist/, "/ISteamApps/GetAppList/v2"),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Steam App List proxy error", err);
          });
        },
      },
      "/api/steam/appdetails": {
        target: "https://store.steampowered.com/api",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/steam\/appdetails/, "/appdetails"),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Steam App Details proxy error", err);
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
  },
  build: {
    copyPublicDir: true,
    outDir: path.join(__dirname, "build"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, "src/index.html"),
    },
    assetsDir: "assets",
    sourcemap: true,
  },
});
