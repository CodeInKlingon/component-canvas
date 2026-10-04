// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      managerUrl: process.env.NUXT_PUBLIC_MANAGER_URL || 'http://localhost:7100',
    },
  },
  app: {
    head: {
      title: 'Kindling Preview PoC',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Control plane for kindling preview microVMs.' },
      ],
    },
  },
})
