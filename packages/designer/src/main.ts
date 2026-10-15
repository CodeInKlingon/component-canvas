import { createApp } from 'vue'
// Load global styles first so they declare the cascade layer order before component styles.
import './styles.css'
import App from './App.vue'

createApp(App).mount('#app')
