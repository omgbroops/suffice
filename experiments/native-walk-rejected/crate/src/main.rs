use std::ffi::OsStr;
use std::fs;
use std::io::{self, Write};
use std::path::Path;

fn walk(root: &Path, prefix: &str, paths: &mut Vec<String>) -> io::Result<()> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().into_string().map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "non-UTF-8 directory entry"))?;
        if name.starts_with('.') || name == "node_modules" { continue; }
        entries.push((name, entry));
    }
    entries.sort_by(|a,b| a.0.as_bytes().cmp(b.0.as_bytes()));
    for (name, entry) in entries {
        let kind = entry.file_type()?;
        if kind.is_symlink() { continue; }
        let relative = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if kind.is_dir() { walk(&entry.path(), &relative, paths)?; }
        else if kind.is_file() { paths.push(relative); }
    }
    Ok(())
}
fn run() -> Result<(),Box<dyn std::error::Error>> {
    let mut args=std::env::args_os().skip(1);
    if args.next().as_deref()!=Some(OsStr::new("--protocol=1")) { return Err("expected --protocol=1".into()); }
    let root=args.next().ok_or("expected directory")?;
    if args.next().is_some() { return Err("unexpected argument".into()); }
    let mut paths=Vec::new();walk(Path::new(&root),"",&mut paths)?;
    let mut out=io::BufWriter::new(io::stdout().lock());serde_json::to_writer(&mut out,&paths)?;out.flush()?;Ok(())
}
fn main() { if let Err(error)=run() { eprintln!("{error}");std::process::exit(1); } }
