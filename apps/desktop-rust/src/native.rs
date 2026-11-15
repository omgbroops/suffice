use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::process::Command;
use tao::window::Window;

fn option_arg(args: &Value) -> &Value {
    args.get(0).unwrap_or(&Value::Null)
}
fn has_property(options: &Value, property: &str) -> bool {
    options
        .get("properties")
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|v| v.as_str() == Some(property)))
}
fn path_arg(args: &Value) -> Result<&str, String> {
    args.get(0)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && !s.contains('\0'))
        .ok_or_else(|| "expected a non-empty path".into())
}
fn file_dialog(options: &Value) -> rfd::FileDialog {
    let mut dialog = rfd::FileDialog::new();
    if let Some(title) = options.get("title").and_then(Value::as_str) {
        dialog = dialog.set_title(title);
    }
    if let Some(default_path) = options
        .get("defaultPath")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        let path = Path::new(default_path);
        if path.is_dir() {
            dialog = dialog.set_directory(path);
        } else {
            if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
                dialog = dialog.set_directory(parent);
            }
            if let Some(name) = path.file_name() {
                dialog = dialog.set_file_name(name.to_string_lossy());
            }
        }
    }
    if let Some(filters) = options.get("filters").and_then(Value::as_array) {
        for filter in filters {
            if let (Some(name), Some(exts)) = (
                filter.get("name").and_then(Value::as_str),
                filter.get("extensions").and_then(Value::as_array),
            ) {
                let extensions: Vec<&str> = exts.iter().filter_map(Value::as_str).collect();
                if !extensions.is_empty() {
                    dialog = dialog.add_filter(name, &extensions);
                }
            }
        }
    }
    dialog
}
fn message_buttons(options: &Value) -> Result<(Vec<String>, usize), String> {
    let buttons = match options.get("buttons") {
        None | Some(Value::Null) => vec!["OK".to_string()],
        Some(Value::Array(items)) if items.is_empty() => vec!["OK".to_string()],
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| {
                v.as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| "invalid message button".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?,
        _ => return Err("invalid message buttons".into()),
    };
    if buttons.len() > 3
        || buttons
            .iter()
            .enumerate()
            .any(|(i, b)| buttons[..i].contains(b))
    {
        return Err("message boxes require one to three distinct buttons".into());
    }
    if options.get("checkboxLabel").is_some() {
        return Err("message box checkboxes are unsupported".into());
    }
    if options
        .get("defaultId")
        .and_then(Value::as_u64)
        .is_some_and(|id| id != 0)
    {
        return Err("nonzero message box defaultId is unsupported".into());
    }
    let cancel = if let Some(value) = options.get("cancelId") {
        let id = value.as_u64().ok_or("invalid cancelId")? as usize;
        if id >= buttons.len() {
            return Err("invalid cancelId".into());
        }
        id
    } else {
        buttons
            .iter()
            .position(|s| s.eq_ignore_ascii_case("cancel") || s.eq_ignore_ascii_case("no"))
            .unwrap_or(0)
    };
    Ok((buttons, cancel))
}
fn message_response(result: rfd::MessageDialogResult, buttons: &[String], cancel: usize) -> usize {
    use rfd::MessageDialogResult::*;
    match result {
        Custom(label) => buttons.iter().position(|b| b == &label).unwrap_or(cancel),
        Ok | Yes => 0,
        No => {
            if buttons.len() >= 2 {
                1
            } else {
                cancel
            }
        }
        Cancel => cancel,
    }
}
fn open_message(options: &Value) -> Result<Value, String> {
    let (buttons, cancel) = message_buttons(options)?;
    let kind = match buttons.len() {
        1 => rfd::MessageButtons::OkCustom(buttons[0].clone()),
        2 => rfd::MessageButtons::OkCancelCustom(buttons[0].clone(), buttons[1].clone()),
        3 => rfd::MessageButtons::YesNoCancelCustom(
            buttons[0].clone(),
            buttons[1].clone(),
            buttons[2].clone(),
        ),
        _ => unreachable!(),
    };
    let level = match options
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("none")
    {
        "none" | "info" | "question" => rfd::MessageLevel::Info,
        "warning" => rfd::MessageLevel::Warning,
        "error" => rfd::MessageLevel::Error,
        _ => return Err("unsupported message box type".into()),
    };
    let message = options.get("message").and_then(Value::as_str).unwrap_or("");
    let detail = options.get("detail").and_then(Value::as_str).unwrap_or("");
    let description = if detail.is_empty() {
        message.to_string()
    } else {
        format!("{message}\n\n{detail}")
    };
    let result = rfd::MessageDialog::new()
        .set_level(level)
        .set_title(options.get("title").and_then(Value::as_str).unwrap_or(""))
        .set_description(description)
        .set_buttons(kind)
        .show();
    Ok(json!({"response": message_response(result, &buttons, cancel), "checkboxChecked": false}))
}
fn launch(program: &str, args: &[&str]) -> Result<(), String> {
    #[cfg(windows)]
    let executable = {
        let windows = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .ok_or("absolute SystemRoot is required")?;
        match program {
            "explorer.exe" => windows.join(program),
            "rundll32.exe" => windows.join("System32").join(program),
            _ => return Err("unsupported system executable".into()),
        }
    };
    #[cfg(windows)]
    let mut command = Command::new(executable);
    #[cfg(not(windows))]
    let mut command = Command::new(program);
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}
fn open_target(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        launch("rundll32.exe", &["url.dll,FileProtocolHandler", target])
    }
    #[cfg(target_os = "macos")]
    {
        launch("open", &[target])
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        launch("xdg-open", &[target])
    }
}
fn show_in_folder(path: &str) -> Result<(), String> {
    if !Path::new(path).exists() {
        return Err("path does not exist".into());
    }
    #[cfg(windows)]
    {
        launch("explorer.exe", &["/select,", path])
    }
    #[cfg(target_os = "macos")]
    {
        launch("open", &["-R", path])
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let parent = Path::new(path)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let _ = parent;
        Err("selecting a file in the file manager is unsupported on this platform".into())
    }
}

