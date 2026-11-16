//! The website is a separate native child view. Never attach the app's preload,
//! IPC handler, custom protocol or web context to this builder.
use serde_json::{Value, json};
use std::{
    cell::{Cell, RefCell},
    path::PathBuf,
    rc::Rc,
    time::{Duration, Instant},
};
use tao::window::Window;
use wry::{
    PageLoadEvent, PermissionResponse, Rect, WebContext, WebView, WebViewBuilder,
    dpi::{LogicalPosition, LogicalSize},
};

/// WebKit's data directory setting does not choose a WKWebsiteDataStore.
/// Store its opaque identifier privately in the explicit Suffice profile.
#[cfg(target_os = "macos")]
pub fn profile_store_identifier(path: &std::path::Path) -> std::io::Result<[u8; 16]> {
    use std::{
        fs::{DirBuilder, File, OpenOptions},
        io::{self, Read, Write},
        os::unix::{
            ffi::OsStrExt,
            fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
        },
    };
    DirBuilder::new().recursive(true).mode(0o700).create(path)?;
    if !std::fs::symlink_metadata(path)?.is_dir() {
        return Err(io::Error::other("WebKit profile must be a directory"));
    }
    let directory = path.canonicalize()?;
    let owner = directory.metadata()?;
    let location = directory.as_os_str().as_bytes();
    let private = |file: &File| -> io::Result<()> {
        let info = file.metadata()?;
        if !info.is_file()
            || info.permissions().mode() & 0o077 != 0
            || info.uid() != unsafe { libc::geteuid() }
        {
            return Err(io::Error::other(
                "WebKit profile receipt must be a private, owned regular file",
            ));
        }
        Ok(())
    };
    let flags = libc::O_NOFOLLOW | libc::O_NONBLOCK;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(flags)
        .open(directory.join(".webkit-store.lock"))?;
    private(&lock)?;
    lock.lock()?;
    let receipt = directory.join(".webkit-store-v1");
    match OpenOptions::new()
        .read(true)
        .custom_flags(flags)
        .open(&receipt)
    {
        Ok(file) => {
            private(&file)?;
            let mut data = Vec::new();
            file.take(8193).read_to_end(&mut data)?;
            if data.len() <= 32 || data.len() > 8192 || data[6] >> 4 != 4 || data[8] >> 6 != 2 {
                return Err(io::Error::other("Invalid WebKit profile receipt"));
            }
            // Keep identity across normal restarts and renames. A copied
            // profile receives its own store, even if its receipt was copied.
            let same_inode = data[24..32] == owner.ino().to_le_bytes();
            if same_inode && (&data[32..] == location || data[16..24] == owner.dev().to_le_bytes())
            {
                return Ok(data[..16].try_into().unwrap());
            }
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let mut id = [0u8; 16];
    getrandom::fill(&mut id).map_err(|e| io::Error::other(e.to_string()))?;
    id[6] = (id[6] & 0x0f) | 0x40;
    id[8] = (id[8] & 0x3f) | 0x80;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory)?;
    temporary.write_all(&id)?;
    temporary.write_all(&owner.dev().to_le_bytes())?;
    temporary.write_all(&owner.ino().to_le_bytes())?;
    temporary.write_all(location)?;
    temporary.as_file().sync_all()?;
    temporary.persist(&receipt).map_err(|e| e.error)?;
    File::open(directory)?.sync_all()?;
    Ok(id)
}

#[cfg(target_os = "macos")]
pub fn with_profile_store<'a>(
    builder: WebViewBuilder<'a>,
    profile: &std::path::Path,
) -> std::io::Result<WebViewBuilder<'a>> {
    use wry::WebViewBuilderExtDarwin;
    if objc2_foundation::NSProcessInfo::processInfo()
        .operatingSystemVersion()
        .majorVersion
        >= 14
    {
        Ok(builder
            .with_incognito(false)
            .with_data_store_identifier(profile_store_identifier(profile)?))
    } else {
        // Older WebKit otherwise silently substitutes its application-wide default.
        Ok(builder.with_incognito(true))
    }
}
fn allowed(raw: &str) -> bool {
    if raw == "about:blank" {
        return true;
    }
    raw.len() <= 8192
        && url::Url::parse(raw).is_ok_and(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.username().is_empty()
                && url.password().is_none()
                && url.host_str().is_some_and(|h| {
                    !h.trim_end_matches('.')
                        .eq_ignore_ascii_case("suffice.localhost")
                })
        })
}
fn rect(input: &Value, width: f64, height: f64) -> Result<Rect, String> {
    let n = |s: &str| {
        input[s]
            .as_f64()
            .filter(|n| n.is_finite())
            .ok_or("Invalid browser bounds")
    };
    let x = n("x")?.ceil().clamp(0., width);
    let y = n("y")?.ceil().clamp(0., height);
    Ok(Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(
            n("width")?.floor().clamp(0., width - x),
            n("height")?.floor().clamp(0., height - y),
        )
        .into(),
    })
}
pub trait Dialogs {
    fn popup(&self, window: &Window, source: &str, destination: &str) -> bool;
    fn save(&self, window: &Window, source: &str, name: &str) -> Option<PathBuf>;
}
struct NativeDialogs;
impl Dialogs for NativeDialogs {
    fn popup(&self, window: &Window, source: &str, destination: &str) -> bool {
        let result = rfd::MessageDialog::new()
            .set_parent(window)
            .set_title("Open pop-up?")
            .set_description(format!(
                "{source} wants to open {destination} in the browser panel."
            ))
            .set_buttons(rfd::MessageButtons::OkCancelCustom(
                "Open pop-up".into(),
                "Cancel".into(),
            ))
            .show();
        result == rfd::MessageDialogResult::Custom("Open pop-up".into())
            || result == rfd::MessageDialogResult::Ok
    }
    fn save(&self, window: &Window, source: &str, name: &str) -> Option<PathBuf> {
        rfd::FileDialog::new()
            .set_parent(window)
            .set_title(format!("Save download from {source}"))
            .set_file_name(name)
            .save_file()
    }
}
fn origin(url: &str) -> String {
    url::Url::parse(url)
        .map(|u| u.origin().ascii_serialization())
        .unwrap_or_default()
}
fn downloadable(url: &str) -> bool {
    (allowed(url) && url != "about:blank") || (url.starts_with("blob:") && allowed(&origin(url)))
}
#[derive(Default)]
struct Details {
    title: String,
    pending: Option<Instant>,
    notice: String,
    close: bool,
}
struct Page {
    id: u64,
    view: WebView,
    details: Rc<RefCell<Details>>,
}
struct Session {
    window: Rc<Window>,
    token: String,
    pages: RefCell<Vec<Rc<Page>>>,
    next: Cell<u64>,
    bounds: Cell<Rect>,
    visible: Cell<bool>,
    prompt: Cell<bool>,
    dialogs: Rc<dyn Dialogs>,
}
impl Session {
    fn active(&self) -> Option<Rc<Page>> {
        self.pages.borrow().last().cloned()
    }
    fn foreground(&self, id: u64) -> bool {
        self.visible.get() && self.active().is_some_and(|page| page.id == id)
    }
    fn ask<T>(&self, id: u64, f: impl FnOnce() -> T) -> Option<T> {
        if !self.foreground(id) || self.prompt.replace(true) {
            return None;
        }
        let result = f();
        self.prompt.set(false);
        self.foreground(id).then_some(result)
    }
    fn place(&self) -> Result<(), String> {
        let pages = self.pages.borrow().clone();
        for (index, page) in pages.iter().enumerate() {
            let show = self.visible.get() && index + 1 == pages.len();
            if show {
                page.view
                    .set_bounds(self.bounds.get())
                    .map_err(|e| e.to_string())?;
            }
            page.view.set_visible(show).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn dismiss_requested(&self) {
        let index = self
            .pages
            .borrow()
            .iter()
            .position(|p| p.details.borrow().close);
        if let Some(index) = index.filter(|i| *i > 0) {
            let removed = self.pages.borrow_mut().split_off(index);
            drop(removed);
            let _ = self.place();
        }
    }
    fn state(&self) -> Value {
        let Some(page) = self.active() else {
            return Value::Null;
        };
        let d = page.details.borrow();
        let url = page
            .view
            .url()
            .ok()
            .filter(|u| allowed(u))
            .unwrap_or_else(|| "about:blank".into());
        json!({"token":self.token,"url":url,"title":d.title,"loading":d.pending.is_some(),"canBack":page.view.can_go_back().unwrap_or(false),"canForward":page.view.can_go_forward().unwrap_or(false),"error":d.notice,"popupDepth":self.pages.borrow().len()-1})
    }
    fn configure<'a>(
        self: &Rc<Self>,
        builder: WebViewBuilder<'a>,
        id: u64,
        details: &Rc<RefCell<Details>>,
    ) -> WebViewBuilder<'a> {
        let (nav, popup, download, completed, title, load) = (
            details.clone(),
            details.clone(),
            details.clone(),
            details.clone(),
            details.clone(),
            details.clone(),
        );
        let opener = Rc::downgrade(self);
        let owner = opener.clone();
        builder
            .with_incognito(true)
            .with_devtools(false)
            .with_visible(false)
            .with_focused(false)
            .with_bounds(self.bounds.get())
            // Wry exposes no WKWebViewDidClose delegate. This navigation is
            // cancelled in every guest and can only dismiss the requesting popup.
            .with_initialization_script("if(window.top===window){window.close=()=>{location.href='about:blank#suffice-dismiss-popup'}}")
            .with_permission_handler(|_| PermissionResponse::Deny)
            .with_navigation_handler(move |target| {
                if matches!(target.as_str(), "about:blank#suffice-dismiss-popup"|"about:blank%23suffice-dismiss-popup") {
                    if id != 0 {
                        nav.borrow_mut().close = true;
                    }
                    return false;
                }
                let ok = allowed(&target);
                if !ok {
                    nav.borrow_mut().notice = "Only web addresses can open in this browser.".into();
                }
                ok
            })
            .with_new_window_req_handler(move |target, features| {
                let Some(session) = opener.upgrade() else {
                    return wry::NewWindowResponse::Deny;
                };
                if !allowed(&target) || !session.foreground(id) || session.pages.borrow().len() >= 5
                {
                    return wry::NewWindowResponse::Deny;
                }
                let source = session
                    .active()
                    .and_then(|p| p.view.url().ok())
                    .map(|u| origin(&u))
                    .unwrap_or_default();
                let destination = if target == "about:blank" {
                    "a blank window".into()
                } else {
                    origin(&target)
                };
                if session.ask(id, || {
                    session
                        .dialogs
                        .popup(&session.window, &source, &destination)
                }) != Some(true)
                {
                    popup.borrow_mut().notice = "Pop-up cancelled.".into();
                    return wry::NewWindowResponse::Deny;
                }
                match session.open_popup(features) {
                    Ok(response) => response,
                    Err(error) => {
                        popup.borrow_mut().notice = format!("Could not open pop-up: {error}");
                        wry::NewWindowResponse::Deny
                    }
                }
            })
            .with_download_started_handler(move |url, path| {
                let Some(session) = owner.upgrade() else {
                    return false;
                };
                if !downloadable(&url) || !session.foreground(id) {
                    return false;
                }
                let source = session
                    .active()
                    .and_then(|p| p.view.url().ok())
                    .map(|u| origin(&u))
                    .unwrap_or_default();
                let name = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("download");
                let display_name:String=name.chars().filter(|c|!c.is_control()).take(200).collect();
                let name=if display_name.is_empty(){"download"}else{display_name.as_str()};
                let selected = session
                    .ask(id, || session.dialogs.save(&session.window, &source, name))
                    .flatten();
                if let Some(destination) = selected.filter(|p| p.is_absolute()) {
                    *path = destination;
                    download.borrow_mut().notice = "Downloading…".into();
                    true
                } else {
                    download.borrow_mut().notice = "Download cancelled.".into();
                    false
                }
            })
            .with_download_completed_handler(move |_, _, ok| {
                let mut d = completed.borrow_mut();
                if ok {
                    d.notice = "Download saved.".into();
                } else if d.notice != "Download cancelled." {
                    d.notice = "Download interrupted.".into();
                }
            })
            .with_document_title_changed_handler(move |s| {
                title.borrow_mut().title = s.chars().take(256).collect()
            })
            .with_on_page_load_handler(move |event, _| {
                let mut d = load.borrow_mut();
                d.pending = match event {
                    PageLoadEvent::Started => Some(Instant::now()),
                    PageLoadEvent::Finished => None,
                };
            })
    }
    #[cfg(any(windows, target_os = "macos"))]
    fn open_popup(
        self: &Rc<Self>,
        features: wry::NewWindowFeatures,
    ) -> Result<wry::NewWindowResponse, String> {
        #[cfg(target_os = "macos")]
        use wry::{WebViewBuilderExtMacos, WebViewExtMacOS};
        #[cfg(windows)]
        use wry::{WebViewBuilderExtWindows, WebViewExtWindows};
        let id = self.next.get();
        self.next.set(id + 1);
        let details = Rc::new(RefCell::new(Details::default()));
        let builder = self.configure(WebViewBuilder::new(), id, &details);
        #[cfg(windows)]
        let builder = builder.with_environment(features.opener.environment);
        #[cfg(target_os = "macos")]
        let builder = builder.with_webview_configuration(features.opener.target_configuration);
        // Let the engine navigate the newly related view using its original request.
        let view = builder
            .build_as_child(self.window.as_ref())
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let native = view.webview();
        #[cfg(target_os = "macos")]
        let native = view.webview().into_super();
        self.pages
            .borrow_mut()
            .push(Rc::new(Page { id, view, details }));
        if let Err(e) = self.place() {
            self.pages.borrow_mut().pop();
            let _ = self.place();
            return Err(e);
        }
        Ok(wry::NewWindowResponse::Create { webview: native })
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    fn open_popup(
        self: &Rc<Self>,
        _: wry::NewWindowFeatures,
    ) -> Result<wry::NewWindowResponse, String> {
        Err("The desktop host requires macOS or Windows.".into())
    }
}
pub struct Surface {
    session: Option<Rc<Session>>,
    context: WebContext,
    #[cfg(target_os = "macos")]
    profile: PathBuf,
    last: Value,
    next_poll: Instant,
    dialogs: Rc<dyn Dialogs>,
}
impl Surface {
    pub fn new(profile: PathBuf) -> Self {
        Self::with_dialogs(profile, Rc::new(NativeDialogs))
    }
    pub fn with_dialogs(profile: PathBuf, dialogs: Rc<dyn Dialogs>) -> Self {
        Self {
            session: None,
            context: WebContext::new(Some(profile.clone())),
            #[cfg(target_os = "macos")]
            profile,
            last: Value::Null,
            next_poll: Instant::now(),
            dialogs,
        }
    }
    pub fn reset(&mut self) {
        if let Some(session) = self.session.take() {
            session.visible.set(false);
        }
        self.last = Value::Null;
    }
    pub fn deadline(&self) -> Option<Instant> {
        self.session
            .as_ref()
            .filter(|s| {
                s.visible.get()
                    || s.active()
                        .is_some_and(|p| p.details.borrow().pending.is_some())
            })
            .map(|_| self.next_poll)
    }
    pub fn poll(&mut self, root: &WebView) {
        let Some(session) = self.session.as_ref() else {
            return;
        };
        let now = Instant::now();
        if now < self.next_poll {
            return;
        }
        self.next_poll = now + Duration::from_millis(250);
        session.dismiss_requested();
        if let Some(page) = session.active() {
            let mut d = page.details.borrow_mut();
            if d.pending
                .is_some_and(|start| now - start > Duration::from_secs(30))
            {
                d.pending = None;
                d.notice = "The page has not finished loading. Check the address or reload.".into();
            }
        }
        let state = session.state();
        if self.last != state {
            let msg = json!({"type":"event","channel":"suffice:browser-state","args":[state]});
            if root
                .evaluate_script(&format!("window.__sufficeReceive?.({msg})"))
                .is_ok()
            {
                self.last = state;
            }
        }
    }
    pub fn command(&mut self, window: &Rc<Window>, payload: &Value) -> Result<Value, String> {
        let token = payload["token"]
            .as_str()
            .filter(|s| {
                !s.is_empty()
                    && s.len() <= 80
                    && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
            .ok_or("Invalid browser tab")?;
        let action = payload["action"].as_str().ok_or("Invalid browser action")?;
        let err = |e: wry::Error| e.to_string();
        if action == "open" && self.session.as_ref().is_none_or(|s| s.token != token) {
            self.reset();
            let session = Rc::new(Session {
                window: window.clone(),
                token: token.into(),
                pages: RefCell::new(Vec::new()),
                next: Cell::new(1),
                bounds: Cell::new(Rect {
                    position: LogicalPosition::new(0., 0.).into(),
                    size: LogicalSize::new(1., 1.).into(),
                }),
                visible: Cell::new(false),
                prompt: Cell::new(false),
                dialogs: self.dialogs.clone(),
            });
            let details = Rc::new(RefCell::new(Details::default()));
            let builder = session.configure(
                WebViewBuilder::new_with_web_context(&mut self.context),
                0,
                &details,
            );
            // Related popups receive this exact store in their opener's native configuration.
            #[cfg(target_os = "macos")]
            let builder = with_profile_store(builder, &self.profile).map_err(|e| e.to_string())?;
            let view = builder
                .with_url("about:blank")
                .build_as_child(window.as_ref())
                .map_err(err)?;
            session.pages.borrow_mut().push(Rc::new(Page {
                id: 0,
                view,
                details,
            }));
            self.session = Some(session);
        }
        let Some(session) = self.session.as_ref().filter(|s| s.token == token) else {
            return Ok(Value::Null);
        };
        session.dismiss_requested();
        let page = session.active().ok_or("Browser tab closed")?;
        match action {
            "open" => {}
            "bounds" => {
                let size = window.inner_size().to_logical::<f64>(window.scale_factor());
                let b = rect(&payload["bounds"], size.width, size.height)?;
                let size = b.size.to_logical::<f64>(window.scale_factor());
                session.bounds.set(b);
                session.visible.set(size.width > 0. && size.height > 0.);
                session.place()?;
            }
            "hide" => {
                session.visible.set(false);
                session.place()?;
            }
            "navigate" => {
                let uri = payload["url"]
                    .as_str()
                    .filter(|s| allowed(s))
                    .ok_or("Enter an HTTP or HTTPS address without a username or password.")?;
                {
                    let mut d = page.details.borrow_mut();
                    d.notice.clear();
                    d.pending = Some(Instant::now());
                }
                page.view.load_url(uri).map_err(err)?;
            }
            "reload" => {
                page.details.borrow_mut().notice.clear();
                page.view.reload().map_err(err)?;
            }
            "back" => {
                page.details.borrow_mut().notice.clear();
                if page.view.can_go_back().map_err(err)? {
                    page.view.go_back().map_err(err)?;
                }
            }
            "forward" => {
                page.details.borrow_mut().notice.clear();
                if page.view.can_go_forward().map_err(err)? {
                    page.view.go_forward().map_err(err)?;
                }
            }
            "dismiss-popup" => {
                if session.pages.borrow().len() > 1 {
                    session.pages.borrow_mut().pop();
                    session.place()?;
                }
            }
            "close" => {
                self.reset();
                return Ok(Value::Null);
            }
            _ => return Err("Unknown browser action".into()),
        }
        self.next_poll = Instant::now();
        Ok(session.state())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn private_store_receipts_survive_concurrent_open_but_do_not_alias_copies() {
        use std::{
            fs,
            os::unix::fs::{PermissionsExt, symlink},
            sync::{Arc, Barrier},
        };
        let scratch = tempfile::tempdir().unwrap();
        let first = scratch.path().join("first");
        let barrier = Arc::new(Barrier::new(8));
        let readers: Vec<_> = (0..8)
            .map(|_| {
                let path = first.clone();
                let start = barrier.clone();
                std::thread::spawn(move || {
                    start.wait();
                    profile_store_identifier(&path).unwrap()
                })
            })
            .collect();
        let ids: Vec<_> = readers.into_iter().map(|r| r.join().unwrap()).collect();
        assert!(ids.iter().all(|id| id == &ids[0]));
        let receipt = first.join(".webkit-store-v1");
        assert_eq!(
            fs::metadata(&receipt).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let moved = scratch.path().join("moved");
        fs::rename(&first, &moved).unwrap();
        assert_eq!(profile_store_identifier(&moved).unwrap(), ids[0]);
        fs::create_dir(&first).unwrap();
        fs::copy(moved.join(".webkit-store-v1"), &receipt).unwrap();
        assert_ne!(profile_store_identifier(&first).unwrap(), ids[0]);
        fs::remove_file(&receipt).unwrap();
        symlink(moved.join(".webkit-store-v1"), &receipt).unwrap();
        assert!(profile_store_identifier(&first).is_err());
    }
    #[test]
    fn web_urls_only() {
        for s in [
            "https://example.com",
            "http://localhost:8000/",
            "about:blank",
        ] {
            assert!(allowed(s));
        }
        for s in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://x@y.test/",
            "https://suffice.localhost./",
            "suffice://localhost/",
            "about:config",
        ] {
            assert!(!allowed(s));
        }
    }
    #[test]
    fn viewport_is_clamped() {
        let b = rect(&json!({"x":-12,"y":98,"width":200,"height":40}), 100., 100.).unwrap();
        assert_eq!(b.size.to_logical::<f64>(1.), LogicalSize::new(100., 2.));
        assert!(rect(&json!({}), 100., 100.).is_err());
    }
}
