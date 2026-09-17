import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this project at https://<user>.github.io/Packet-Keeper/
// so every asset URL must be prefixed with the repo name.
export default defineConfig({
  base: "/Packet-Keeper/",
  plugins: [react()],
});
