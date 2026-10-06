/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ranking/history API. Default: `/api` (served by the MSW mock). */
  readonly VITE_API_BASE_URL?: string;
  /** Request timeout in milliseconds. Default: 6000. */
  readonly VITE_API_TIMEOUT_MS?: string;
  /** Set to `false` to disable the MSW mock API (e.g. against a real backend). Default: enabled. */
  readonly VITE_ENABLE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
