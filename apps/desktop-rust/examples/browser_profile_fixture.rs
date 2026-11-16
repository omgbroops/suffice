// The Node fixture keeps one loopback origin alive while independent processes
// exercise the production root builder and guest surface, then removes its stores.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
#[path = "../src/browser.rs"]
mod browser;

#[cfg(target_os = "macos")]
fn main() {
    use serde_json::json;
    use std::{
        io::BufRead,
        path::PathBuf,
        rc::Rc,
        time::{Duration, Instant},
    };
    use tao::{
        event::Event,
        event_loop::{ControlFlow, EventLoopBuilder},
        window::WindowBuilder,
    };
    use wry::{
        Rect, WebView, WebViewBuilder, WebViewExtDarwin,
        dpi::{LogicalPosition, LogicalSize},
    };
    let args: Vec<_> = std::env::args().collect();
    let profile = PathBuf::from(&args[2]);
    let guest_profile = profile.join("guest-browser");
    let event_loop = EventLoopBuilder::<Result<(), String>>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let remove = args[1] == "remove";
    let mut guest = None;
    let mut root;
    let mut window;
    if remove {
        // Initialize WebKit's main run loop in this fresh cleanup process.
        // This disposable view never opens either named store being removed.
        let win = Rc::new(
            WindowBuilder::new()
                .with_visible(false)
                .build(&event_loop)
                .unwrap(),
        );
        root = Some(
            WebViewBuilder::new()
                .with_incognito(true)
                .with_html("<body>")
                .build_as_child(win.as_ref())
                .unwrap(),
        );
        window = Some(win);
        for dir in [&profile, &guest_profile] {
            let id = browser::profile_store_identifier(dir).unwrap();
            let p = proxy.clone();
            WebView::remove_data_store(&id, move |result| {
                let _ = p.send_event(result.map_err(|e| e.to_string()));
            });
        }
    } else {
        let origin = &args[3];
        assert!(origin.starts_with("http://127.0.0.1:"));
        let run = &args[4];
        let win = Rc::new(
            WindowBuilder::new()
                .with_title("Suffice isolated profile fixture")
                .build(&event_loop)
                .unwrap(),
        );
        let bounds = Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(460, 360).into(),
        };
        root = Some(
            browser::with_profile_store(WebViewBuilder::new(), &profile)
                .unwrap()
                .with_url(format!("{origin}/root?run={run}"))
                .with_bounds(bounds)
                .build_as_child(win.as_ref())
                .unwrap(),
        );
        let mut surface = browser::Surface::new(guest_profile);
        for op in [
            json!({"action":"open"}),
            json!({"action":"bounds","bounds":{"x":0,"y":0,"width":320,"height":300}}),
            json!({"action":"navigate","url":format!("{origin}/guest?run={run}")}),
        ] {
            let mut op = op;
            op["token"] = json!("profile-test");
            surface.command(&win, &op).unwrap();
        }
        guest = Some(surface);
        window = Some(win);
        std::thread::spawn(move || {
            let mut line = String::new();
            let _ = std::io::stdin().lock().read_line(&mut line);
            let _ = proxy.send_event(Ok(()));
        });
    }
    let mut remaining = if remove { 2 } else { 1 };
    let deadline = Instant::now() + Duration::from_secs(15);
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::WaitUntil(deadline);
        match event {
            Event::UserEvent(Ok(())) => {
                remaining -= 1;
                if remaining == 0 {
                    guest.take();
                    root.take();
                    window.take();
                    *flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(Err(error)) => {
                eprintln!("WebKit fixture: {error}");
                *flow = ControlFlow::ExitWithCode(1);
            }
            Event::MainEventsCleared if Instant::now() >= deadline => {
                eprintln!("WebKit fixture timed out");
                *flow = ControlFlow::ExitWithCode(1);
            }
            _ => {}
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This fixture uses macOS WebKit.");
}
