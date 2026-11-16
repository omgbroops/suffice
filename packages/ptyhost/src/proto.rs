//! Wire protocol of the sfx-host socket (`<dir>/host.sock`, Unix stream).
//!
//! Every message is one frame:  [type: 1 byte][len: 4 bytes big-endian][payload: len bytes]
//! Max payload 16 MiB. All integers in payloads are big-endian.
//!
//! Client -> host
//!   0x01 NEW      cols u16, rows u16, then NUL-separated strings: cwd, argv0, argv1, ...
//!                 reply: OK(session id as decimal text), then host closes.
//!   0x02 LIST     reply: OK(text, one line per session, tab separated:
//!                 id pid cols rows alive exit cwd command), then host closes.
//!   0x03 OPEN     id u32, flags u8 (1 = receive output, ring replay first; 2 = may write).
//!                 attach = 3, stream = 1, send/resize = 2. Failure: ERR, then host closes.
//!   0x05 INPUT    raw bytes written to the pty (connection must be opened with flag 2).
//!   0x0A WINSZ    cols u16, rows u16 (connection must be opened with flag 2).
//!   0x07 KILL     id u32. SIGKILL to the session's process group; the session is removed
//!                 once the child is reaped (or at once if it already exited). Reply OK.
//!   0x09 SHUTDOWN kill all sessions, remove the socket, exit. Reply OK.
//!   0x0B STATS    debug counters as `key=value` lines. Reply OK.
//! Host -> client
//!   0x80 OK       text payload
//!   0x81 ERR      text payload
//!   0x82 OUTPUT   raw pty output bytes (ring replay first, then live)
//!   0x83 EXIT     exit code i32 (128+signal if killed); sent once, then host closes
//!   0x84 ACK      reply to a writer (OPEN flag 2) that half-closed: every INPUT byte it sent
//!                 has been written into the pty. If the session ended first, ERR is sent instead.
//! Flow control: the host stops reading a writer while its session's input queue is full
//! (4 MiB), so a client's blocking write stalls instead of bytes being dropped.
//! A client whose outgoing queue passes 8 MiB (it is not reading) is dropped; a stream or
//! attach client can reconnect and gets the 256 KiB ring replay again.

use std::io::{self, Read, Write};

pub const NEW: u8 = 1;
pub const LIST: u8 = 2;
pub const OPEN: u8 = 3;
pub const INPUT: u8 = 5;
pub const KILL: u8 = 7;
pub const SHUTDOWN: u8 = 9;
pub const STATS: u8 = 11;
pub const WINSZ: u8 = 10;
pub const OK: u8 = 0x80;
pub const ERR: u8 = 0x81;
pub const OUTPUT: u8 = 0x82;
pub const EXIT: u8 = 0x83;
pub const ACK: u8 = 0x84;
pub const MAX_PAYLOAD: usize = 16 << 20;

pub fn encode(t: u8, payload: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(5 + payload.len());
    v.push(t);
    v.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    v.extend_from_slice(payload);
    v
}

/// Parse one frame from the front of `buf`: (type, payload, bytes consumed).
/// Ok(None) = incomplete; Err = oversize frame.
pub fn parse(buf: &[u8]) -> Result<Option<(u8, Vec<u8>, usize)>, ()> {
    if buf.len() < 5 {
        return Ok(None);
    }
    let len = u32::from_be_bytes([buf[1], buf[2], buf[3], buf[4]]) as usize;
    if len > MAX_PAYLOAD {
        return Err(());
    }
    if buf.len() < 5 + len {
        return Ok(None);
    }
    Ok(Some((buf[0], buf[5..5 + len].to_vec(), 5 + len)))
}

pub fn write_frame<W: Write>(w: &mut W, t: u8, payload: &[u8]) -> io::Result<()> {
    w.write_all(&encode(t, payload))
}

/// Blocking read of one frame; Ok(None) on clean EOF.
pub fn read_frame<R: Read>(r: &mut R) -> io::Result<Option<(u8, Vec<u8>)>> {
    let mut h = [0u8; 5];
    match r.read_exact(&mut h) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_be_bytes([h[1], h[2], h[3], h[4]]) as usize;
    if len > MAX_PAYLOAD {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "oversize frame"));
    }
    let mut p = vec![0u8; len];
    r.read_exact(&mut p)?;
    Ok(Some((h[0], p)))
}
