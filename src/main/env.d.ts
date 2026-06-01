/// <reference types="electron-vite/node" />

// Augments electron-vite's ImportMetaEnv with the MAIN_VITE_* vars we read.
interface ImportMetaEnv {
  readonly MAIN_VITE_GROQ_API_KEY?: string
}
