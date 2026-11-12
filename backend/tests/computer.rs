use loom::computer::{run, run_ungated, Action, Button, Desktop, FakeDesktop};

fn click(x: i32, y: i32) -> Action {
    Action::Click { x, y, button: Button::Left }
}

fn key(combo: &str) -> Action {
    Action::Key { combo: combo.into() }
}

// Table-driven CRC32 (independent of the bitwise one in the library).
fn crc_table(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for n in 0..256u32 {
        let mut c = n;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
        }
        table[n as usize] = c;
    }
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c = table[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    !c
}

fn crc_bitwise(data: &[u8]) -> u32 {
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    !c
}

fn be32(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}

#[test]
fn out_of_bounds_rejected_before_anything_performed() {
    let mut d = FakeDesktop::new(100, 50);
    let r = run(&mut d, &[click(1, 1), click(100, 0)], "t");
    assert!(r.is_err());
    assert!(d.performed.is_empty());
    let r = run_ungated(&mut d, &[click(-1, 0)]);
    assert!(r.is_err());
    assert!(d.performed.is_empty());
}

#[test]
fn dangerous_combo_refused_before_anything_runs() {
    for combo in ["cmd+q", "cmd+w", "alt+cmd+esc", "option+cmd+esc", "ctrl+cmd+q", "cmd+shift+q", "cmd+delete"] {
        let mut d = FakeDesktop::new(100, 50);
        let r = run_ungated(&mut d, &[click(1, 1), key(combo)]);
        assert!(r.is_err(), "{combo} should be refused");
        assert!(d.performed.is_empty(), "{combo} ran something");
    }
}

#[test]
fn bad_combo_rejected() {
    let mut d = FakeDesktop::new(100, 50);
    assert!(run_ungated(&mut d, &[key("hyper+s")]).is_err());
    assert!(run_ungated(&mut d, &[key("cmd+")]).is_err());
    assert!(run_ungated(&mut d, &[key("cmd+s+t")]).is_err());
    assert!(d.performed.is_empty());
}

#[test]
fn gate_hold_stops_at_first_action() {
    // gate holds unknown computer_* tool names: fail closed
    let mut d = FakeDesktop::new(100, 50);
    let r = run(&mut d, &[click(1, 1), click(2, 2)], "test");
    let e = r.unwrap_err();
    assert!(e.starts_with("held:"), "{e}");
    assert!(e.contains("0 of 2"), "{e}");
    assert!(d.performed.is_empty());
}

#[test]
fn png_decodes() {
    let mut d = FakeDesktop::new(100, 50);
    let png = d.screenshot_png().unwrap();
    assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);

    // walk chunks, verify each CRC two ways
    let mut pos = 8;
    let mut idat = Vec::new();
    let mut types = Vec::new();
    while pos < png.len() {
        let len = be32(&png[pos..]) as usize;
        let typ = &png[pos + 4..pos + 8];
        let data = &png[pos + 8..pos + 8 + len];
        let crc = be32(&png[pos + 8 + len..]);
        let mut covered = typ.to_vec();
        covered.extend(data);
        assert_eq!(crc, crc_bitwise(&covered));
        assert_eq!(crc, crc_table(&covered));
        if typ == b"IHDR" {
            assert_eq!(be32(&data[0..]), 8, "width");
            assert_eq!(be32(&data[4..]), 8, "height");
            assert_eq!(&data[8..], &[8, 2, 0, 0, 0]);
            // IHDR CRC over (type + data), computed independently
            assert_eq!(crc, crc_table(&covered));
        }
        if typ == b"IEND" {
            assert_eq!(crc, 0xAE42_6082);
        }
        if typ == b"IDAT" {
            idat.extend(data);
        }
        types.push(String::from_utf8_lossy(typ).to_string());
        pos += 12 + len;
    }
    assert_eq!(types, ["IHDR", "IDAT", "IEND"]);

    // zlib: header, stored blocks, adler32 trailer
    assert_eq!(&idat[..2], &[0x78, 0x01]);
    let mut raw: Vec<u8> = Vec::new();
    let mut p = 2;
    loop {
        let fin = idat[p] & 1 == 1;
        let len = u16::from_le_bytes([idat[p + 1], idat[p + 2]]) as usize;
        assert_eq!(u16::from_le_bytes([idat[p + 3], idat[p + 4]]), !(len as u16));
        raw.extend(&idat[p + 5..p + 5 + len]);
        p += 5 + len;
        if fin {
            break;
        }
    }
    assert_eq!(be32(&idat[p..]), {
        let (mut a, mut b) = (1u32, 0u32);
        for &x in &raw {
            a = (a + x as u32) % 65521;
            b = (b + a) % 65521;
        }
        (b << 16) | a
    });
    // 8 rows of (filter byte + 8 RGB pixels)
    assert_eq!(raw.len(), 8 * (1 + 8 * 3));
}

#[test]
fn ungated_sequencing_and_screenshot_changes_after_click() {
    let mut d = FakeDesktop::new(100, 50);
    let r = run_ungated(
        &mut d,
        &[Action::Screenshot, click(5, 5), Action::Screenshot, Action::Type { text: "hi".into() }, Action::Screenshot],
    )
    .unwrap();
    assert_eq!(d.performed.len(), 5);
    assert_eq!(d.performed[1], click(5, 5));
    assert_eq!(r.len(), 5);
    let shots: Vec<&Vec<u8>> = r.iter().filter_map(|x| x.screenshot_png.as_ref()).collect();
    assert_eq!(shots.len(), 3);
    assert_eq!(shots[0], &FakeDesktop::new(100, 50).screenshot_png().unwrap());
    assert_ne!(shots[0], shots[1]);
    assert_eq!(shots[1], shots[2]);
}
