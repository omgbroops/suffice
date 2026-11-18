import { defineConfig } from 'vite';
import { generateManifest } from 'material-icon-theme';

const manifest = generateManifest();
// fileIcon() only reads definitions reachable from file, fileNames and fileExtensions; drop the rest from the eager chunk.
const usedIcons = new Set([manifest.file, ...Object.values(manifest.fileNames), ...Object.values(manifest.fileExtensions)]);
const iconDefinitions = Object.fromEntries([...usedIcons].map(key => [key, manifest.iconDefinitions[key]]));

export default defineConfig({
  base: './',
  define: { __FILE_ICON_MANIFEST__: JSON.stringify({ file: manifest.file, fileNames: manifest.fileNames, fileExtensions: manifest.fileExtensions, iconDefinitions }) },
  server: { host: '0.0.0.0', port: 5187, strictPort: true },
  preview: { host: '0.0.0.0', port: 4187, strictPort: true },
});
