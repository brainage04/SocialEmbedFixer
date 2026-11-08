import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const VIRTUAL_ID = 'virtual:revenge-plugin';
// Plugin sources whose changes trigger a rebuild while `astro dev` runs.
const WATCHED = ['revenge', 'common', 'scripts'];

/**
 * Builds the Revenge plugin in the repository root (`npm run build` there writes `dist/manifest.json` and
 * `dist/index.js`) and exposes that directory as `virtual:revenge-plugin`, which the `/manifest.json` and
 * `/index.js` routes serve. Runs on `astro dev` and `astro build`; installs the root dependencies first when
 * they are missing (a fresh clone or CI).
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function revengePlugin() {
  /** @type {string} */
  let pluginRoot;

  return {
    name: 'revenge-plugin',
    hooks: {
      'astro:config:setup': ({ command, config, logger, updateConfig }) => {
        pluginRoot = fileURLToPath(new URL('../', config.root));
        const distDir = join(pluginRoot, 'dist');
        const source = `export const pluginDist = ${JSON.stringify(distDir)};`;

        if (command === 'dev' || command === 'build') {
          if (!existsSync(join(pluginRoot, 'node_modules'))) {
            logger.info('Installing plugin dependencies (npm ci in the repository root)');
            // The plugin's build tools are devDependencies, and `astro build` sets NODE_ENV=production.
            run(['ci', '--include=dev', '--no-audit', '--no-fund'], pluginRoot);
          }
          run(['run', 'build'], pluginRoot);
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'revenge-plugin:virtual-module',
                resolveId(id) {
                  return id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : undefined;
                },
                load(id) {
                  return id === `\0${VIRTUAL_ID}` ? source : undefined;
                },
              },
            ],
          },
        });
      },
      'astro:server:setup': ({ server, logger }) => {
        const watched = WATCHED.map((entry) => join(pluginRoot, entry));
        let building = false;
        let queued = false;

        const rebuild = () => {
          if (building) {
            queued = true;
            return;
          }
          building = true;
          const child = spawn('npm', ['run', 'build', '--silent'], { cwd: pluginRoot, stdio: 'inherit' });
          child.on('exit', (code) => {
            building = false;
            if (code === 0) logger.info('Rebuilt the Revenge plugin');
            else logger.error(`Revenge plugin build failed (exit ${code})`);
            if (queued) {
              queued = false;
              rebuild();
            }
          });
        };

        server.watcher.add(watched);
        server.watcher.on('all', (_event, file) => {
          if (watched.some((directory) => file.startsWith(`${directory}/`))) rebuild();
        });
      },
    },
  };
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function run(args, cwd) {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed in ${cwd} (exit ${result.status})`);
}
