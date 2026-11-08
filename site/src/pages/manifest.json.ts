import type { APIRoute } from 'astro';
import { readPluginFile } from '../lib/revengePlugin';

export const GET: APIRoute = async () =>
  new Response(await readPluginFile('manifest.json'), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
