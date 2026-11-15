use std::fs;
use std::io;
use std::path::{Path, PathBuf};

struct Entry {
    path: PathBuf,
    relative: String,
    directory: bool,
}

fn entries(root: &Path, prefix: &str) -> io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for item in fs::read_dir(root)? {
        let item = item?;
        let name = item
            .file_name()
            .into_string()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "non-UTF-8 directory entry"))?;
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let kind = item.file_type()?;
        if !kind.is_dir() && !kind.is_file() {
            continue;
        }
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        entries.push(Entry {
            path: item.path(),
            relative,
            directory: kind.is_dir(),
        });
    }
    entries.sort_by(|a, b| a.relative.as_bytes().cmp(b.relative.as_bytes()));
    Ok(entries)
}

fn descend(initial: Vec<Entry>) -> io::Result<Vec<String>> {
    let mut stack: Vec<Entry> = initial.into_iter().rev().collect();
    let mut paths = Vec::new();
    while let Some(item) = stack.pop() {
        if item.directory {
            stack.extend(entries(&item.path, &item.relative)?.into_iter().rev());
        } else {
            paths.push(item.relative);
        }
    }
    Ok(paths)
}

pub fn walk(root: &Path, prefix: &str, paths: &mut Vec<String>) -> io::Result<()> {
    let root_entries = entries(root, prefix)?;
    if root_entries.iter().filter(|e| e.directory).count() < 16 {
        paths.extend(descend(root_entries)?);
    } else {
        // Four scoped workers at most; contiguous chunks preserve root order.
        let chunk_size = root_entries.len().div_ceil(4);
        let mut iterator = root_entries.into_iter();
        let parts = std::thread::scope(|scope| {
            let mut workers = Vec::new();
            loop {
                let chunk: Vec<_> = iterator.by_ref().take(chunk_size).collect();
                if chunk.is_empty() {
                    break;
                }
                workers
                    .push(std::thread::Builder::new().spawn_scoped(scope, move || descend(chunk))?);
            }
            workers
                .into_iter()
                .map(|worker| {
                    worker
                        .join()
                        .map_err(|_| io::Error::other("traversal worker panicked"))?
                })
                .collect::<io::Result<Vec<_>>>()
        })?;
        for part in parts {
            paths.extend(part);
        }
    }
    Ok(())
}