pub fn handle(window: &Window, method: &str, args: &Value) -> Result<Value, String> {
    match method {
        "window.show" => {
            window.set_visible(true);
            Ok(Value::Null)
        }
        "window.hide" => {
            window.set_visible(false);
            Ok(Value::Null)
        }
        "window.focus" => {
            window.set_focus();
            Ok(Value::Null)
        }
        "window.restore" => {
            window.set_minimized(false);
            Ok(Value::Null)
        }
        "window.minimize" => {
            window.set_minimized(true);
            Ok(Value::Null)
        }
        "window.maximize" => {
            window.set_maximized(true);
            Ok(Value::Null)
        }
        "window.unmaximize" => {
            window.set_maximized(false);
            Ok(Value::Null)
        }
        "dialog.showOpenDialog" => {
            let options = option_arg(args);
            let directory = has_property(options, "openDirectory");
            if directory && has_property(options, "openFile") {
                return Err("simultaneous file and directory selection is unsupported".into());
            }
            let multi = has_property(options, "multiSelections");
            let dialog = file_dialog(options);
            let paths: Vec<PathBuf> = match (directory, multi) {
                (true, true) => dialog.pick_folders().unwrap_or_default(),
                (true, false) => dialog.pick_folder().into_iter().collect(),
                (false, true) => dialog.pick_files().unwrap_or_default(),
                (false, false) => dialog.pick_file().into_iter().collect(),
            };
            let paths: Vec<String> = paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            Ok(json!({"canceled": paths.is_empty(), "filePaths": paths}))
        }
        "dialog.showSaveDialog" => {
            let path = file_dialog(option_arg(args)).save_file();
            Ok(
                json!({"canceled": path.is_none(), "filePath": path.map(|p| p.to_string_lossy().into_owned())}),
            )
        }
        "dialog.showMessageBox" => open_message(option_arg(args)),
        "shell.openExternal" => {
            let target = path_arg(args)?;
            let parsed = url::Url::parse(target).map_err(|_| "invalid URL")?;
            if parsed.scheme() != "https"
                || !parsed.username().is_empty()
                || parsed.password().is_some()
            {
                return Err("only credential-free HTTPS URLs are allowed".into());
            }
            open_target(parsed.as_str())?;
            Ok(Value::Null)
        }
        "shell.openPath" => {
            let path = path_arg(args)?;
            if !Path::new(path).exists() {
                return Ok(json!("path does not exist"));
            }
            match open_target(path) {
                Ok(()) => Ok(json!("")),
                Err(e) => Ok(json!(e)),
            }
        }
        "shell.showItemInFolder" => {
            show_in_folder(path_arg(args)?)?;
            Ok(Value::Null)
        }
        _ => Err(format!("unsupported native operation: {method}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_message_cancel_and_maps_response() {
        let (buttons, cancel) =
            message_buttons(&json!({"buttons":["Cancel", "Apply"], "cancelId":0})).unwrap();
        assert_eq!(
            message_response(
                rfd::MessageDialogResult::Custom("Apply".into()),
                &buttons,
                cancel
            ),
            1
        );
        assert_eq!(
            message_response(rfd::MessageDialogResult::Cancel, &buttons, cancel),
            0
        );
    }
    #[test]
    fn rejects_unrepresentable_message_options() {
        assert!(message_buttons(&json!({"buttons":["same", "same"]})).is_err());
        assert!(message_buttons(&json!({"buttons":["a", "b", "c", "d"]})).is_err());
        assert!(message_buttons(&json!({"defaultId":1})).is_err());
    }
    #[test]
    fn parses_dialog_properties_and_arguments() {
        let args = json!([{"properties":["openDirectory", "multiSelections"]}]);
        assert!(has_property(option_arg(&args), "openDirectory"));
        assert!(has_property(option_arg(&args), "multiSelections"));
        assert!(!has_property(option_arg(&args), "openFile"));
        assert!(path_arg(&json!([""])).is_err());
    }
}
