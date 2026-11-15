use std::ffi::OsStr;
use std::io::{self, Write};
use std::path::Path;
use suffice_fs::walk;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(OsStr::new("--protocol=1")) {
        return Err("expected --protocol=1".into());
    }
    let root = args.next().ok_or("expected directory")?;
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }
    let mut paths = Vec::new();
    walk(Path::new(&root), "", &mut paths)?;
    let mut out = io::BufWriter::new(io::stdout().lock());
    serde_json::to_writer(&mut out, &paths)?;
    out.flush()?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn walk_skips_hidden_and_node_modules_and_reads_nested_files() {
        let root = std::env::temp_dir().join(format!(
            "suffice-fs-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("nested/é.txt"), "ok").unwrap();
        fs::write(root.join(".hidden"), "no").unwrap();
        fs::write(root.join("node_modules/no"), "no").unwrap();
        let mut paths = Vec::new();
        walk(&root, "", &mut paths).unwrap();
        assert_eq!(paths, ["nested/é.txt"]);
        assert!(walk(&root.join("missing"), "", &mut paths).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
