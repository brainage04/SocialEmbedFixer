import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginDist } from 'virtual:revenge-plugin';

/** The manifest written by `scripts/build-revenge.mjs`; Revenge compares `hash` to decide whether to refetch `main`. */
export interface RevengeManifest {
  name: string;
  description: string;
  authors: { name: string; id: string }[];
  main: string;
  hash: string;
}

export type PluginFile = 'manifest.json' | 'index.js';

/** Reads a file of the current Revenge build. Text round-trips the UTF-8 build output unchanged. */
export function readPluginFile(file: PluginFile): Promise<string> {
  return readFile(join(pluginDist, file), 'utf8');
}

export async function readManifest(): Promise<RevengeManifest> {
  return JSON.parse(await readPluginFile('manifest.json')) as RevengeManifest;
}
