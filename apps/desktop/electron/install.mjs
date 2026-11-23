import { join } from 'node:path'
import { readFile, writeFile, rm } from 'node:fs/promises'

const volumeOf = p => /^\/Volumes\/[^/]+/.exec(p ?? '')?.[0]

/**
 * First-run self-install for a packaged macOS app opened from a disk image (or any folder outside /Applications).
 * All platform pieces are injected so it is unit-testable.
 * @param {{ app: any, dialog: any, exec: (cmd: string, args: string[]) => Promise<unknown>, platform?: string, execPath?: string, fs?: any }} deps
 */
export function createInstaller({ app, dialog, exec, platform = process.platform, execPath = process.execPath, fs = { readFile, writeFile, rm } }) {
  let asked = false
  const marker = () => join(app.getPath('userData'), 'eject-volume')
  const active = () => platform === 'darwin' && app.isPackaged

  return {
    // Returns true when the app is being moved and relaunched: the caller must not keep starting up.
    async offerMove() {
      if (!active() || asked || !volumeOf(execPath) || app.isInApplicationsFolder()) return false // only offered from a disk image
      asked = true
      const { response } = await dialog.showMessageBox({
        type: 'question', message: 'Move Suffice to Applications?',
        detail: 'Suffice runs best from your Applications folder. It will reopen there and eject the installer.',
        buttons: ['Move and open', 'Not now'], defaultId: 0, cancelId: 1,
      })
      if (response !== 0) return false
      const volume = volumeOf(execPath)
      if (volume) await fs.writeFile(marker(), volume).catch(() => {})
      try {
        return app.moveToApplicationsFolder({
          conflictHandler: type => {
            if (type === 'existsAndRunning') {
              dialog.showMessageBoxSync({ type: 'info', message: 'Suffice is already open from Applications.', detail: 'Quit that copy, then try again.' })
              return false
            }
            return true // an older copy is replaced
          },
        })
      } catch (e) {
        dialog.showMessageBoxSync({ type: 'error', message: 'Could not move Suffice.', detail: String(e?.message ?? e) })
        return false
      }
    },
    // Runs on the relaunched copy: eject the disk image the previous copy came from. Failures are ignored.
    async ejectSource() {
      if (!active() || !app.isInApplicationsFolder()) return
      const volume = await fs.readFile(marker(), 'utf8').catch(() => '')
      if (!volume) return
      await fs.rm(marker(), { force: true }).catch(() => {})
      if (volumeOf(volume) === volume) await Promise.resolve(exec('hdiutil', ['detach', volume])).catch(() => {})
    },
  }
}
