# 0032: Stable shell icons and distinct development identity

Windows retained the old Electron taskbar group even though the installed executable, window icon, and shortcut icon resources contained Suffice artwork. Refreshing shell entries and restarting Windows did not clear that reported behavior.

Keep the installed AppUserModelID (`com.suffice.desktop`) aligned with the installer. Give development windows and their relaunch shortcuts a separate stable ID, `com.suffice.desktop.development`, so launching Electron during development does not share the installed application's taskbar group. Keep the existing profile and conversation storage paths.

The branded development executable is named Suffice.exe. Electron reports `app.isPackaged = true` for that renamed runtime even when a source app was passed on its command line. Use `app.isPackaged && !process.defaultApp` consistently for launch behavior, Windows identity, project-window relaunches, startup arguments, and window chrome. Test the branded launcher itself; testing only electron.exe misses this distinction.

Copy the ICO into the profile under a filename derived from its content hash, then use that exact resource in both the window relaunch metadata and its shortcut. An artwork change therefore gets a new resource identity without changing the installed app ID or clearing global Windows caches. Metadata and native window-property tests verify that the shortcut and window agree; visible taskbar appearance still requires Windows shell verification.
