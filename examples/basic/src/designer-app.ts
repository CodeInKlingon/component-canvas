import type { App } from 'vue'
import { registerGlobalComponents } from './globals'
import './styles.css'

export default {
  setup(app: App) {
    registerGlobalComponents(app)
    app.config.errorHandler = (error) => {
      console.error('[example preview]', error)
    }
  },
}
