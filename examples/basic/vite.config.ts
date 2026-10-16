import { defineConfig } from 'vite'
import designer from '@component-canvas/vite'
import vue from '@component-canvas/vue'

export default defineConfig({
  plugins: [
    designer({
      framework: vue(),
      documents: 'src/pages/**/*.vue',
      app: './src/designer-app.ts',
      components: {
        sources: [
          { glob: 'src/components/**/*.vue', label: 'Project' },
          { glob: 'src/globals/*.vue', label: 'Global', import: 'global', tagCase: 'kebab' },
        ],
        overrides: {
          AppButton: { label: 'Button', category: 'Actions' },
          FeatureCard: { category: 'Content' },
          NoticeBadge: { category: 'Content', defaultContent: 'New', props: { accent: { control: 'color' } } },
          MetricHighlight: { category: 'Content' },
          NoticeTag: { defaultContent: 'Note' },
        },
      },
      ai: {},
    }),
  ],
  server: {
    host: "127.0.0.1"
  }
})
