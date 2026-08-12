import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import designer from '@vue-designer/vite'

export default defineConfig({
  plugins: [
    vue(),
    designer({
      documents: 'src/pages/**/*.vue',
      app: './src/designer-app.ts',
      components: './src/designer-components.ts',
      ai: {},
    }),
  ],
  server: {
    host: "127.0.0.1"
  }
})
