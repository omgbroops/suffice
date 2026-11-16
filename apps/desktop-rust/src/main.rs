mod browser;
mod fixture_measure;
mod instance;
mod native;
mod process_tree;
mod transport;
use serde_json::{Value, json};
use std::{
    borrow::Cow,
    io::BufReader,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use tao::{
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use wry::{
    WebViewBuilder,
    http::{Request, Response},
};

#[derive(Debug)]
enum Message {
    Renderer(String, transport::Permit),
    RendererOverflow,
    DeliveryFailed(String, u64),
    ResetBrowser,
    MeasureSelect,
    FixtureCommand(String),
    Engine(String, std::sync::mpsc::SyncSender<()>),
    EngineClosed,
    Tick,
    Activate,
    NativeComplete(Value, Result<Value, String>),
}
fn app_origin() -> &'static str {
    if cfg!(windows) {
        "http://suffice.localhost"
    } else {
        "suffice://localhost"
    }
}
fn trusted_document(raw: &str, origin: &str) -> bool {
    let Ok(uri) = url::Url::parse(raw) else {
        return false;
    };
    uri.username().is_empty()
        && uri.password().is_none()
        && uri.port().is_none()
        && uri
            .host_str()
            .is_some_and(|host| format!("{}://{}", uri.scheme(), host) == origin)
        && matches!(uri.path(), "" | "/" | "/index.html")
}
fn argument(name: &str) -> Result<String, String> {
    let args: Vec<String> = std::env::args().collect();
    let index = args
        .iter()
        .position(|a| a == name)
        .ok_or_else(|| format!("missing required {name}"))?;
    args.get(index + 1)
        .filter(|v| !v.starts_with("--"))
        .cloned()
        .ok_or_else(|| format!("missing value for {name}"))
}
fn asset(root: &Path, request: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let path = request.uri().path();
    // Reject encoded names entirely: Vite's generated asset names need no escapes.
    let relative = if path == "/" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };
    let valid = !relative.contains('%')
        && !relative.contains('\\')
        && !relative.split('/').any(|x| x == ".." || x == ".");
    let file = root.join(relative).canonicalize();
    if valid
        && let Ok(file) = file
        && file.starts_with(root)
        && let Ok(bytes) = std::fs::read(&file)
    {
        let mime = match file.extension().and_then(|x| x.to_str()).unwrap_or("") {
            "html" => "text/html; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "woff2" => "font/woff2",
            "json" => "application/json",
            _ => "application/octet-stream",
        };
        return Response::builder().status(200).header("Content-Type",mime).header("X-Content-Type-Options","nosniff").header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'").body(Cow::Owned(bytes)).unwrap();
    }
    Response::builder()
        .status(404)
        .body(Cow::Borrowed(&b"Not found"[..]))
        .unwrap()
}
fn send(input: &transport::Sender, value: &Value) {
    if let Err(error) = input.send(value) {
        eprintln!("Bridge send failed: {error}");
    }
}
fn cleanup(child: &mut Child, input: &transport::Sender, tree: &mut process_tree::ProcessTree) {
    let deadline = Instant::now() + Duration::from_secs(3);
    let _ = input.send(&json!({"type":"shutdown"}));
    while Instant::now() < deadline {
        if child.try_wait().ok().flatten().is_some() {
            tree.close();
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    tree.close();
    let _ = child.kill();
    let _ = child.try_wait();
}
fn bridge_command(node: &Path, root: &Path, home: &Path, profile: &Path, offline: bool) -> Command {
    let mut command = Command::new(node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000004);
    }
    command
        .arg(root.join("apps/desktop-rust/start-bridge.mjs"))
        .arg("--wait-for-host")
        .arg("--root")
        .arg(root)
        .arg("--profile")
        .arg(profile)
        .env("SUFFICE_HOME", home)
        .env("SUFFICE_SESSION_BACKEND", "rust")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    if offline {
        command.env("PI_OFFLINE", "1");
    }
    command
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    if process_tree::helper_mode()? {
        return Ok(());
    }
    if !cfg!(any(windows, target_os = "macos")) {
        return Err("experimental host requires macOS or Windows process containment".into());
    }
    let root = PathBuf::from(argument("--root")?).canonicalize()?;
    let home = PathBuf::from(argument("--home")?);
    let profile = PathBuf::from(argument("--profile")?);
    if !home.is_absolute() || !profile.is_absolute() || home == profile {
        return Err("--home and --profile must be distinct absolute scratch paths".into());
    }
    std::fs::create_dir_all(&home)?;
    std::fs::create_dir_all(&profile)?;
    let home = home.canonicalize()?;
    let profile = profile.canonicalize()?;
    if home == profile || home.starts_with(&profile) || profile.starts_with(&home) {
        return Err("scratch directories must not overlap".into());
    }
    let node = native::configure_launch(Path::new(&argument("--node")?), &root, &home, &profile)?;
    let smoke = std::env::args().any(|x| x == "--smoke");
    let measure = std::env::args().any(|x| x == "--measure-fixture");
    if measure && smoke {
        return Err("Choose either --measure-fixture or --smoke".into());
    }
    let mut fixture = measure.then(fixture_measure::Fixture::default);
    let smoke_pause = smoke && std::env::args().any(|x| x == "--smoke-pause");
    let assets = root.join("apps/desktop/dist").canonicalize()?;
    let preload = std::fs::read_to_string(root.join("apps/desktop/electron/preload.cjs"))?;
    let started = Instant::now();
    let event_loop = EventLoopBuilder::<Message>::with_user_event().build();
    let activation = event_loop.create_proxy();
    let Some(owner) = instance::claim(&profile, move || {
        activation.send_event(Message::Activate).is_ok()
    })?
    else {
        return Ok(());
    };
    let mut instance = Some(owner);
    let proxy = event_loop.create_proxy();
    #[cfg(target_os = "macos")]
    let (mut child, mut tree) = process_tree::spawn_macos(
        bridge_command(Path::new(&node), &root, &home, &profile, smoke || measure),
        &root,
    )?;
    #[cfg(not(target_os = "macos"))]
    let mut child =
        bridge_command(Path::new(&node), &root, &home, &profile, smoke || measure).spawn()?;
    #[cfg(not(target_os = "macos"))]
    let mut tree = match process_tree::ProcessTree::attach(&child) {
        Ok(tree) => tree,
        Err(error) => {
            let _ = child.kill();
            return Err(error.into());
        }
    };
    let exit_proxy = event_loop.create_proxy();
    tree.monitor(&child, move || {
        let _ = exit_proxy.send_event(Message::EngineClosed);
    })?;
    tree.resume(&child)?;
    let input = transport::Sender::new(child.stdin.take().ok_or("missing bridge stdin")?);
    input.send(&json!({"type":"host-start","rendererTransport":"fragments-v1"}))?;
    let output = child.stdout.take().ok_or("missing bridge stdout")?;
    std::thread::spawn(move || {
        let mut output = BufReader::new(output);
        let (ack, wait) = std::sync::mpsc::sync_channel(1);
        loop {
            match transport::read_frame(&mut output) {
                Ok(Some(line)) => {
                    if proxy
                        .send_event(Message::Engine(line, ack.clone()))
                        .is_err()
                        || wait.recv_timeout(Duration::from_secs(120)).is_err()
                    {
                        break;
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    eprintln!("Bridge protocol error: {error}");
                    break;
                }
            }
        }
        let _ = proxy.send_event(Message::EngineClosed);
    });
    let window = std::rc::Rc::new(
        WindowBuilder::new()
            .with_title("Suffice — experimental Rust host")
            .with_inner_size(tao::dpi::LogicalSize::new(1440., 900.))
            .with_decorations(false)
            .build(&event_loop)?,
    );
    let mut guest_browser = browser::Surface::new(profile.join("guest-browser"));
    let mut context = wry::WebContext::new(Some(profile.clone()));
    // The original preload runs inside a closure with a narrow lexical Electron shim.
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    let receiver = include_str!("renderer-receiver.js");
    let mut shim = format!(
        r#"(()=>{{ if(window.top!==window || location.protocol+'//'+location.host!=='__SUFFICE_APP_ORIGIN__' || !['','/','/index.html'].includes(location.pathname))return;
      const doc=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');let seq=0; const pending=new Map(), listeners=new Map();
      const ipcRenderer={{invoke:(channel,...args)=>new Promise((resolve,reject)=>{{const id=++seq;const wire=JSON.stringify({{type:'invoke-json',id,document:doc,channel,argsJson:JSON.stringify(args)}});if(new Blob([wire]).size>=64*1024*1024)throw Error('Desktop invocation exceeds the 64 MiB input budget');pending.set(id,{{resolve,reject}});try{{window.ipc.postMessage(wire);}}catch(error){{pending.delete(id);reject(error);}}}}),on:(channel,fn)=>{{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);}},removeListener:(channel,fn)=>listeners.get(channel)?.delete(fn)}};
      const contextBridge={{exposeInMainWorld:(name,value)=>Object.defineProperty(window,name,{{value, configurable:false}})}};
      const require=(name)=>{{if(name!=='electron')throw Error('unsupported preload module');return {{contextBridge,ipcRenderer}}}};
      const process={{argv:[],platform:{platform:?}}};
      Object.defineProperty(window,'__sufficeReceive',{{value:(m)=>{{if(m.type==='reply'){{if(m.document!==doc)return;const p=pending.get(m.id);if(p){{pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new Error(String(m.error?.message||m.error||'IPC failed')));}}}}else if(m.type==='event'){{for(const f of listeners.get(m.channel)||[]){{try{{f({{}},...(m.args||[]));}}catch(error){{console.error('Desktop event listener failed',error);}}}}}}}},configurable:false}});
      Object.defineProperty(window,'__sufficeFragment',{{value:({receiver})(window.__sufficeReceive)}});
      document.addEventListener('DOMContentLoaded',()=>window.ipc.postMessage(JSON.stringify({{type:'renderer-ready'}})),{{once:true}});
      (()=>{{ {preload} }})();
    }})();"#
    );
    shim.push_str(r#";(()=>{if(window.top!==window || location.protocol+'//'+location.host!=='__SUFFICE_APP_ORIGIN__' || !['','/','/index.html'].includes(location.pathname))return; document.addEventListener('pointerdown',e=>{if(e.button===0 && e.target.closest('.window-drag-region,.panel-drag-region,.sidebar-heading,.thread-header,.right-panel-header') && !e.target.closest('button,input,a,[role=tab]'))window.ipc.postMessage(JSON.stringify({type:'drag'}));});})();"#);
    if smoke {
        shim.push_str(&format!(";window.__sufficeMeasurePause={smoke_pause};"));
        shim.push_str(r#";(()=>{if(window.top!==window || location.protocol+'//'+location.host!=='__SUFFICE_APP_ORIGIN__' || !['','/','/index.html'].includes(location.pathname))return;
          window.addEventListener('DOMContentLoaded',()=>{let attempts=0;const timer=setInterval(()=>{
            const rows=[...document.querySelectorAll('.thread-row[data-thread]')],row=rows.find(r=>r.textContent.includes('Rust host large transcript'));
            if(!row || rows.length!==30 || !document.querySelector('.composer')?.getClientRects().length){if(++attempts>150){clearInterval(timer);window.ipc.postMessage(JSON.stringify({type:'smoke',ok:false,reason:'no saved thread row'}));}return;}
            clearInterval(timer);let selectedOnce=false;window.__sufficeMeasureSelect=()=>{if(selectedOnce)return;selectedOnce=true;row.click();let checks=0;const selected=setInterval(()=>{
              const transcript=document.querySelector('.thread-messages');if(document.querySelector('.thread-row[data-thread="'+row.dataset.thread+'"]')?.getAttribute('aria-pressed')==='true' && transcript?.textContent.includes('Rust host fixture message 999')){clearInterval(selected);window.ipc.postMessage(JSON.stringify({type:'smoke',ok:true,threadCount:rows.length,transcriptCharacters:transcript.textContent.trim().length}));}
              else if(++checks>100){clearInterval(selected);window.ipc.postMessage(JSON.stringify({type:'smoke',ok:false,reason:'saved transcript did not render'}));}
            },100);};
            window.ipc.postMessage(JSON.stringify({type:'smoke-ready',threadCount:rows.length,width:innerWidth,height:innerHeight,devicePixelRatio}));
            if(!window.__sufficeMeasurePause)window.__sufficeMeasureSelect();
          },100);});})();"#);
    }
    if smoke_pause || measure {
        let commands = event_loop.create_proxy();
        std::thread::spawn(move || {
            let mut stdin = BufReader::new(std::io::stdin());
            while let Ok(Some(line)) = transport::read_frame(&mut stdin) {
                let parsed = serde_json::from_str::<Value>(&line).ok();
                if measure {
                    let action = parsed
                        .as_ref()
                        .filter(|v| v["type"] == "measure-fixture")
                        .and_then(|v| v["action"].as_str())
                        .filter(|a| matches!(*a, "select" | "settings" | "pty" | "finish"))
                        .unwrap_or("invalid");
                    if commands
                        .send_event(Message::FixtureCommand(action.to_owned()))
                        .is_err()
                    {
                        break;
                    }
                } else if parsed.is_some_and(|v| v["type"] == "measure-select") {
                    let _ = commands.send_event(Message::MeasureSelect);
                }
            }
        });
    }
    if smoke {
        let timer = event_loop.create_proxy();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(200));
                if timer.send_event(Message::Tick).is_err() {
                    break;
                }
            }
        });
    }
    let proxy = event_loop.create_proxy();
    let renderer_budget = transport::Budget::default();
    let overflow = std::sync::atomic::AtomicBool::new(false);
    let navigation_events = event_loop.create_proxy();
    let root_builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_custom_protocol("suffice".into(), move |_, req| asset(&assets, req))
        .with_initialization_script(shim.replace("__SUFFICE_APP_ORIGIN__", app_origin()))
        .with_on_page_load_handler(move |event, url| {
            if matches!(event, wry::PageLoadEvent::Started) {
                let _ = navigation_events.send_event(Message::ResetBrowser);
            }
            eprintln!("page {url}");
        })
        .with_navigation_handler(|url| trusted_document(&url, app_origin()))
        .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
        .with_ipc_handler(move |req| {
            if trusted_document(&req.uri().to_string(), app_origin()) {
                match renderer_budget.reserve(req.body().len()) {
                    Ok(permit) => {
                        let _ = proxy.send_event(Message::Renderer(req.body().clone(), permit));
                    }
                    Err(_) => {
                        if !overflow.swap(true, std::sync::atomic::Ordering::AcqRel) {
                            let _ = proxy.send_event(Message::RendererOverflow);
                        }
                    }
                }
            }
        })
        .with_url("suffice://localhost/");
    #[cfg(target_os = "macos")]
    let root_builder = browser::with_profile_store(root_builder, &profile)?;
    // On Cocoa, build() replaces the NSWindow contentView, detaching Tao's
    // original NSView. Anchor both siblings to the same live Tao view instead.
    #[cfg(target_os = "macos")]
    let webview = root_builder
        .with_bounds(wry::Rect {
            position: tao::dpi::PhysicalPosition::new(0, 0).into(),
            size: window.inner_size().into(),
        })
        .build_as_child(&window)?;
    #[cfg(not(target_os = "macos"))]
    let webview = root_builder.build(&window)?;
    let mut deadline = started
        + Duration::from_secs(if measure {
            180
        } else if smoke {
            25
        } else {
            86400
        });
    let mut close_requested = false;
    let mut engine_ready = false;
    let mut smoke_ok = false;
    let mut renderer_ready = false;
    let mut document_generation = 0u64;
    let mut waiting_fragment = None;
    let mut stream = transport::FragmentStream::default();
    let delivery = event_loop.create_proxy();
    event_loop.run(move |event, _, flow| {
        let next = guest_browser.deadline().into_iter().chain((smoke||measure).then_some(deadline)).min();
        *flow = next.map_or(ControlFlow::Wait,ControlFlow::WaitUntil);
        match event {
            Event::UserEvent(Message::Renderer(line,_permit)) => if let Ok(v) = serde_json::from_str::<Value>(&line) { if v["type"] == "invoke-json" && v["channel"].as_str().is_some_and(|c| c.starts_with("suffice:")) { if let Err(error)=input.send(&v){let reply=json!({"type":"reply","id":v["id"],"document":v["document"],"ok":false,"error":error.to_string()});let _=webview.evaluate_script(&format!("window.__sufficeReceive?.({reply})"));} } else if v["type"]=="renderer-ready" {
                renderer_ready=true;
                if let Some(f)=fixture.as_mut().filter(|f|f.expected()==Some("ready"))
                    && let Err(error)=f.start("ready",&webview) {
                    println!("{}",json!({"event":"fixture-ready","action":"ready","ok":false,"reason":error}));
                    *flow=ControlFlow::ExitWithCode(1);return;
                }
                if let Some(pending)=waiting_fragment.take(){let _=delivery.send_event(pending);}
            } else if measure && v["type"]=="fixture-result" {
                let f=fixture.as_mut().expect("measurement fixture enabled");let phase=f.expected().unwrap_or("finished");
                match f.accept(&v,started.elapsed().as_millis()) {
                   Ok(receipt)=>{println!("{receipt}");if phase=="finish"{*flow=ControlFlow::Exit;}},
                   Err(error)=>{println!("{}",json!({"event":"fixture-phase","action":phase,"ok":false,"reason":error}));*flow=ControlFlow::ExitWithCode(1);}
                }
            } else if v["type"] == "drag" { let _=window.drag_window(); } else if smoke && v["type"] == "smoke-ready" { println!("{}",json!({"event":"ui-ready","threadCount":v["threadCount"],"width":v["width"],"height":v["height"],"devicePixelRatio":v["devicePixelRatio"],"elapsedMs":started.elapsed().as_millis()})); } else if smoke && v["type"] == "smoke" { smoke_ok=v["ok"]==true; println!("{}",json!({"event":"smoke","ok":smoke_ok,"threadCount":v["threadCount"],"transcriptCharacters":v["transcriptCharacters"],"reason":v["reason"],"elapsedMs":started.elapsed().as_millis()})); deadline=Instant::now()+Duration::from_secs(5); } },
            Event::UserEvent(Message::Engine(line, ack)) => {
                let Ok(frame) = serde_json::from_str::<Value>(&line) else {
                    eprintln!("Invalid bridge control frame");
                    *flow = ControlFlow::ExitWithCode(1);
                    return;
                };
                match frame["type"].as_str() {
                    Some("ready") => {
                        engine_ready = true;
                        println!("{}", json!({"event":"engine-ready","elapsedMs":started.elapsed().as_millis()}));
                    }
                    Some("renderer-chunk") => {
                        if !renderer_ready {
                            waiting_fragment = Some(Message::Engine(line, ack));
                            return;
                        }
                        match stream.accept(&frame) {
                            Ok(true) => {
                                let completed = ack.clone();
                                let errors = delivery.clone();
                                let generation = document_generation;
                                let script = format!("(()=>{{try{{return window.__sufficeFragment({frame})}}catch(error){{return String(error.message)}}}})()");
                                let result = webview.evaluate_script_with_callback(&script, move |status| {
                                    if status != "true" {
                                        let _ = errors.send_event(Message::DeliveryFailed(status, generation));
                                    }
                                    let _ = completed.try_send(());
                                });
                                match result {
                                    Ok(()) => return, // The callback acknowledges this physical fragment.
                                    Err(error) => {
                                        eprintln!("Renderer evaluation failed: {error}");
                                        *flow = ControlFlow::ExitWithCode(1);
                                    }
                                }
                            }
                            Ok(false) => {} // Navigation discarded the previous document's partial transfer.
                            Err(error) => {
                                eprintln!("Bridge protocol error: {error}");
                                *flow = ControlFlow::ExitWithCode(1);
                            }
                        }
                    }
                    Some("native") => {
                        let method = frame["method"].as_str().unwrap_or("");
                        let result: Result<Option<Value>, String> = (|| {
                            let encoded = frame["argsJson"].as_str().ok_or("Missing native arguments")?;
                            let args: Value = serde_json::from_str(encoded).map_err(|_| "Native operation cannot represent these arguments")?;
                            if !args.is_array() { return Err("Invalid native arguments".into()); }
                            match method {
                                "session.clearCache" => {
                                    let completed = delivery.clone(); let id = frame["id"].clone();
                                    native::clear_cache(&webview, move |result| {
                                        let _ = completed.send_event(Message::NativeComplete(id, result.map(|()| Value::Null)));
                                    })?;
                                    Ok(None)
                                }
                                "notification.show" => {
                                    let body = args[0].as_str().ok_or("Invalid notification body")?.to_owned();
                                    let completed = delivery.clone(); let activate = delivery.clone(); let id = frame["id"].clone();
                                    native::show_notification(body, move |result| {
                                        let _ = completed.send_event(Message::NativeComplete(id, result.map(|()| Value::Null)));
                                    }, move || { let _ = activate.send_event(Message::Activate); })?;
                                    Ok(None)
                                }
                                "window.close" => { *flow = ControlFlow::Exit; Ok(Some(Value::Null)) }
                                "window.hide" => { close_requested = false; native::handle(&window, method, &args).map(Some) }
                                "browser.command" => guest_browser.command(&window, &args[0]).map(Some),
                                _ => native::handle(&window, method, &args).map(Some),
                            }
                        })();
                        let response = match result {
                            Ok(Some(value)) => json!({"type":"native-reply","id":frame["id"],"ok":true,"result":value}),
                            Ok(None) => { let _ = ack.try_send(()); return; },
                            Err(error) => json!({"type":"native-reply","id":frame["id"],"ok":false,"error":error}),
                        };
                        if let Err(error) = input.send(&response) {
                            let failure = json!({"type":"native-reply","id":frame["id"],"ok":false,"error":error.to_string()});
                            if input.send(&failure).is_err() {
                                eprintln!("Could not deliver native response: {error}");
                                *flow = ControlFlow::ExitWithCode(1);
                            }
                        }
                    }
                    Some("bootstrap-ready") => {}
                    _ => { eprintln!("Unexpected bridge frame type"); *flow = ControlFlow::ExitWithCode(1); }
                }
                let _ = ack.try_send(());
            }
            Event::UserEvent(Message::FixtureCommand(action)) if measure => {
                if let Err(error)=fixture.as_mut().expect("measurement fixture enabled").start(&action,&webview){
                   println!("{}",json!({"event":"fixture-phase","action":action,"ok":false,"reason":error}));*flow=ControlFlow::ExitWithCode(1);
                }
            }
            Event::UserEvent(Message::MeasureSelect) if smoke_pause => {let _=webview.evaluate_script("window.__sufficeMeasureSelect?.()");},
            Event::UserEvent(Message::ResetBrowser) => { guest_browser.reset();renderer_ready=false;document_generation+=1;stream.reset_document(); },
            Event::UserEvent(Message::DeliveryFailed(reason,generation)) if generation==document_generation => {eprintln!("Renderer bridge delivery failed: {}",reason.chars().take(256).collect::<String>());*flow=ControlFlow::ExitWithCode(1);},
            Event::UserEvent(Message::RendererOverflow) => {eprintln!("Renderer IPC queue limit reached");*flow=ControlFlow::ExitWithCode(1);},
            Event::UserEvent(Message::NativeComplete(id,result)) => {
                let response = match result {
                    Ok(value) => json!({"type":"native-reply","id":id,"ok":true,"result":value}),
                    Err(error) => json!({"type":"native-reply","id":id,"ok":false,"error":error}),
                };
                if input.send(&response).is_err() { *flow=ControlFlow::ExitWithCode(1); }
            },
            Event::UserEvent(Message::Activate) => { close_requested=false;window.set_minimized(false);window.set_visible(true);window.set_focus();send(&input,&json!({"type":"window-state","state":{"focused":true,"visible":true,"minimized":false}})); },
            Event::UserEvent(Message::EngineClosed) => { eprintln!("engine bridge exited"); *flow=ControlFlow::ExitWithCode(if close_requested {0}else{1}); },
            Event::WindowEvent {event:WindowEvent::CloseRequested,..} => { if !close_requested { match input.send(&json!({"type":"window-close-request"})) { Ok(()) => close_requested=true, Err(error) => eprintln!("Close request could not be queued; retry close: {error}"), } } },
            Event::WindowEvent {event:WindowEvent::Focused(focused),..} => send(&input,&json!({"type":"window-state","state":{"focused":focused,"minimized":window.is_minimized(),"maximized":window.is_maximized(),"visible":window.is_visible()}})),
            Event::WindowEvent {event:WindowEvent::Resized(size),..} => {
                #[cfg(target_os = "macos")]
                let _ = webview.set_bounds(wry::Rect { position: tao::dpi::PhysicalPosition::new(0,0).into(), size: size.into() });
                #[cfg(not(target_os = "macos"))] let _ = size;
                send(&input,&json!({"type":"window-state","state":{"minimized":window.is_minimized(),"maximized":window.is_maximized(),"visible":window.is_visible()}}));
            },
            Event::UserEvent(Message::Tick) if smoke && Instant::now() >= deadline => { println!("{}",json!({"event":"shutdown","ok":engine_ready && smoke_ok,"engineReady":engine_ready})); *flow=ControlFlow::ExitWithCode(if engine_ready && smoke_ok {0}else{1}); },
            Event::LoopDestroyed => { instance.take();cleanup(&mut child,&input,&mut tree); },
            Event::MainEventsCleared if measure && Instant::now()>=deadline => {
                println!("{}",json!({"event":"fixture-phase","action":fixture.as_ref().and_then(|f|f.expected()),"ok":false,"reason":"Fixture watchdog expired"}));
                *flow=ControlFlow::ExitWithCode(1);
            }
            Event::MainEventsCleared => {guest_browser.poll(&webview);let next=guest_browser.deadline().into_iter().chain((smoke||measure).then_some(deadline)).min();*flow=next.map_or(ControlFlow::Wait,ControlFlow::WaitUntil);}, _=>{}
        }
    });
}

