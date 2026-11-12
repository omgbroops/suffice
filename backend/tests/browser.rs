use suffice::browser::{accept_key, base64_decode, base64_encode, encode_frame, read_frame, Browser};
use suffice::json::Value;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

const CHROME: &str = "/Users/abhayg/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

unsafe extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

fn page(name: &str, html: &str) -> (PathBuf, String) {
    let dir = std::env::temp_dir().join(format!("suffice-browser-test-{}-{name}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("index.html");
    fs::write(&path, html).unwrap();
    (dir, format!("file://{}", path.display()))
}

fn launch_on(html: &str, name: &str) -> (Browser, PathBuf) {
    let (dir, url) = page(name, html);
    let mut b = Browser::launch(Path::new(CHROME)).expect("launch");
    b.navigate(&url).expect("navigate");
    (b, dir)
}

#[test]
fn navigate_and_evaluate_title() {
    let (mut b, dir) = launch_on("<title>Hello Suffice</title><p>hi</p>", "title");
    assert_eq!(b.evaluate("document.title").unwrap(), Value::str("Hello Suffice"));
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn type_then_read_value() {
    let (mut b, dir) = launch_on("<input id=q>", "type");
    b.type_text("#q", "hi there").unwrap();
    assert_eq!(b.evaluate("document.querySelector('#q').value").unwrap(), Value::str("hi there"));
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn click_changes_text() {
    let html = "<button id=go onclick=\"this.textContent='Clicked'\">Change</button>";
    let (mut b, dir) = launch_on(html, "click");
    b.click("#go").unwrap();
    assert_eq!(b.text("#go").unwrap(), "Clicked");
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn click_buy_now_is_held() {
    let html = "<button id=buy onclick=\"window.n=(window.n||0)+1\">Buy now</button>";
    let (mut b, dir) = launch_on(html, "buy");
    let err = b.click("#buy").unwrap_err();
    assert!(err.starts_with("held:"), "got {err}");
    assert_eq!(b.evaluate("window.n||0").unwrap(), Value::num(0.0));
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn screenshot_is_png() {
    let (mut b, dir) = launch_on("<p>shot</p>", "shot");
    let png = b.screenshot_png().unwrap();
    assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn drop_kills_process_and_removes_profile() {
    let (b, dir) = launch_on("<p>bye</p>", "drop");
    let pid = b.pid() as i32;
    let profile = b.profile_dir().to_path_buf();
    assert!(profile.exists());
    drop(b);
    assert!(unsafe { kill(pid, 0) } != 0, "process still alive");
    assert!(!profile.exists(), "profile dir left behind");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn base64_decodes_padding_forms() {
    assert_eq!(base64_decode("aGVsbG8=").unwrap(), b"hello");
    assert_eq!(base64_decode("aGk=").unwrap(), b"hi");
    assert_eq!(base64_decode("aGVs").unwrap(), b"hel");
    assert!(base64_decode("a!b").is_err());
    assert_eq!(base64_decode(&base64_encode(&[0u8, 255, 16, 7])).unwrap(), vec![0u8, 255, 16, 7]);
}

#[test]
fn accept_key_matches_rfc_example() {
    assert_eq!(accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
}

#[test]
fn client_frames_are_masked() {
    let mask = [1u8, 2, 3, 4];
    let f = encode_frame(0x1, b"abcdef", mask);
    assert_eq!(f[0], 0x81);
    assert_eq!(f[1], 0x80 | 6);
    assert_eq!(&f[2..6], &mask);
    let unmasked: Vec<u8> = f[6..].iter().enumerate().map(|(i, b)| b ^ mask[i % 4]).collect();
    assert_eq!(unmasked, b"abcdef");
}

#[test]
fn server_frames_decode_all_length_forms() {
    for len in [5usize, 300, 70_000] {
        let mut f = vec![0x81];
        if len < 126 {
            f.push(len as u8);
        } else if len <= 0xFFFF {
            f.push(126);
            f.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            f.push(127);
            f.extend_from_slice(&(len as u64).to_be_bytes());
        }
        f.extend(std::iter::repeat_n(b'x', len));
        let fr = read_frame(&mut Cursor::new(f)).unwrap();
        assert!(fr.fin);
        assert_eq!(fr.op, 0x1);
        assert_eq!(fr.payload.len(), len);
    }
}

#[test]
fn masked_server_frame_is_refused() {
    let f = encode_frame(0x1, b"x", [9, 9, 9, 9]);
    assert!(read_frame(&mut Cursor::new(f)).is_err());
}
