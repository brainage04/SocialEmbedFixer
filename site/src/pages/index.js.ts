import type { APIRoute } from 'astro';
import { readPluginFile } from '../lib/revengePlugin';

export const GET: APIRoute = async () =>
  new Response(await readPluginFile('index.js'), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
