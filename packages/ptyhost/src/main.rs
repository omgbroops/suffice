mod client;
mod host;
mod proto;
mod sys;

use std::path::PathBuf;

const USAGE: &str = "usage: sfx-host <serve|new|list|stats|attach|stream|send|resize|kill|shutdown> --dir <state-dir> [...]
  new --dir D --cwd P [--cols N --rows N] -- cmd [args...]
  attach|stream|send|kill --dir D <id>      resize --dir D <id> <cols> <rows>";

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(sub) = args.first().cloned() else { return Err(USAGE.into()) };
    let (mut dir, mut cwd, mut cols, mut rows) = (None, ".".to_string(), 80u16, 24u16);
    let (mut pos, mut cmd) = (vec![], vec![]);
    let mut it = args[1..].iter();
    while let Some(a) = it.next() {
        let mut val = |n: &str| it.next().cloned().ok_or(format!("{n} needs a value"));
        match a.as_str() {
            "--dir" => dir = Some(PathBuf::from(val("--dir")?)),
            "--cwd" => cwd = val("--cwd")?,
            "--cols" => cols = val("--cols")?.parse().map_err(|_| "bad --cols")?,
            "--rows" => rows = val("--rows")?.parse().map_err(|_| "bad --rows")?,
            "--" => {
                cmd = it.by_ref().cloned().collect();
                break;
            }
            _ => pos.push(a.clone()),
        }
    }
    let dir = dir.ok_or("--dir is required")?;
    let id = || pos.first().map(String::as_str).ok_or(format!("{sub}: session id required"));
    match sub.as_str() {
        "serve" => host::serve(&dir),
        "new" if cmd.is_empty() => Err("new: command required after --".into()),
        "new" => client::new(&dir, &cwd, cols, rows, &cmd),
        "list" => client::list(&dir),
        "stats" => client::stats(&dir),
        "attach" => client::attach(&dir, id()?),
        "stream" => client::stream(&dir, id()?),
        "send" => client::send(&dir, id()?),
        "resize" => {
            let n = |i: usize| pos.get(i).and_then(|x| x.parse::<u16>().ok()).ok_or("resize: <id> <cols> <rows>");
            client::resize(&dir, id()?, n(1)?, n(2)?)
        }
        "kill" => client::simple(&dir, proto::KILL, Some(id()?)),
        "shutdown" => client::simple(&dir, proto::SHUTDOWN, None),
        _ => Err(USAGE.into()),
    }
}

fn main() {
    if let Err(e) = run() {
        eprintln!("sfx-host: {e}");
        std::process::exit(1);
    }
}
