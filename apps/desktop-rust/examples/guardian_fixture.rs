//! Headless driver for forced-parent-death integration tests.
#[cfg(target_os = "macos")]
#[path = "../src/process_macos.rs"]
mod guardian;
#[cfg(target_os = "macos")]
fn main() -> std::io::Result<()> {
    use std::{
        env,
        io::{self, Read},
        path::PathBuf,
        process::Command,
        sync::mpsc,
        thread,
    };
    if guardian::helper_mode()? {
        return Ok(());
    }
    let mut args = env::args_os().skip(1);
    let root = PathBuf::from(args.next().unwrap());
    let mut command = Command::new(args.next().unwrap());
    command.args(args);
    let (mut bridge, mut tree) = guardian::spawn_macos(command, &root)?;
    let (tx, rx) = mpsc::channel();
    let done = tx.clone();
    tree.monitor(&bridge, move || {
        let _ = done.send(());
    })?;
    tree.resume(&bridge)?;
    println!("{}", bridge.id());
    thread::spawn(move || {
        let _ = io::stdin().read(&mut [0]);
        let _ = tx.send(());
    });
    let _ = rx.recv();
    tree.close();
    let _ = bridge.wait();
    Ok(())
}
#[cfg(not(target_os = "macos"))]
fn main() {}
