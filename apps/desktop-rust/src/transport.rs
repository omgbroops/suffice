//! Bounded queue keeps pipe backpressure off the window/event-loop thread.
use serde_json::Value;
use std::{
    io::{self, Write},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
        mpsc::{SyncSender, sync_channel},
    },
};
const MAX_BYTES: usize = 64 * 1024 * 1024;
// Validate ordering and bounds on the ASCII envelope only. The opaque data
// may contain JSON strings that cannot be represented by a Rust String.
#[derive(Default)]
pub struct FragmentStream {
    transfer: u64,
    total: u64,
    received: u64,
    discard: bool,
}
impl FragmentStream {
    pub fn reset_document(&mut self) {
        self.discard = self.received < self.total;
    }
    pub fn accept(&mut self, frame: &Value) -> io::Result<bool> {
        let invalid = || io::Error::other("invalid renderer fragment");
        let number = |key: &str| frame[key].as_u64().ok_or_else(invalid);
        let id = number("transfer")?;
        let offset = number("offset")?;
        let total = number("total")?;
        let data = frame["data"].as_str().ok_or_else(invalid)?.as_bytes();
        if data.is_empty()
            || data.len() > 1024 * 1024
            || data.len() % 4 != 0
            || total == 0
            || total > 512 * 1024 * 1024
        {
            return Err(invalid());
        }
        let padding = data.iter().rev().take_while(|c| **c == b'=').count();
        if padding > 2
            || !data[..data.len() - padding]
                .iter()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'+' | b'/'))
        {
            return Err(invalid());
        }
        let len = (data.len() / 4 * 3 - padding) as u64;
        if offset == 0 {
            if id != self.transfer + 1 || self.received != self.total {
                return Err(invalid());
            }
            self.transfer = id;
            self.received = 0;
            self.total = total;
            self.discard = false;
        }
        if id != self.transfer
            || self.total != total
            || offset != self.received
            || len > total - self.received
        {
            return Err(invalid());
        }
        self.received += len;
        Ok(!self.discard)
    }
}
#[derive(Debug, Default)]
struct Usage {
    bytes: AtomicUsize,
    count: AtomicUsize,
}
#[derive(Clone, Debug, Default)]
pub struct Budget(Arc<Usage>);
#[derive(Debug)]
pub struct Permit {
    usage: Arc<Usage>,
    bytes: usize,
}
impl Budget {
    pub fn reserve(&self, bytes: usize) -> io::Result<Permit> {
        self.0
            .count
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < 32).then_some(n + 1)
            })
            .map_err(|_| io::Error::other("renderer frame count limit reached"))?;
        if self
            .0
            .bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                n.checked_add(bytes).filter(|n| *n <= MAX_BYTES)
            })
            .is_err()
        {
            self.0.count.fetch_sub(1, Ordering::AcqRel);
            return Err(io::Error::other("renderer byte limit reached"));
        }
        Ok(Permit {
            usage: self.0.clone(),
            bytes,
        })
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        self.usage.bytes.fetch_sub(self.bytes, Ordering::AcqRel);
        self.usage.count.fetch_sub(1, Ordering::AcqRel);
    }
}
pub fn read_frame(reader: &mut impl io::BufRead) -> io::Result<Option<String>> {
    read_frame_limit(reader, MAX_BYTES)
}
fn read_frame_limit(reader: &mut impl io::BufRead, limit: usize) -> io::Result<Option<String>> {
    let mut frame = Vec::new();
    loop {
        let bytes = reader.fill_buf()?;
        if bytes.is_empty() {
            return if frame.is_empty() {
                Ok(None)
            } else {
                Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "incomplete bridge frame",
                ))
            };
        }
        let newline = bytes.iter().position(|b| *b == b'\n');
        let count = newline.map_or(bytes.len(), |n| n + 1);
        if frame.len().saturating_add(count) > limit {
            return Err(io::Error::other("bridge frame limit reached"));
        }
        frame.extend_from_slice(&bytes[..count]);
        reader.consume(count);
        if newline.is_some() {
            return String::from_utf8(frame).map(Some).map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, "bridge frame is not UTF-8")
            });
        }
    }
}
#[derive(Clone)]
pub struct Sender {
    queue: SyncSender<Vec<u8>>,
    bytes: Arc<AtomicUsize>,
}
impl Sender {
    pub fn new(mut writer: impl Write + Send + 'static) -> Self {
        let (queue, receiver) = sync_channel::<Vec<u8>>(32);
        let bytes = Arc::new(AtomicUsize::new(0));
        let used = bytes.clone();
        std::thread::spawn(move || {
            for frame in receiver {
                let result = writer.write_all(&frame).and_then(|_| writer.flush());
                used.fetch_sub(frame.len(), Ordering::AcqRel);
                if result.is_err() {
                    break;
                }
            }
        });
        Self { queue, bytes }
    }
    pub fn send(&self, value: &Value) -> io::Result<()> {
        let mut frame = serde_json::to_vec(value)?;
        frame.push(b'\n');
        let size = frame.len();
        self.bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(size).filter(|n| *n <= MAX_BYTES)
            })
            .map_err(|_| io::Error::other("bridge queue byte limit reached"))?;
        if let Err(error) = self.queue.try_send(frame) {
            self.bytes.fetch_sub(size, Ordering::AcqRel);
            return Err(io::Error::other(format!(
                "bridge queue unavailable: {error}"
            )));
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ordered_fragments_are_bounded_and_discarded_after_navigation() {
        let part = |transfer, offset, total, data| serde_json::json!({"transfer":transfer,"offset":offset,"total":total,"data":data});
        let mut s = FragmentStream::default();
        assert!(s.accept(&part(1, 0, 5, "YWJj")).unwrap());
        assert!(s.accept(&part(1, 2, 5, "ZGU=")).is_err());
        s.reset_document();
        assert!(!s.accept(&part(1, 3, 5, "ZGU=")).unwrap());
        assert!(s.accept(&part(2, 0, 1, "YQ==")).unwrap());
        for bad in [
            part(3, 0, 2, "@@@@"),
            part(3, 0, 1, "===="),
            part(3, 0, 536870913, "YQ=="),
            part(4, 0, 1, "YQ=="),
        ] {
            assert!(s.accept(&bad).is_err());
        }
    }
    #[test]
    fn budget_releases_after_consumption() {
        let b = Budget::default();
        assert!(b.reserve(MAX_BYTES + 1).is_err());
        let frames: Vec<_> = (0..32).map(|_| b.reserve(1).unwrap()).collect();
        assert!(b.reserve(1).is_err());
        drop(frames);
        assert!(b.reserve(MAX_BYTES).is_ok());
    }
    #[test]
    fn frames_are_bounded_complete_and_utf8() {
        let mut input = io::Cursor::new(b"{}\n[]\n");
        assert_eq!(read_frame_limit(&mut input, 8).unwrap().unwrap(), "{}\n");
        assert_eq!(read_frame_limit(&mut input, 8).unwrap().unwrap(), "[]\n");
        assert!(read_frame_limit(&mut input, 8).unwrap().is_none());
        assert!(read_frame_limit(&mut io::Cursor::new(b"123456789\n"), 8).is_err());
        assert!(read_frame_limit(&mut io::Cursor::new(b"{}"), 8).is_err());
        assert!(read_frame_limit(&mut io::Cursor::new([255, 10]), 8).is_err());
    }
    struct Blocked(std::sync::mpsc::Receiver<()>);
    impl Write for Blocked {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            let _ = self.0.recv();
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    #[test]
    fn blocked_pipe_never_blocks_sender() {
        let (release, wait) = std::sync::mpsc::channel();
        let sender = Sender::new(Blocked(wait));
        let start = std::time::Instant::now();
        let mut rejected = false;
        for n in 0..100 {
            if sender.send(&serde_json::json!({"n":n})).is_err() {
                rejected = true;
                break;
            }
        }
        assert!(rejected);
        assert!(start.elapsed() < std::time::Duration::from_secs(1));
        drop(release);
    }
}
