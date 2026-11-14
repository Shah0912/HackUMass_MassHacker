/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_AI?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
