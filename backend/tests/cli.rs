use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[test]
fn serve_prints_port_and_answers_health_with_token() {
    let dir = std::env::temp_dir().join(format!("suffice-cli-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let mut child = Command::new(env!("CARGO_BIN_EXE_suffice-backend"))
        .args(["serve", "--port", "0", "--dir"])
        .arg(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port: u16 = line
        .split("http://127.0.0.1:")
        .nth(1)
        .and_then(|rest| rest.split_whitespace().next())
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| panic!("no port in banner: {line}"));

    let token_path: PathBuf = dir.join("token");
    let token = fs::read_to_string(&token_path).unwrap().trim().to_string();
    let mode = fs::metadata(&token_path).unwrap().permissions().mode() & 0o777;

    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(s, "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\n\r\n").unwrap();
    let mut resp = String::new();
    let _ = s.read_to_string(&mut resp);

    let _ = child.kill();
    let _ = child.wait();
    let _ = fs::remove_dir_all(&dir);

    assert_eq!(token.len(), 32, "token: {token}");
    assert_eq!(mode, 0o600);
    assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
}
