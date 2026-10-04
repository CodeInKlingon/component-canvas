/**
 * A tiny Vue 3 + Vite project seeded into every preview microVM. Kept inline so
 * onboarding is deterministic and works offline (aside from dependency
 * installation, which needs the npm registry).
 */
export const SAMPLE_FILES: Record<string, string> = {
  "package.json": `${JSON.stringify(
    {
      name: "preview-sample",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        vue: "^3.5.13",
      },
      devDependencies: {
        "@vitejs/plugin-vue": "^5.2.1",
        vite: "^6.0.7",
      },
    },
    null,
    2,
  )}\n`,

  "vite.config.ts": `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The manager proxies this server on a per-project loopback origin, so the
// allowed hosts are the loopback names it uses. The port is fixed because the
// proxy target is fixed.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    // The guest agent already listens on :8080, so the dev server uses :3000.
    port: 3000,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  plugins: [vue()],
});
`,

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview Sample</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,

  "src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
`,

  "src/style.css": `:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #0f172a, #1e293b 60%, #0b1120);
  color: #e2e8f0;
}

.card {
  width: min(560px, 92vw);
  padding: 2.5rem;
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.6);
  text-align: center;
}

h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.subtitle {
  margin: 0 0 1.5rem;
  color: #94a3b8;
}

.counter {
  font-size: 4rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 1.5rem;
  color: #38bdf8;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

button {
  border: 0;
  border-radius: 0.75rem;
  padding: 0.65rem 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  background: #38bdf8;
  color: #04263a;
}

button.secondary {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

button:hover {
  filter: brightness(1.08);
}

.time {
  margin-top: 1.5rem;
  font-variant-numeric: tabular-nums;
  color: #94a3b8;
}
`,

  "src/App.vue": `<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Counter from "./components/Counter.vue";

const now = ref(new Date().toLocaleTimeString());
let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date().toLocaleTimeString();
  }, 1000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <main class="card">
    <h1>Preview Sample</h1>
    <p class="subtitle">A Vue 3 + Vite app running inside a kindling microVM.</p>
    <Counter />
    <p class="time">VM clock: {{ now }}</p>
  </main>
</template>
`,

  "src/components/Counter.vue": `<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<template>
  <div>
    <div class="counter">{{ count }}</div>
    <div class="actions">
      <button @click="count++">Increment</button>
      <button class="secondary" @click="count = 0">Reset</button>
    </div>
  </div>
</template>
`,
};

/** Absolute guest path for a sample file, rooted at `/src`. */
export function sampleGuestPath(relativePath: string): string {
  return `/src/${relativePath}`;
}

export const SAMPLE_PATHS = Object.keys(SAMPLE_FILES);
