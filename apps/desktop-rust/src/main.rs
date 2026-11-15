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
    MeasureSelect,
    Engine(String, std::sync::mpsc::SyncSender<()>),
    EngineClosed,
    Tick,
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
fn main() -> Result<(), Box<dyn std::error::Error>> {
    if !cfg!(windows) {
        return Err("experimental host requires implemented Windows process containment".into());
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
    let node = argument("--node")?;
    let smoke = std::env::args().any(|x| x == "--smoke");
    let smoke_pause = smoke && std::env::args().any(|x| x == "--smoke-pause");
    let assets = root.join("apps/desktop/dist").canonicalize()?;
    let preload = std::fs::read_to_string(root.join("apps/desktop/electron/preload.cjs"))?;
    let started = Instant::now();
    let event_loop = EventLoopBuilder::<Message>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let mut command = Command::new(node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000004);
    }
    let mut child = command
        .arg(root.join("apps/desktop-bridge/main.mjs"))
        .arg("--wait-for-host")
        .arg("--root")
        .arg(&root)
        .arg("--profile")
        .arg(&profile)
        .env("SUFFICE_HOME", &home)
        .env("PI_OFFLINE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
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
    input.send(&json!({"type":"host-start"}))?;
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
                        || wait.recv().is_err()
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
    let window = WindowBuilder::new()
        .with_title("Suffice — experimental Rust host")
        .with_inner_size(tao::dpi::LogicalSize::new(1440., 900.))
        .with_decorations(false)
        .build(&event_loop)?;
    let mut context = wry::WebContext::new(Some(profile));
    // The original preload runs inside a closure with a narrow lexical Electron shim.
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    let mut shim = format!(
        r#"(()=>{{ if(window.top!==window || location.origin!=='http://suffice.localhost')return;
      let seq=0; const pending=new Map(), listeners=new Map();
      const ipcRenderer={{invoke:(channel,...args)=>new Promise((resolve,reject)=>{{const id=++seq;pending.set(id,{{resolve,reject}});window.ipc.postMessage(JSON.stringify({{type:'invoke',id,channel,args}}));}}),on:(channel,fn)=>{{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);}},removeListener:(channel,fn)=>listeners.get(channel)?.delete(fn)}};
      const contextBridge={{exposeInMainWorld:(name,value)=>Object.defineProperty(window,name,{{value, configurable:false}})}};
      const require=(name)=>{{if(name!=='electron')throw Error('unsupported preload module');return {{contextBridge,ipcRenderer}}}};
      const process={{argv:[],platform:{platform:?}}};
      Object.defineProperty(window,'__sufficeReceive',{{value:(m)=>{{if(m.type==='reply'){{const p=pending.get(m.id);if(p){{pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new Error(String(m.error?.message||m.error||'IPC failed')));}}}}else if(m.type==='event'){{for(const f of listeners.get(m.channel)||[])f({{}},...(m.args||[]));}}}},configurable:false}});
      (()=>{{ {preload} }})();
    }})();"#
    );
    shim.push_str(r#";(()=>{if(window.top!==window || location.origin!=='http://suffice.localhost')return; document.addEventListener('pointerdown',e=>{if(e.button===0 && e.target.closest('.window-drag-region,.panel-drag-region,.sidebar-heading,.thread-header,.right-panel-header') && !e.target.closest('button,input,a,[role=tab]'))window.ipc.postMessage(JSON.stringify({type:'drag'}));});})();"#);
    if smoke {
        shim.push_str(&format!(";window.__sufficeMeasurePause={smoke_pause};"));
        shim.push_str(r#";(()=>{if(window.top!==window || location.origin!=='http://suffice.localhost')return;
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
    if smoke_pause {
        let commands = event_loop.create_proxy();
        std::thread::spawn(move || {
            let mut stdin = BufReader::new(std::io::stdin());
            while let Ok(Some(line)) = transport::read_frame(&mut stdin) {
                if serde_json::from_str::<Value>(&line)
                    .ok()
                    .is_some_and(|v| v["type"] == "measure-select")
                {
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
    let webview = WebViewBuilder::new_with_web_context(&mut context)
        .with_custom_protocol("suffice".into(), move |_, req| asset(&assets, req))
        .with_initialization_script(shim)
        .with_on_page_load_handler(|_, url| eprintln!("page {url}"))
        .with_navigation_handler(|url| {
            url.starts_with("http://suffice.localhost/") || url == "http://suffice.localhost"
        })
        .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
        .with_ipc_handler(move |req| {
            if req
                .uri()
                .to_string()
                .starts_with("http://suffice.localhost/")
            {
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
        .with_url("suffice://localhost/")
        .build(&window)?;
    let mut deadline = started + Duration::from_secs(if smoke { 25 } else { 86400 });
    let mut engine_ready = false;
    let mut smoke_ok = false;
    event_loop.run(move |event, _, flow| {
        *flow = if smoke { ControlFlow::WaitUntil(deadline) } else { ControlFlow::Wait };
        match event {
            Event::UserEvent(Message::Renderer(line,_permit)) => if let Ok(v) = serde_json::from_str::<Value>(&line) { if v["type"] == "invoke" && v["channel"].as_str().is_some_and(|c| c.starts_with("suffice:")) { if let Err(error)=input.send(&v){let reply=json!({"type":"reply","id":v["id"],"ok":false,"error":error.to_string()});let _=webview.evaluate_script(&format!("window.__sufficeReceive?.({reply})"));} } else if v["type"] == "drag" { let _=window.drag_window(); } else if smoke && v["type"] == "smoke-ready" { println!("{}",json!({"event":"ui-ready","threadCount":v["threadCount"],"width":v["width"],"height":v["height"],"devicePixelRatio":v["devicePixelRatio"],"elapsedMs":started.elapsed().as_millis()})); } else if smoke && v["type"] == "smoke" { smoke_ok=v["ok"]==true; println!("{}",json!({"event":"smoke","ok":smoke_ok,"threadCount":v["threadCount"],"transcriptCharacters":v["transcriptCharacters"],"reason":v["reason"],"elapsedMs":started.elapsed().as_millis()})); deadline=Instant::now()+Duration::from_secs(5); } },
            Event::UserEvent(Message::Engine(line,ack)) => { let mut deferred_ack=false; if let Ok(v) = serde_json::from_str::<Value>(&line) {
                match v["type"].as_str().unwrap_or("") {
                    "ready" => { engine_ready=true; println!("{}", json!({"event":"engine-ready","elapsedMs":started.elapsed().as_millis()})); },
                    "reply"|"event" => { let completed=ack.clone();if webview.evaluate_script_with_callback(&format!("window.__sufficeReceive?.({v})"),move |_|{let _=completed.try_send(());}).is_ok(){deferred_ack=true;} },
                    "native" => { let method=v["method"].as_str().unwrap_or(""); let args=&v["args"]; let result: Result<Value,String> = if method=="window.close" { *flow=ControlFlow::Exit; Ok(Value::Null) } else { native::handle(&window,method,args) };
                        let response=match result { Ok(result)=>json!({"type":"native-reply","id":v["id"],"ok":true,"result":result}), Err(error)=>json!({"type":"native-reply","id":v["id"],"ok":false,"error":error}) }; send(&input,&response);
                    }, _=>{} }
            }
            if !deferred_ack {let _=ack.try_send(());} },
            Event::UserEvent(Message::MeasureSelect) if smoke_pause => {let _=webview.evaluate_script("window.__sufficeMeasureSelect?.()");},
            Event::UserEvent(Message::RendererOverflow) => {eprintln!("Renderer IPC queue limit reached");*flow=ControlFlow::ExitWithCode(1);},
            Event::UserEvent(Message::EngineClosed) => { eprintln!("engine bridge exited"); *flow=ControlFlow::ExitWithCode(1); },
            Event::WindowEvent {event:WindowEvent::CloseRequested,..} => *flow=ControlFlow::Exit,
            Event::WindowEvent {event:WindowEvent::Focused(focused),..} => send(&input,&json!({"type":"window-state","state":{"focused":focused,"minimized":window.is_minimized(),"maximized":window.is_maximized(),"visible":window.is_visible()}})),
            Event::WindowEvent {event:WindowEvent::Resized(_),..} => send(&input,&json!({"type":"window-state","state":{"minimized":window.is_minimized(),"maximized":window.is_maximized(),"visible":window.is_visible()}})),
            Event::UserEvent(Message::Tick) if smoke && Instant::now() >= deadline => { println!("{}",json!({"event":"shutdown","ok":engine_ready && smoke_ok,"engineReady":engine_ready})); *flow=ControlFlow::ExitWithCode(if engine_ready && smoke_ok {0}else{1}); },
            Event::LoopDestroyed => cleanup(&mut child,&input,&mut tree), _=>{}
        }
    });
}
