import {loadDesktopBinding} from '../desktop-bridge/native-binding.mjs';
import {verifyLiveRegistry} from '../desktop-bridge/live-registry.mjs';

export async function verifySessionBackend(directory) {
  try {
    // The selected Node executable determines the platform and ABI for loading.
    const addon=await loadDesktopBinding(directory);
    verifyLiveRegistry(addon);
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
