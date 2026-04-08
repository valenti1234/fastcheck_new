/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONGODB_URI: string
  readonly VITE_NODE_ENV: string
  readonly VITE_PORT: string
  readonly VITE_JWT_SECRET: string
  readonly VITE_JWT_EXPIRES_IN: string
  readonly VITE_RATE_LIMIT_WINDOW_MS: string
  readonly VITE_RATE_LIMIT_MAX_REQUESTS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 