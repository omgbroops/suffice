import { defineConfig } from 'vite';
import { generateManifest } from 'material-icon-theme';

const manifest = generateManifest();

export default defineConfig({
  base: './',
  define: { __FILE_ICON_MANIFEST__: JSON.stringify({ file: manifest.file, fileNames: manifest.fileNames, fileExtensions: manifest.fileExtensions, iconDefinitions: manifest.iconDefinitions }) },
  server: { host: '0.0.0.0', port: 5187, strictPort: true },
  preview: { host: '0.0.0.0', port: 4187, strictPort: true },
});
