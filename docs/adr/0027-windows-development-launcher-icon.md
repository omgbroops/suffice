# 0027: Windows development launcher icon

Windows taskbar metadata alone can retain the generic Electron process icon. The Windows development launcher copies electron.exe to its sibling Suffice.exe, replacing only existing icon resources in that copy and caching by runtime/icon identity. Shared runtime files and the original executable stay untouched. No distributable/package build is involved. Other platforms use their existing launch path.
