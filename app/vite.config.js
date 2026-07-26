import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "/budget/" so built asset paths resolve correctly on GitHub Pages,
// which serves this repo at https://<user>.github.io/budget/
export default defineConfig({
  plugins: [react()],
  base: "/budget/",
});
