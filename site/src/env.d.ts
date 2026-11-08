/// <reference types="astro/client" />

declare module 'virtual:revenge-plugin' {
  /** Absolute path of the repository's Revenge build output (`dist/` in the repository root). */
  export const pluginDist: string;
}
