//! Host-side operating system adapters used by the retained desktop handlers.
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{DynamicImage, ImageFormat, ImageReader, RgbaImage};
use serde_json::{Value, json};
use std::io;
use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
const MAX_BYTES: u64 = 20 * 1024 * 1024;

fn png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut out = Cursor::new(Vec::new());
    image
        .write_to(&mut out, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}
fn data_url(image: DynamicImage) -> Result<Value, String> {
    Ok(json!(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png(&image)?)
    )))
}
fn thumbnail(file: &Path) -> Result<Value, String> {
    let mut reader = ImageReader::open(file)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(128 * 1024 * 1024);
    limits.max_image_width = Some(32768);
    limits.max_image_height = Some(32768);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    use image::ImageDecoder;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    image.apply_orientation(orientation);
    let side = image.width().min(image.height());
    let square = image.crop_imm(
        (image.width() - side) / 2,
        (image.height() - side) / 2,
        side,
        side,
    );
    data_url(square.resize_exact(128, 128, image::imageops::FilterType::Lanczos3))
}
fn file_icon(file: &Path) -> Result<Value, String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        let icon = file_icon_provider::get_file_icon(file, 16).map_err(|e| e.to_string())?;
        let rgba =
            RgbaImage::from_raw(icon.width, icon.height, icon.pixels).ok_or("invalid OS icon")?;
        data_url(DynamicImage::ImageRgba8(rgba))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = file;
        Err("file icons unsupported on this host".into())
    }
}
fn stage_image(file: &Path, width: usize, height: usize, bytes: &[u8]) -> Result<(), String> {
    if width.checked_mul(height).and_then(|n| n.checked_mul(4)) != Some(bytes.len())
        || bytes.len() > 128 * 1024 * 1024
    {
        return Err("clipboard image exceeds decoded image limit".into());
    }
    let mut data = Vec::new();
    use image::ImageEncoder;
    image::codecs::png::PngEncoder::new(&mut data)
        .write_image(
            bytes,
            width.try_into().map_err(|_| "invalid width")?,
            height.try_into().map_err(|_| "invalid height")?,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BYTES {
        return Err("Attachments exceed 20 MB".into());
    }
    let mut options = fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(file)
        .and_then(|mut f| f.write_all(&data))
        .map_err(|e| e.to_string())
}
#[cfg(not(target_os = "macos"))]
fn clipboard(file: &Path) -> Result<Value, String> {
    if !file.is_absolute() {
        return Err("clipboard staging path must be absolute".into());
    }
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    match clipboard.get().file_list() {
        Ok(files) if !files.is_empty() => {
            return Ok(
                json!({"files":files.into_iter().take(20).collect::<Vec<_>>(),"image":false}),
            );
        }
        Ok(_) | Err(arboard::Error::ContentNotAvailable) => {}
        Err(e) => return Err(e.to_string()),
    }
    match clipboard.get_image() {
        Ok(image) => {
            stage_image(file, image.width, image.height, &image.bytes)?;
            Ok(json!({"image":true,"files":[]}))
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(json!({"image":false,"files":[]})),
        Err(e) => Err(e.to_string()),
    }
}
#[cfg(target_os = "macos")]
fn clipboard(file: &Path) -> Result<Value, String> {
    mac_pasteboard(&objc2_app_kit::NSPasteboard::generalPasteboard(), file)
}
#[cfg(target_os = "macos")]
fn mac_pasteboard(board: &objc2_app_kit::NSPasteboard, file: &Path) -> Result<Value, String> {
    use objc2_app_kit::{NSPasteboardTypeFileURL, NSPasteboardTypePNG, NSPasteboardTypeTIFF};
    if !file.is_absolute() {
        return Err("clipboard staging path must be absolute".into());
    }
    let mut files = Vec::new();
    if let Some(items) = board.pasteboardItems() {
        for item in items.iter() {
            if let Some(value) = item.stringForType(unsafe { NSPasteboardTypeFileURL })
                && let Ok(url) = url::Url::parse(&value.to_string())
                && let Ok(path) = url.to_file_path()
            {
                files.push(path);
                if files.len() == 20 {
                    break;
                }
            }
        }
    }
    if !files.is_empty() {
        return Ok(json!({"files":files,"image":false}));
    }
    for (kind, format) in unsafe {
        [
            (NSPasteboardTypePNG, ImageFormat::Png),
            (NSPasteboardTypeTIFF, ImageFormat::Tiff),
        ]
    } {
        if let Some(bytes) = board.dataForType(kind) {
            if bytes.len() > 128 * 1024 * 1024 {
                return Err("clipboard image exceeds decoded image limit".into());
            }
            let mut reader = ImageReader::with_format(Cursor::new(bytes.to_vec()), format);
            let mut limits = image::Limits::default();
            limits.max_alloc = Some(128 * 1024 * 1024);
            reader.limits(limits);
            let image = reader.decode().map_err(|e| e.to_string())?.into_rgba8();
            stage_image(
                file,
                image.width() as usize,
                image.height() as usize,
                &image,
            )?;
            return Ok(json!({"files":[],"image":true}));
        }
    }
    Ok(json!({"files":[],"image":false}))
}
#[cfg(target_os = "macos")]
fn trash_file(file: &Path) -> Result<Option<PathBuf>, String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(
        file.to_str().ok_or("invalid trash path")?,
    ));
    let mut destination = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut destination))
        .map_err(|e| e.to_string())?;
    Ok(destination
        .and_then(|u| u.path())
        .map(|s| PathBuf::from(s.to_string())))
}
#[cfg(not(target_os = "macos"))]
fn trash_file(file: &Path) -> Result<Option<PathBuf>, String> {
    trash::delete(file).map_err(|e| e.to_string())?;
    Ok(None)
}
#[derive(Debug)]
struct LaunchConfig {
    executable: PathBuf,
    node: PathBuf,
    root: PathBuf,
    home: PathBuf,
    primary_profile: PathBuf,
}
static LAUNCH: std::sync::OnceLock<LaunchConfig> = std::sync::OnceLock::new();
fn executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return false;
        }
    }
    true
}
fn resolve_node(raw: &Path, cwd: &Path, path: Option<&std::ffi::OsStr>) -> io::Result<PathBuf> {
    if raw.as_os_str().is_empty() {
        return Err(io::Error::other("empty Node executable"));
    }
    let bare = raw
        .parent()
        .is_some_and(|parent| parent.as_os_str().is_empty());
    let candidates = if bare {
        std::env::split_paths(
            path.ok_or_else(|| io::Error::other("PATH is missing for the named Node executable"))?,
        )
        .map(|dir| cwd.join(dir).join(raw))
        .collect::<Vec<_>>()
    } else {
        vec![cwd.join(raw)]
    };
    for candidate in candidates {
        #[cfg(windows)]
        let candidate = if candidate.extension().is_none() {
            candidate.with_extension("exe")
        } else {
            candidate
        };
        if executable_file(&candidate) {
            return candidate.canonicalize();
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("Node executable unavailable: {}", raw.display()),
    ))
}
impl LaunchConfig {
    fn capture(
        executable: &Path,
        node: PathBuf,
        root: &Path,
        home: &Path,
        primary_profile: &Path,
        cwd: &Path,
    ) -> io::Result<Self> {
        Ok(Self {
            executable: cwd.join(executable).canonicalize()?,
            node,
            root: cwd.join(root).canonicalize()?,
            home: cwd.join(home).canonicalize()?,
            primary_profile: cwd.join(primary_profile).canonicalize()?,
        })
    }
    fn args(&self, profile: &Path) -> Vec<std::ffi::OsString> {
        [
            self.executable.as_path(),
            Path::new("--node"),
            &self.node,
            Path::new("--root"),
            &self.root,
            Path::new("--home"),
            &self.home,
            Path::new("--profile"),
            profile,
        ]
        .map(|p| p.as_os_str().to_owned())
        .into()
    }
    fn project_profile(&self, profile: &Path, primary: &Path) -> Result<PathBuf, String> {
        if primary.canonicalize().map_err(|e| e.to_string())? != self.primary_profile
            || profile.parent() != Some(primary.join("project-windows").as_path())
        {
            return Err("invalid project-window profile".into());
        }
        let name = profile
            .file_name()
            .ok_or("missing project-window profile")?;
        // Its project-windows directory and hashed profile may both be new.
        Ok(self.primary_profile.join("project-windows").join(name))
    }
}
pub fn configure_launch(
    raw_node: &Path,
    root: &Path,
    home: &Path,
    profile: &Path,
) -> io::Result<PathBuf> {
    let cwd = std::env::current_dir()?;
    let node = resolve_node(raw_node, &cwd, std::env::var_os("PATH").as_deref())?;
    let primary = std::env::var_os("SUFFICE_PROFILE_ROOT").map(PathBuf::from);
    let config = LaunchConfig::capture(
        &std::env::current_exe()?,
        node.clone(),
        root,
        home,
        primary.as_deref().unwrap_or(profile),
        &cwd,
    )?;
    LAUNCH
        .set(config)
        .map_err(|_| io::Error::other("host launch already configured"))?;
    Ok(node)
}
fn launch_config() -> Result<&'static LaunchConfig, String> {
    LAUNCH
        .get()
        .ok_or_else(|| "host launch is not configured".into())
}
fn project_window(args: &Value) -> Result<Value, String> {
    let paths = args
        .as_array()
        .filter(|a| a.len() == 3)
        .ok_or("invalid project window")?
        .iter()
        .map(|v| {
            v.as_str()
                .map(Path::new)
                .filter(|p| p.is_absolute())
                .ok_or("invalid project path")
        })
        .collect::<Result<Vec<_>, _>>()?;
    if !paths[0].is_dir() {
        return Err("invalid project-window profile".into());
    }
    let config = launch_config()?;
    let launch = config.args(&config.project_profile(paths[1], paths[2])?);
    let mut command = Command::new(&launch[0]);
    command
        .args(&launch[1..])
        .env("SUFFICE_START_PROJECT", paths[0])
        .env("SUFFICE_PROFILE_ROOT", &config.primary_profile)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000200);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(Value::Null)
}
#[cfg(target_os = "macos")]
fn launch_agent(directory: &Path, enabled: bool, args: &[std::ffi::OsString]) -> io::Result<()> {
    let file = directory.join("dev.suffice.rust-host.plist");
    if !enabled {
        return match fs::remove_file(file) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            other => other,
        };
    }
    fs::create_dir_all(directory)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    write!(
        temp,
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>Label</key><string>dev.suffice.rust-host</string><key>RunAtLoad</key><true/><key>ProgramArguments</key><array>"
    )?;
    for arg in args {
        let arg = arg
            .to_str()
            .ok_or_else(|| io::Error::other("login item requires UTF-8 paths"))?;
        if arg
            .chars()
            .any(|c| c < ' ' && !matches!(c, '\t' | '\n' | '\r'))
        {
            return Err(io::Error::other("invalid character in login path"));
        }
        write!(
            temp,
            "<string>{}</string>",
            arg.replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
        )?;
    }
    writeln!(temp, "</array></dict></plist>")?;
    temp.as_file().sync_all()?;
    temp.persist(file)?;
    Ok(())
}
fn startup(enabled: bool) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        let config = launch_config()?;
        let args = config.args(&config.primary_profile);
        let directory = PathBuf::from(std::env::var_os("HOME").ok_or("missing home directory")?)
            .join("Library/LaunchAgents");
        launch_agent(&directory, enabled, &args).map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
    #[cfg(windows)]
    {
        let root = PathBuf::from(
            std::env::var_os("SystemRoot").ok_or("missing Windows system directory")?,
        );
        let exe = root.join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let config = launch_config()?;
        let args = config.args(&config.primary_profile);
        let script = r#"$ErrorActionPreference='Stop'; $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; if($env:SUFFICE_LOGIN_ON -eq '1'){New-ItemProperty -Path $key -Name SufficeRustHost -PropertyType String -Value $env:SUFFICE_LOGIN_COMMAND -Force | Out-Null}else{if((Get-Item $key).GetValue('SufficeRustHost') -ne $null){Remove-ItemProperty -Path $key -Name SufficeRustHost}}"#;
        let command = args
            .iter()
            .map(|s| quote_windows(&s.to_string_lossy()))
            .collect::<Vec<_>>()
            .join(" ");
        use std::os::windows::process::CommandExt;
        let r = Command::new(exe)
            .creation_flags(0x08000000)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("SUFFICE_LOGIN_ON", if enabled { "1" } else { "0" })
            .env("SUFFICE_LOGIN_COMMAND", command)
            .output()
            .map_err(|e| e.to_string())?;
        if !r.status.success() {
            return Err(String::from_utf8_lossy(&r.stderr).into_owned());
        }
        Ok(Value::Null)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = enabled;
        Err("login startup unavailable on this host".into())
    }
}
#[cfg(windows)]
fn quote_windows(input: &str) -> String {
    let mut out = String::from("\"");
    let mut backslashes = 0;
    for c in input.chars() {
        if c == '\\' {
            backslashes += 1;
        } else {
            if c == '"' {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
            } else {
                out.push_str(&"\\".repeat(backslashes));
            }
            out.push(c);
            backslashes = 0;
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}
pub(super) fn handle(method: &str, args: &Value) -> Result<Value, String> {
    let path = || super::path_arg(args).map(Path::new);
    match method {
        "clipboard.snapshot" => clipboard(path()?),
        "shell.trashItem" => {
            trash_file(path()?)?;
            Ok(Value::Null)
        }
        "app.getFileIcon" => file_icon(path()?),
        "image.thumbnail" => thumbnail(path()?),
        "app.setLoginItemSettings" => {
            startup(args[0].as_bool().ok_or("expected startup preference")?)
        }
        "app.openProjectWindow" => project_window(args),
        _ => Err(format!("unsupported native operation: {method}")),
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgba};
    use objc2_app_kit::{
        NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardTypePNG, NSPasteboardTypeString,
    };
    use objc2_foundation::{NSData, NSString};
    #[test]
    fn private_mac_pasteboard_returns_real_files_png_and_empty_text() {
        let scratch = tempfile::tempdir().unwrap();
        let output = scratch.path().join("clipboard.png");
        let board = NSPasteboard::pasteboardWithUniqueName();
        let file = scratch.path().join("space & cat.png");
        let url = url::Url::from_file_path(&file).unwrap();
        board.clearContents();
        assert!(
            board.setString_forType(&NSString::from_str(url.as_str()), unsafe {
                NSPasteboardTypeFileURL
            })
        );
        assert_eq!(
            mac_pasteboard(&board, &output).unwrap(),
            json!({"files":[file],"image":false})
        );
        board.clearContents();
        let pattern =
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(3, 2, Rgba([9, 17, 130, 255])));
        assert!(
            board.setData_forType(Some(&NSData::from_vec(png(&pattern).unwrap())), unsafe {
                NSPasteboardTypePNG
            })
        );
        assert_eq!(
            mac_pasteboard(&board, &output).unwrap(),
            json!({"files":[],"image":true})
        );
        assert_eq!(image::open(output).unwrap().to_rgba8(), pattern.to_rgba8());
        board.clearContents();
        assert!(
            board.setString_forType(&NSString::from_str("untouched"), unsafe {
                NSPasteboardTypeString
            })
        );
        assert_eq!(
            mac_pasteboard(&board, &scratch.path().join("unused")).unwrap(),
            json!({"files":[],"image":false})
        );
        board.clearContents();
    }
    fn decode_url(result: Value) -> DynamicImage {
        let data = STANDARD
            .decode(
                result
                    .as_str()
                    .unwrap()
                    .strip_prefix("data:image/png;base64,")
                    .unwrap(),
            )
            .unwrap();
        image::load_from_memory(&data).unwrap()
    }
    #[test]
    fn center_crop_and_operating_system_file_icon_are_actual_png_images() {
        let scratch = tempfile::tempdir().unwrap();
        let file = scratch.path().join("sample.png");
        let stripes = RgbaImage::from_fn(9, 3, |x, _| {
            if (3..6).contains(&x) {
                Rgba([0u8, 255, 0, 255])
            } else {
                Rgba([255, 0, 0, 255])
            }
        });
        stripes.save(&file).unwrap();
        let result = decode_url(thumbnail(&file).unwrap());
        assert_eq!(result.dimensions(), (128, 128));
        assert!(result.to_rgba8().pixels().all(|p| p.0 == [0, 255, 0, 255]));
        let icon = decode_url(file_icon(&file).unwrap());
        assert_eq!(icon.dimensions(), (16, 16));
        assert!(icon.to_rgba8().pixels().any(|p| p.0[3] > 0));
        assert!(file_icon(&scratch.path().join("absent")).is_err());
    }
    #[test]
    fn os_trash_moves_only_the_synthetic_file_and_preserves_its_contents() {
        let scratch = tempfile::tempdir().unwrap();
        let original = scratch
            .path()
            .join(format!("suffice-trash-test-{}.txt", std::process::id()));
        fs::write(&original, b"synthetic test data").unwrap();
        let destination = trash_file(&original)
            .unwrap()
            .expect("OS reported trash destination");
        assert!(!original.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"synthetic test data");
        fs::rename(destination, original).unwrap();
    }
    #[test]
    fn startup_and_new_project_relaunch_from_a_different_directory_with_an_empty_path() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let scratch = tempfile::tempdir().unwrap();
        let working = scratch.path().join("working & stuff");
        let other = scratch.path().join("different cwd");
        let primary = working.join("profile;$HOME");
        let home = working.join("agent home");
        let bin = working.join("bin with spaces");
        for dir in [&primary, &home, &bin, &other] {
            fs::create_dir_all(dir).unwrap();
        }
        let host = bin.join("host");
        let node = bin.join("node");
        let executable = |file: &Path, source: &str| {
            fs::write(file, source).unwrap();
            fs::set_permissions(file, fs::Permissions::from_mode(0o700)).unwrap();
        };
        executable(&host, "#!/bin/sh\nexec \"$2\" \"$4\" \"$6\" \"$8\"\n");
        executable(&node, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
        // An existing non-executable earlier in PATH must not shadow Node.
        fs::write(working.join("node"), "not executable").unwrap();
        let relative_path =
            std::env::join_paths([Path::new("."), Path::new("bin with spaces")]).unwrap();
        let resolved = resolve_node(Path::new("node"), &working, Some(&relative_path)).unwrap();
        assert_eq!(resolved, node.canonicalize().unwrap());
        assert_eq!(
            resolve_node(Path::new("./bin with spaces/node"), &working, None).unwrap(),
            resolved
        );
        let alias = working.join("profile-alias");
        symlink(&primary, &alias).unwrap();
        let config = LaunchConfig::capture(
            Path::new("./bin with spaces/host"),
            resolved,
            Path::new("."),
            Path::new("agent home"),
            Path::new("profile-alias"),
            &working,
        )
        .unwrap();
        let future_profile = alias.join("project-windows/0123456789abcdef");
        let child_profile = config.project_profile(&future_profile, &alias).unwrap();
        assert!(!child_profile.exists());
        for profile in [&config.primary_profile, &child_profile] {
            let launch = config.args(profile);
            let output = Command::new(&launch[0])
                .args(&launch[1..])
                .current_dir(&other)
                .env("PATH", "")
                .output()
                .unwrap();
            assert!(output.status.success(), "{output:?}");
            let expected = format!(
                "{}\n{}\n{}\n",
                working.canonicalize().unwrap().display(),
                home.canonicalize().unwrap().display(),
                profile.display()
            );
            assert_eq!(String::from_utf8(output.stdout).unwrap(), expected);
        }
        assert_eq!(
            child_profile,
            primary
                .canonicalize()
                .unwrap()
                .join("project-windows/0123456789abcdef")
        );
        assert!(
            config
                .project_profile(&other.join("project-windows/a"), &other)
                .is_err()
        );
    }
    #[test]
    fn login_agent_plist_round_trips_host_arguments_and_can_be_disabled() {
        let scratch = tempfile::tempdir().unwrap();
        let args = vec!["/an executable".into(), "--root".into(), "/a & <b>".into()];
        launch_agent(scratch.path(), true, &args).unwrap();
        let file = scratch.path().join("dev.suffice.rust-host.plist");
        let converted = Command::new("/usr/bin/plutil")
            .args(["-convert", "json", "-o", "-"])
            .arg(&file)
            .output()
            .unwrap();
        assert!(converted.status.success());
        let plist: Value = serde_json::from_slice(&converted.stdout).unwrap();
        assert_eq!(plist["RunAtLoad"], true);
        assert_eq!(
            plist["ProgramArguments"],
            json!(["/an executable", "--root", "/a & <b>"])
        );
        launch_agent(scratch.path(), false, &args).unwrap();
        assert!(!file.exists());
    }
}
