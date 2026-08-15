import { defineConfig } from 'vite'
import designer from '@vue-designer/vite'
import vue from '@vue-designer/vue'

export default defineConfig({
  plugins: [
    designer({
      framework: vue(),
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
