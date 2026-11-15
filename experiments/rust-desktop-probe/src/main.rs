fn transcript(index: usize) -> String {
    (0..1000)
        .map(|n| format!("Thread {index:02} message {n} deterministic fixture"))
        .collect::<Vec<_>>()
        .join("\r\n")
}
fn main() {
    let arg = std::env::args().nth(1);
    if arg.as_deref() == Some("--self-test") {
        let text = transcript(29);
        assert_eq!(text.matches(" message ").count(), 1000);
        assert!(text.contains("Thread 29 message 999 deterministic fixture"));
        assert_eq!(
            String::from_utf16(&text.encode_utf16().collect::<Vec<_>>()).unwrap(),
            text
        );
        let unicode = "A 🦀 Ω";
        assert_eq!(
            String::from_utf16(&unicode.encode_utf16().collect::<Vec<_>>()).unwrap(),
            unicode
        );
        println!("{{\"self_test\":\"passed\",\"messages\":1000,\"sessions\":30}}");
        return;
    }
    #[cfg(windows)]
    {
        if let Err(e) = win::run(arg.as_deref() == Some("--probe")) {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("Unsupported: this native UI probe requires Windows");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn fixture() {
        let x = super::transcript(3);
        assert_eq!(x.matches(" message ").count(), 1000);
        assert!(x.contains("Thread 03 message 999 deterministic fixture"));
        assert_eq!(
            String::from_utf16(&x.encode_utf16().collect::<Vec<_>>()).unwrap(),
            x
        );
    }
}

#[cfg(windows)]
mod win {
    use std::{
        ffi::c_void,
        ptr::{null, null_mut},
        time::Instant,
    };
    use windows_sys::Win32::{
        Foundation::*,
        Graphics::Gdi::*,
        System::LibraryLoader::GetModuleHandleW,
        UI::{Input::KeyboardAndMouse::VK_DOWN, WindowsAndMessaging::*},
    };
    struct State {
        list: HWND,
        edit: HWND,
        started: Instant,
        probe: bool,
        painted: bool,
        failed: bool,
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    unsafe fn select(state: &State) {
        let selected = SendMessageW(state.list, LB_GETCURSEL, 0, 0);
        if selected >= 0 {
            let text = wide(&super::transcript(selected as usize));
            SendMessageW(state.edit, WM_SETTEXT, 0, text.as_ptr() as isize);
        }
    }
    // SAFETY: Windows calls this on the UI thread. State is boxed in run and remains alive
    // through the message loop; GWLP_USERDATA holds only its stable pointer. Handles are
    // created as children and messages use pointers valid for their synchronous duration.
    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: usize, l: isize) -> isize {
        if msg == WM_NCCREATE {
            let cs = &*(l as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, cs.lpCreateParams as isize);
        }
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut State;
        if ptr.is_null() {
            return DefWindowProcW(hwnd, msg, w, l);
        }

        match msg {
            WM_SIZE => {
                if !(*ptr).list.is_null() {
                    let mut r = RECT::default();
                    GetClientRect(hwnd, &mut r);
                    let width = r.right - r.left;
                    let height = r.bottom - r.top;
                    MoveWindow((*ptr).list, 0, 0, 200, height, 1);
                    MoveWindow((*ptr).edit, 200, 0, (width - 200).max(0), height, 1);
                }
                0
            }
            WM_COMMAND => {
                if (w & 0xffff) == 100 && ((w >> 16) & 0xffff) == LBN_SELCHANGE as usize {
                    select(&*ptr);
                }
                0
            }
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                BeginPaint(hwnd, &mut ps);
                EndPaint(hwnd, &ps);
                if !(*ptr).painted {
                    (*ptr).painted = true;
                    UpdateWindow((*ptr).list);
                    UpdateWindow((*ptr).edit);
                    if (*ptr).probe {
                        println!(
                            "{}",
                            serde_json::json!({"event":"ready","elapsed_ms":(*ptr).started.elapsed().as_secs_f64()*1000.0})
                        );
                        SetTimer(hwnd, 1, 200, None);
                    }
                }
                0
            }
            WM_TIMER if w == 1 => {
                // Exercise the listbox keyboard handler, then notify the parent as a user selection does.
                SendMessageW((*ptr).list, LB_SETCURSEL, 0, 0);
                SendMessageW((*ptr).list, WM_KEYDOWN, VK_DOWN as usize, 0);
                SendMessageW(
                    hwnd,
                    WM_COMMAND,
                    100 | ((LBN_SELCHANGE as usize) << 16),
                    (*ptr).list as isize,
                );
                let chosen = SendMessageW((*ptr).list, LB_GETCURSEL, 0, 0);
                let len = GetWindowTextLengthW((*ptr).edit);
                let mut buf = vec![0u16; len as usize + 1];
                let n = GetWindowTextW((*ptr).edit, buf.as_mut_ptr(), buf.len() as i32);
                let actual = String::from_utf16_lossy(&buf[..n as usize]);
                let expected = super::transcript(1);
                let first_ok = chosen == 1 && actual == expected;
                SendMessageW((*ptr).list, LB_SETCURSEL, 29, 0);
                SendMessageW(
                    hwnd,
                    WM_COMMAND,
                    100 | ((LBN_SELCHANGE as usize) << 16),
                    (*ptr).list as isize,
                );
                let len29 = GetWindowTextLengthW((*ptr).edit);
                let mut buf29 = vec![0u16; len29 as usize + 1];
                let n29 = GetWindowTextW((*ptr).edit, buf29.as_mut_ptr(), buf29.len() as i32);
                let actual29 = String::from_utf16_lossy(&buf29[..n29 as usize]);
                let ok = first_ok && actual29 == super::transcript(29);
                (*ptr).failed = !ok;
                SendMessageW((*ptr).edit, WM_VSCROLL, 7, 0);
                let scroll_line = SendMessageW((*ptr).edit, 0x00CE, 0, 0);
                let mut before = RECT::default();
                GetClientRect((*ptr).edit, &mut before);
                SetWindowPos(hwnd, null_mut(), 0, 0, 1000, 700, SWP_NOMOVE | SWP_NOZORDER);
                let mut after = RECT::default();
                GetClientRect((*ptr).edit, &mut after);
                let resized = after.right != before.right || after.bottom != before.bottom;
                (*ptr).failed |= !resized;
                println!(
                    "{}",
                    serde_json::json!({"event":"selection","elapsed_ms":(*ptr).started.elapsed().as_secs_f64()*1000.0,"selected":[chosen,29],"text_matches":ok,"resize_verified":resized,"scroll_first_visible_line":scroll_line,"messages":actual29.matches(" message ").count()})
                );
                KillTimer(hwnd, 1);
                SetTimer(hwnd, 2, 6000, None);
                0
            }
            WM_TIMER if w == 2 => {
                KillTimer(hwnd, 2);
                DestroyWindow(hwnd);
                0
            }
            WM_DESTROY => {
                if (*ptr).probe {
                    println!(
                        "{}",
                        serde_json::json!({"event":"shutdown","elapsed_ms":(*ptr).started.elapsed().as_secs_f64()*1000.0,"ok":!(*ptr).failed})
                    );
                }
                PostQuitMessage(if (*ptr).failed { 1 } else { 0 });
                0
            }
            _ => DefWindowProcW(hwnd, msg, w, l),
        }
    }
    pub fn run(probe: bool) -> Result<(), String> {
        // SAFETY: all Win32 handles and callbacks belong to this thread; strings are NUL
        // terminated and live for each call. Boxed state outlives all dispatched messages.
        unsafe {
            let started = Instant::now();
            let instance = GetModuleHandleW(null());
            let class = wide("SufficeRustProbe");
            let title = wide("Suffice Rust architecture probe");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc),
                hInstance: instance,
                lpszClassName: class.as_ptr(),
                hbrBackground: (COLOR_WINDOW + 1) as HBRUSH,
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                return Err("RegisterClassW failed".into());
            }
            let mut state = Box::new(State {
                list: null_mut(),
                edit: null_mut(),
                started,
                probe,
                painted: false,
                failed: false,
            });
            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                title.as_ptr(),
                WS_OVERLAPPEDWINDOW,
                100,
                100,
                900,
                600,
                null_mut(),
                null_mut(),
                instance,
                (&mut *state as *mut State).cast::<c_void>(),
            );
            if hwnd.is_null() {
                return Err("CreateWindowExW failed".into());
            }
            state.list = CreateWindowExW(
                0,
                wide("LISTBOX").as_ptr(),
                null(),
                WS_CHILD | WS_VISIBLE | WS_VSCROLL | LBS_NOTIFY as u32,
                0,
                0,
                200,
                500,
                hwnd,
                100 as HMENU,
                instance,
                null(),
            );
            state.edit = CreateWindowExW(
                0,
                wide("EDIT").as_ptr(),
                null(),
                WS_CHILD
                    | WS_VISIBLE
                    | WS_VSCROLL
                    | WS_HSCROLL
                    | ES_MULTILINE as u32
                    | ES_READONLY as u32
                    | ES_AUTOVSCROLL as u32,
                200,
                0,
                700,
                500,
                hwnd,
                101 as HMENU,
                instance,
                null(),
            );
            if state.list.is_null() || state.edit.is_null() {
                DestroyWindow(hwnd);
                return Err("Control creation failed".into());
            }
            SendMessageW(state.edit, 0x00C5, 1_000_000, 0);
            for i in 0..30 {
                let s = wide(&format!("Thread {i:02}"));
                SendMessageW(state.list, LB_ADDSTRING, 0, s.as_ptr() as isize);
            }
            SendMessageW(state.list, LB_SETCURSEL, 0, 0);
            select(&state);
            ShowWindow(hwnd, SW_SHOW);
            UpdateWindow(hwnd);
            let mut msg = MSG::default();
            loop {
                let result = GetMessageW(&mut msg, null_mut(), 0, 0);
                if result == -1 {
                    return Err("GetMessageW failed".into());
                }
                if result == 0 {
                    if msg.wParam != 0 {
                        return Err("Probe verification failed".into());
                    }
                    break;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            Ok(())
        }
    }
}
