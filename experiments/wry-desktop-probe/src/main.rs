//! A deliberately limited architecture experiment, never the Suffice production UI.
#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use base64::Engine;
    use std::{
        io::Write,
        time::{Duration, Instant},
    };
    use tao::{
        event::{Event, WindowEvent},
        event_loop::{ControlFlow, EventLoopBuilder},
        window::WindowBuilder,
    };
    use wry::WebViewBuilder;

    #[derive(Debug)]
    enum ProbeEvent {
        Message(String),
    }

    let probe = std::env::args().any(|a| a == "--probe");
    let started = Instant::now();
    if probe {
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(30));
            eprintln!("WebView2 probe exceeded its 30-second total startup/shutdown deadline");
            std::process::exit(2);
        });
    }
    let event_loop = EventLoopBuilder::<ProbeEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let window = WindowBuilder::new()
        .with_title("Suffice Wry architecture probe — not the product")
        .with_inner_size(tao::dpi::LogicalSize::new(1000.0, 700.0))
        .build(&event_loop)?;
    // Browser storage is restricted to an isolated temporary experiment directory.
    let profile = std::env::temp_dir().join(format!("suffice-wry-probe-{}", std::process::id()));
    std::fs::create_dir_all(&profile)?;
    let mut context = wry::WebContext::new(Some(profile));
    eprintln!("WebView2 build starting at {:?}", started.elapsed());
    let fixture_url = format!(
        "data:text/html;charset=utf-8;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(include_bytes!("probe.html"))
    );
    let webview = WebViewBuilder::new_with_web_context(&mut context)
        .with_html(include_str!("probe.html"))
        // WebView2 uses about:blank and a data URL for this exact trusted fixture.
        .with_navigation_handler(move |url| url == "about:blank" || url == fixture_url)
        .with_on_page_load_handler(|_, url| eprintln!("Fixture load: {url}"))
        .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
        .with_ipc_handler(move |request| {
            let _ = proxy.send_event(ProbeEvent::Message(request.body().clone()));
        })
        .build(&window)?;
    eprintln!("WebView2 build completed at {:?}", started.elapsed());
    let mut deadline = started + Duration::from_secs(20);
    let mut ready = false;
    let mut verified = false;
    event_loop.run(move |event, _, flow| {
        *flow = if probe { ControlFlow::WaitUntil(deadline) } else { ControlFlow::Wait };
        match event {
            Event::UserEvent(ProbeEvent::Message(message)) => {
                let payload: serde_json::Value = match serde_json::from_str(&message) {
                    Ok(value) => value,
                    Err(_) => return,
                };
                let name = payload["event"].as_str().unwrap_or("");
                if name == "ready" && !ready {
                    ready = true;
                    println!("{}", serde_json::json!({"event":"ready","readyMs":started.elapsed().as_secs_f64()*1000.0,"pid":std::process::id(),"host":"wry-webview2","fixtureThreads":30,"fixtureMessages":1000}));
                    let _ = std::io::stdout().flush();
                    if probe {
                        window.set_inner_size(tao::dpi::LogicalSize::new(900.0, 650.0));
                        if let Err(error) = webview.evaluate_script("window.runProbe()") {
                            eprintln!("Probe execution failed: {error}");
                            *flow = ControlFlow::ExitWithCode(1);
                        }
                    }
                } else if name == "verified" {
                    verified = payload["ok"] == true;
                    println!("{payload}");
                    let _ = std::io::stdout().flush();
                    deadline = Instant::now() + Duration::from_secs(6);
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *flow = ControlFlow::Exit,
            Event::NewEvents(_) if probe && Instant::now() >= deadline => {
                println!("{}", serde_json::json!({"event":"shutdown","ok":ready&&verified,"elapsedMs":started.elapsed().as_secs_f64()*1000.0}));
                let _ = std::io::stdout().flush();
                *flow = ControlFlow::ExitWithCode(if ready && verified { 0 } else { 1 });
            }
            _ => {}
        }
    });
}

#[cfg(not(windows))]
fn main() {
    eprintln!("This WebView2 architecture probe has only been implemented for Windows.");
    std::process::exit(2);
}
