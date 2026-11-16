import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sessionArtifactName, sessionNativeArtifactFiles} from '../../scripts/rust-migration/session-native-artifact.mjs';

const require = createRequire(import.meta.url);
const nativeDirectory = fileURLToPath(new URL('../desktop-bridge/native/', import.meta.url));

export async function verifySessionBackend(directory = nativeDirectory) {
  try {
    // The selected Node executable determines the platform and ABI for loading.
    const files = await sessionNativeArtifactFiles(directory);
    if (!files.length) throw new Error('session addon is missing');
    const addon = require(join(directory, sessionArtifactName()));
    if (typeof addon.PersistentSessionReader !== 'function') throw new Error('session reader export is missing');
  } catch (error) {
    throw new Error(`Rust session backend unavailable for ${process.platform}-${process.arch}: ${error.message}. Run node scripts/rust-migration/build-session-native.mjs with the host's Node executable and matching Rust target.`, {cause: error});
  }
}

if (import.meta.main) {
  if (process.env.SUFFICE_SESSION_BACKEND !== 'rust') throw new Error('Experimental Rust host requires SUFFICE_SESSION_BACKEND=rust');
  await verifySessionBackend();
  await import('../desktop-bridge/main.mjs');
}
