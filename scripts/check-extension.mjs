import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const manifests = ['extension/manifest.json', 'extension/manifest.firefox.json'];

for (const manifestPath of manifests) {
  const absoluteManifest = resolve(manifestPath);
  const root = dirname(absoluteManifest);
  const manifest = JSON.parse(readFileSync(absoluteManifest, 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.name || !manifest.version) {
    throw new Error(`${manifestPath} is missing required Manifest V3 fields`);
  }

  const referencedFiles = [
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...(manifest.background?.scripts ?? []),
  ].filter(Boolean);

  for (const file of referencedFiles) {
    if (!existsSync(resolve(root, file))) throw new Error(`${manifestPath} references missing file: ${file}`);
  }

  for (const icon of Object.values(manifest.icons ?? {})) {
    if (String(icon).toLowerCase().endsWith('.svg')) throw new Error(`${manifestPath} uses an unsupported SVG manifest icon`);
    if (!existsSync(resolve(root, String(icon)))) throw new Error(`${manifestPath} references missing icon: ${icon}`);
  }
}

console.log('Extension manifests and referenced files are valid.');