#[cfg(test)]
mod startup_tests {
    use super::*;

    #[test]
    fn trust_only_the_packaged_host_document() {
        for origin in ["http://suffice.localhost", "suffice://localhost"] {
            assert!(trusted_document(&format!("{origin}/"), origin));
            assert!(trusted_document(
                &format!("{origin}/index.html#chat"),
                origin
            ));
            for wrong in ["/child.html", ":8443/", ".example/"] {
                assert!(!trusted_document(&format!("{origin}{wrong}"), origin));
            }
        }
        assert!(!trusted_document(
            "https://suffice.localhost/",
            "http://suffice.localhost"
        ));
    }
    #[test]
    fn bridge_command_selects_rust_and_preserves_start_gate() {
        let root = Path::new("checkout");
        let home = Path::new("scratch-home");
        let profile = Path::new("scratch-profile");
        let node = Path::new("node");
        let command = bridge_command(node, root, home, profile, false);
        assert_eq!(command.get_program(), node);
        let entry = root.join("apps/desktop-rust/start-bridge.mjs");
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            [
                entry.as_os_str(),
                "--wait-for-host".as_ref(),
                "--root".as_ref(),
                root.as_os_str(),
                "--profile".as_ref(),
                profile.as_os_str()
            ]
        );
        assert!(!command.get_envs().any(|(key, _)| key == "PI_OFFLINE"));
        assert!(bridge_command(node, root, home, profile, true).get_envs().any(|(key,value)| key == "PI_OFFLINE" && value == Some(std::ffi::OsStr::new("1"))));
        let env = command
            .get_envs()
            .collect::<std::collections::HashMap<_, _>>();
        for (key, value) in [
            ("SUFFICE_SESSION_BACKEND", Path::new("rust")),
            ("SUFFICE_HOME", home),
        ] {
            assert_eq!(
                env.get(std::ffi::OsStr::new(key)),
                Some(&Some(value.as_os_str()))
            );
        }
    }
}
