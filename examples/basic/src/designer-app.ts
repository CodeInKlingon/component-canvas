import type { App } from 'vue'
import './styles.css'

export default {
  setup(app: App) {
    app.config.errorHandler = (error) => {
      console.error('[example preview]', error)
    }
  },
}
