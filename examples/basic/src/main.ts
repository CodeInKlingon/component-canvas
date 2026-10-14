import { createApp } from 'vue'
import LandingPage from './pages/LandingPage.vue'
import { registerGlobalComponents } from './globals'
import './styles.css'

const app = createApp(LandingPage)
registerGlobalComponents(app)
app.mount('#app')
