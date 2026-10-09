import type { OrbitApi } from './index'

declare global {
  interface Window {
    api: OrbitApi
  }
}

export {}
