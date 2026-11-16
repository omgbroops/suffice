#[path = "../apps/desktop-rust/src/browser.rs"] mod browser;
use std::{io::{Read,Write}, net::TcpListener,sync::{Arc,atomic::{AtomicUsize,Ordering}},time::{Duration,Instant}};
use tao::{event::Event,event_loop::{EventLoopBuilder,ControlFlow},window::WindowBuilder};
use wry::{WebViewBuilder,Rect,dpi::{LogicalPosition,LogicalSize}};
use serde_json::{json,Value};
fn main(){
 let listener=TcpListener::bind("127.0.0.1:0").unwrap();let base=format!("http://{}",listener.local_addr().unwrap());
 let proofs=Arc::new(AtomicUsize::new(0));let seen=proofs.clone();
 std::thread::spawn(move||{for conn in listener.incoming(){let mut sock=conn.unwrap();sock.set_read_timeout(Some(Duration::from_secs(2))).unwrap();let mut buf=[0u8;4096];let n=sock.read(&mut buf).unwrap_or(0);let req=String::from_utf8_lossy(&buf[..n]);let p=req.split_whitespace().nth(1).unwrap_or("");
 let html=match p {
 "/one" | "/two" => format!("<!doctype html><title>{p}</title><input id=q><script>document.querySelector('input').value='fixture'; fetch('/proof?ok=' + ([typeof window.require,typeof window.sufficeDesktop,typeof window.ipc,window.top===window,document.querySelector('input').value].join(',')==='undefined,undefined,undefined,true,fixture'))</script>"),
 "/proof?ok=true"=>{seen.fetch_add(1,Ordering::SeqCst);String::from("ok")},_=>String::new()};
 let _=write!(sock,"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: frame-ancestors 'none'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",html.len(),html);}});
 let events=EventLoopBuilder::new().build();let window=WindowBuilder::new().with_inner_size(LogicalSize::new(800,500)).with_title("Suffice isolated WK browser test").build(&events).unwrap();
 let root=WebViewBuilder::new().with_html("<body>Trusted host fixture<script>window.__sufficeReceive=m=>window.lastBrowser=m.args[0]</script>").with_bounds(Rect{position:LogicalPosition::new(0,0).into(),size:LogicalSize::new(800,500).into()}).build_as_child(&window).unwrap();
 let mut surface=browser::Surface::new(std::env::temp_dir().join(format!("suffice-browser-wk-{}",std::process::id())));
 let mut step=0;let start=Instant::now();let mut next_tick=start;let mut last=Value::Null;
 events.run(move|event,_,flow|{
 *flow=ControlFlow::WaitUntil(next_tick);
 if !matches!(event,Event::MainEventsCleared)||Instant::now()<next_tick{return;}
 next_tick=Instant::now()+Duration::from_millis(100); *flow=ControlFlow::WaitUntil(next_tick);
 if start.elapsed()>Duration::from_secs(25){eprintln!("TIMEOUT step={step}, state={last}, guest DOM proofs={}",proofs.load(Ordering::SeqCst));std::process::exit(1);}
 surface.poll(&root);let mut action=|a:&str,data:Value|{let mut p=json!({"token":"smoke","action":a});for(k,v)in data.as_object().unwrap(){p[k]=v.clone();}surface.command(&window,&p).unwrap()};
 if step==0 {action("open",json!({}));action("bounds",json!({"bounds":{"x":240,"y":80,"width":420,"height":320}}));action("navigate",json!({"url":base.clone()+"/one"}));step=1;return;}
 last=action("open",json!({}));
 let ready=|p:&str|last["url"]==base.clone()+p && last["loading"]==false;
 let count=proofs.load(Ordering::SeqCst);
 match step {
 1 if ready("/one")&&count>=1=>{println!("native WK loaded frame-denying page with no guest IPC/preload; title={}",last["title"]);action("navigate",json!({"url":base.clone()+"/two"}));step=2;},
 2 if ready("/two")&&last["canBack"]==true&&count>=2=>{action("back",json!({}));step=3;},
 3 if ready("/one")&&last["canForward"]==true=>{action("forward",json!({}));step=4;},
 4 if ready("/two")=>{action("reload",json!({}));step=5;},
 5 if ready("/two")&&count>=3=>{action("hide",json!({}));action("bounds",json!({"bounds":{"x":210,"y":85,"width":500,"height":350}}));assert!(action("close",json!({})).is_null());assert!(action("hide",json!({})).is_null());println!("PASS real WK browser navigation, history, forward, reload, DOM isolation, resize, hide/show and close. Page receipts={count}");*flow=ControlFlow::Exit;},_=>{}
 }
 });
}
