import type { App } from 'vue'
import NoticeTag from './NoticeTag.vue'

export function registerGlobalComponents(app: App): void {
  app.component('NoticeTag', NoticeTag)
}

declare module 'vue' {
  interface GlobalComponents {
    NoticeTag: typeof NoticeTag
  }
}
