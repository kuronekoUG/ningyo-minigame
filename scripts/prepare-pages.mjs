import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '')
  .replace(/^\/+|\/+$/g, '')
  .trim();

if (basePath) {
  const clientDirectory = join('dist', 'client');
  const prefixedDirectory = join(clientDirectory, basePath);
  const nestedAssets = join(prefixedDirectory, '_next');
  const publicAssets = join(clientDirectory, '_next');

  if (!existsSync(nestedAssets)) {
    throw new Error(`GitHub Pages assets were not found at ${nestedAssets}`);
  }

  rmSync(publicAssets, { recursive: true, force: true });
  renameSync(nestedAssets, publicAssets);
  rmSync(prefixedDirectory, { recursive: true, force: true });
}
