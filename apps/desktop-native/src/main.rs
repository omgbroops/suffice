use eframe::egui::{self, Color32, RichText, ScrollArea};
use egui_commonmark::{CommonMarkCache, CommonMarkViewer};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[derive(Clone)]
struct Session {
    path: PathBuf,
    title: String,
}
#[derive(Default)]
struct State {
    sessions: Vec<Session>,
    store: Option<suffice_session::SessionStore>,
    skipped: Vec<String>,
    search: String,
    highlighted: Option<usize>,
    selected: Option<usize>,
    messages: Vec<Value>,
    usage: Value,
    error: Option<String>,
    follow: bool,
    jump: bool,
}
impl State {
    fn discover(root: &Path) -> Result<Self, String> {
        let store =
            suffice_session::SessionStore::open(root, suffice_session::ReadLimits::default())
                .map_err(|e| format!("Session root: {e}"))?;
        let discovery = store.discover().map_err(|e| e.to_string())?;
        let sessions = discovery
            .sessions
            .into_iter()
            .map(|info| {
                let v = info.summary;
                let title = v["name"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| v["firstMessage"].as_str().unwrap_or("Untitled"));
                Session {
                    path: info.relative_path,
                    title: title.to_owned(),
                }
            })
            .collect();
        Ok(Self {
            sessions,
            store: Some(store),
            skipped: discovery.skipped,
            follow: true,
            ..Default::default()
        })
    }
    fn select(&mut self, index: usize) -> Result<(), String> {
        let session = self
            .sessions
            .get(index)
            .ok_or("Session index out of range")?;
        let store = self.store.as_ref().ok_or("Session store unavailable")?;
        let entries = store.read(&session.path).map_err(|e| e.to_string())?;
        let projected = suffice_session::desktop_messages(&entries, None)?;
        let messages = projected.as_array().cloned().ok_or("Invalid projection")?;
        let usage = suffice_session::saved_usage(&entries, None);
        self.messages = messages;
        self.usage = usage;
        self.selected = Some(index);
        self.highlighted = Some(index);
        self.follow = true;
        self.jump = true;
        self.error = None;
        Ok(())
    }
    fn matching_sessions(&self) -> Vec<usize> {
        let query = self.search.trim().to_lowercase();
        self.sessions
            .iter()
            .enumerate()
            .filter_map(|(index, session)| {
                (query.is_empty() || session.title.to_lowercase().contains(&query)).then_some(index)
            })
            .collect()
    }
    fn navigate_matches(&self, matches: &[usize], forward: bool) -> Option<usize> {
        if matches.is_empty() {
            return None;
        }
        let current = self
            .highlighted
            .or(self.selected)
            .and_then(|selected| matches.iter().position(|index| *index == selected));
        let next = match (current, forward) {
            (Some(current), true) => (current + 1) % matches.len(),
            (Some(0), false) => matches.len() - 1,
            (Some(current), false) => current - 1,
            (None, true) => 0,
            (None, false) => matches.len() - 1,
        };
        matches.get(next).copied()
    }
    fn search_key(&self, key: egui::Key) -> Option<SearchAction> {
        let matches = self.matching_sessions();
        match key {
            egui::Key::ArrowDown => self
                .navigate_matches(&matches, true)
                .map(SearchAction::Highlight),
            egui::Key::ArrowUp => self
                .navigate_matches(&matches, false)
                .map(SearchAction::Highlight),
            egui::Key::Enter => self
                .highlighted
                .filter(|highlighted| matches.contains(highlighted))
                .or(self.selected.filter(|selected| matches.contains(selected)))
                .or_else(|| matches.first().copied())
                .map(SearchAction::Open),
            _ => None,
        }
    }
    fn apply_search_action(&mut self, action: SearchAction) {
        match action {
            SearchAction::Highlight(index) => self.highlighted = Some(index),
            SearchAction::Open(index) => {
                if let Err(error) = self.select(index) {
                    self.error = Some(error);
                }
            }
        }
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SearchAction {
    Highlight(usize),
    Open(usize),
}
fn search_keyboard_selection(
    ui: &egui::Ui,
    search: &egui::Response,
    state: &State,
) -> Option<SearchAction> {
    let key = [egui::Key::ArrowDown, egui::Key::ArrowUp, egui::Key::Enter]
        .into_iter()
        .find(|key| ui.input(|input| input.key_pressed(*key)))?;
    if !(search.has_focus() || key == egui::Key::Enter && search.lost_focus()) {
        return None;
    }
    state.search_key(key)
}
fn blocks(message: &Value) -> Vec<(String, String)> {
    if message["role"] == "status" {
        let label = match message["kind"].as_str() {
            Some("compacted") if message["automatic"] == true => "Automatically compacted",
            Some("compacted") => "Compacted",
            Some("interrupted") => "Interrupted",
            _ => "Status",
        };
        return vec![("status".into(), label.into())];
    }
    let mut result = Vec::new();
    if message["role"] == "user" {
        if let Some(text) = message["displayText"].as_str() {
            result.push(("text".into(), text.into()));
        }
    }
    if result.is_empty() {
        if let Some(content) = message["content"].as_array() {
            for part in content {
                let kind = part["type"].as_str().unwrap_or("unknown");
                match kind {
                    // As in the production saved transcript, reasoning is a
                    // live status rather than a permanent visible entry.
                    "thinking" => {}
                    "text" | "toolCall" => {
                        if let Some(text) = part["text"].as_str() {
                            result.push((kind.into(), text.into()));
                        }
                    }
                    "image" => result.push(("status".into(), "Image attachment".into())),
                    _ => result.push(("status".into(), format!("[{kind}]"))),
                }
            }
        }
    }
    if let Some(attachments) = message["attachments"].as_array() {
        for attachment in attachments {
            let name = attachment["name"].as_str().unwrap_or("Attachment");
            // A name is metadata, but never render a path supplied in its place.
            let name = name.rsplit(['/', '\\']).next().unwrap_or("Attachment");
            let size = attachment["size"]
                .as_f64()
                .filter(|n| n.is_finite() && *n >= 0.0)
                .map(|n| format!("{n} bytes"))
                .unwrap_or_else(|| "size unknown".into());
            let typ = attachment["type"].as_str().unwrap_or("type unknown");
            result.push((
                "status".into(),
                format!("Attachment: {name} · {size} · {typ}"),
            ));
        }
    }
    result
}
fn turn_label(message: &Value) -> String {
    let turn = &message["turn"];
    let mut parts = Vec::new();
    for value in [
        turn["provider"].as_str(),
        turn["modelName"]
            .as_str()
            .or_else(|| turn["model"].as_str()),
        turn["effort"].as_str(),
    ] {
        if let Some(value) = value.filter(|v| !v.is_empty()) {
            parts.push(value.to_owned());
        }
    }
    if let (Some(start), Some(end)) = (turn["startedAt"].as_f64(), turn["endedAt"].as_f64()) {
        if end >= start && (end - start).is_finite() {
            parts.push(format!("{:.1}s", (end - start) / 1000.0));
        }
    }
    parts.join(" · ")
}
fn usage_label(usage: &Value) -> String {
    let value = |key: &str| match usage.get(key) {
        Some(value @ Value::Number(_)) => {
            suffice_session::to_js_string(value, false).unwrap_or_else(|_| "—".into())
        }
        _ => "—".into(),
    };
    format!(
        "Cost: {} · Tokens: {} · Context: {} · Context %: {}",
        value("cost"),
        value("totalTokens"),
        value("windowTokens"),
        value("windowPercent")
    )
}
struct App {
    state: State,
    cache: CommonMarkCache,
    smoke: bool,
    phase: u8,
    hold: Duration,
    started: Instant,
    ready_emitted: bool,
    focus_search_once: bool,
}
impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        if self.smoke && self.phase == 0 {
            let index = self
                .state
                .sessions
                .iter()
                .position(|s| s.title == "Benchmark large transcript")
                .expect("smoke fixture missing");
            self.state.select(index).expect("smoke selection failed");
            assert_eq!(self.state.messages.len(), 1000);
            assert!(blocks(self.state.messages.last().unwrap())
                .iter()
                .any(|(_, t)| t.contains("message 999 deterministic fixture")));
            self.phase = 1;
        }
        egui::SidePanel::left("sessions")
            .default_width(225.0)
            .show(ctx, |ui| {
                ui.heading("Suffice");
                ui.small("Experimental · read only");
                ui.separator();
                if !self.state.skipped.is_empty() {
                    ui.colored_label(
                        Color32::LIGHT_RED,
                        format!("{} histories skipped", self.state.skipped.len()),
                    );
                    for reason in &self.state.skipped {
                        ui.small(reason);
                    }
                    ui.separator();
                }
                let search = ui.add(
                    egui::TextEdit::singleline(&mut self.state.search)
                        .id(egui::Id::new("session-search"))
                        .hint_text("Search sessions")
                        .desired_width(f32::INFINITY),
                );
                if self.focus_search_once {
                    search.request_focus();
                    self.focus_search_once = false;
                }
                if let Some(action) = search_keyboard_selection(ui, &search, &self.state) {
                    self.state.apply_search_action(action);
                }
                let matches = self.state.matching_sessions();
                ScrollArea::vertical().show(ui, |ui| {
                    for i in matches {
                        let title = self.state.sessions[i].title.clone();
                        if ui
                            .selectable_label(
                                self.state.selected == Some(i) || self.state.highlighted == Some(i),
                                title,
                            )
                            .clicked()
                        {
                            if let Err(e) = self.state.select(i) {
                                self.state.error = Some(e);
                            }
                        }
                    }
                });
            });
        egui::TopBottomPanel::bottom("composer").show(ctx, |ui| {
            ui.separator();
            ui.add_enabled(
                false,
                egui::TextEdit::singleline(
                    &mut "Messaging unavailable in this experimental viewer".to_owned(),
                )
                .desired_width(f32::INFINITY),
            );
        });
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading(
                    self.state
                        .selected
                        .map(|i| self.state.sessions[i].title.as_str())
                        .unwrap_or("Select a session"),
                );
                if ui.button("Jump to latest").clicked()
                    || ctx.input(|i| i.key_pressed(egui::Key::End) && i.modifiers.command)
                {
                    self.state.follow = true;
                    self.state.jump = true;
                }
                ui.checkbox(&mut self.state.follow, "Follow latest");
            });
            if self.state.selected.is_some() {
                ui.small(usage_label(&self.state.usage));
            }
            ui.separator();
            if let Some(e) = &self.state.error {
                ui.colored_label(Color32::LIGHT_RED, e);
            }
            ScrollArea::vertical()
                .id_salt("transcript")
                .stick_to_bottom(self.state.follow)
                .show(ui, |ui| {
                    for (i, message) in self.state.messages.iter().enumerate() {
                        ui.push_id(i, |ui| {
                            let role = message["role"].as_str().unwrap_or("unknown");
                            ui.add_space(12.0);
                            ui.label(
                                RichText::new(role.to_uppercase())
                                    .small()
                                    .color(Color32::from_gray(150)),
                            );
                            let metadata = turn_label(message);
                            if !metadata.is_empty() {
                                ui.small(metadata);
                            }
                            for (kind, text) in blocks(message) {
                                if kind == "text" {
                                    CommonMarkViewer::new().show(ui, &mut self.cache, &text);
                                } else if kind == "status" {
                                    ui.small(text);
                                } else {
                                    egui::CollapsingHeader::new("Tool details").show(ui, |ui| {
                                        ui.add(
                                            egui::Label::new(RichText::new(text).monospace())
                                                .selectable(true),
                                        );
                                    });
                                }
                            }
                        });
                    }
                    if self.state.jump {
                        ui.scroll_to_cursor(Some(egui::Align::BOTTOM));
                        self.state.jump = false;
                    }
                });
        });
        if !self.ready_emitted {
            println!(
                "{}",
                json!({"event":"ready","sessions":self.state.sessions.len(),"experimental":true,"ui_updated":true})
            );
            self.ready_emitted = true;
        }
        if self.smoke && self.phase == 1 {
            println!(
                "{}",
                json!({"event":"selection","messages":self.state.messages.len(),"marker_found":true,"layout_completed":true})
            );
            self.phase = 2;
            self.started = Instant::now();
            ctx.request_repaint_after(self.hold);
        } else if self.smoke && self.phase == 2 && self.started.elapsed() >= self.hold {
            println!("{}", json!({"event":"shutdown","ok":true}));
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            self.phase = 3;
        }
    }
}
fn main() -> eframe::Result {
    let args: Vec<String> = std::env::args().collect();
    let value = |key: &str| args.windows(2).find(|w| w[0] == key).map(|w| w[1].clone());
    let home = value("--home").expect("Explicit --home fixture path required");
    let project = value("--project").expect("Explicit --project fixture path required");
    assert!(Path::new(&project).is_dir(), "Project must exist");
    let state =
        State::discover(&Path::new(&home).join("sessions")).expect("Session discovery failed");
    println!(
        "{}",
        json!({"event":"discovered","sessions":state.sessions.len(),"experimental":true})
    );
    let smoke = args.iter().any(|a| a == "--smoke");
    let hold = Duration::from_secs(
        value("--hold-seconds")
            .and_then(|s| s.parse().ok())
            .unwrap_or(2),
    );
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1200.0, 800.0]),
        ..Default::default()
    };
    eframe::run_native(
        "Suffice Native · Experimental",
        options,
        Box::new(move |cc| {
            let mut style = (*cc.egui_ctx.style()).clone();
            style.visuals = egui::Visuals::dark();
            style.visuals.panel_fill = Color32::from_gray(12);
            cc.egui_ctx.set_style(style);
            Ok(Box::new(App {
                state,
                cache: CommonMarkCache::default(),
                smoke,
                phase: 0,
                hold,
                started: Instant::now(),
                ready_emitted: false,
                focus_search_once: true,
            }))
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use eframe::App as _;
    fn fixture_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "suffice-native-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("group")).unwrap();
        root
    }
    const JOURNAL: &str = concat!(
        "{\"type\":\"session\",\"version\":3,\"id\":\"fixture\",\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"cwd\":\"/fixture\"}\n",
        "{\"type\":\"message\",\"id\":\"m0\",\"parentId\":null,\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"fixture\"}]}}\n"
    );
    #[test]
    fn saved_presentation_selection_and_update_hide_private_projection() {
        let root = fixture_root("presentation");
        let entries = vec![
            json!({"type":"session","version":3,"id":"fixture","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/fixture"}),
            json!({"type":"custom","id":"t","parentId":null,"customType":"suffice:turn-start","data":{"id":"turn","startedAt":1000,"provider":"provider","model":"model","effort":"high","displayPrompt":"visible prompt","attachments":[{"name":"report.txt","path":"/internal/secret","size":12,"type":"text/plain"}]}}),
            json!({"type":"message","id":"u","parentId":"t","message":{"role":"user","content":"raw prompt /internal/secret"}}),
            json!({"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"thinking","thinking":"reasoning"},{"type":"text","text":"answer"}],"usage":{"input":10,"output":4,"cacheRead":3,"cacheWrite":2,"totalTokens":30,"cost":{"total":0.25}}}}),
            json!({"type":"custom","id":"e","parentId":"a","customType":"suffice:turn-end","data":{"id":"turn","endedAt":3000}}),
            json!({"type":"compaction","id":"c","parentId":"e","summary":"PRIVATE COMPACTION","firstKeptEntryId":"u","tokensBefore":10}),
            json!({"type":"custom","id":"r","parentId":"c","customType":"suffice:compaction","data":{"entryId":"c","reason":"automatic"}}),
            json!({"type":"custom","id":"i","parentId":"r","customType":"suffice:interrupted","data":{}}),
            json!({"type":"message","id":"z","parentId":"i","message":{"role":"user","content":"after"}}),
        ];
        let journal = entries
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        std::fs::write(root.join("group/fixture.jsonl"), journal).unwrap();
        let mut state = State::discover(&root).unwrap();
        state.select(0).unwrap();
        let presented = state
            .messages
            .iter()
            .flat_map(blocks)
            .map(|(_, text)| text)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(presented.contains("visible prompt"));
        assert!(presented.contains("report.txt · 12 bytes · text/plain"));
        assert!(presented.contains("Automatically compacted"));
        assert!(presented.contains("Interrupted"));
        assert!(!presented.contains("reasoning"));
        assert!(!presented.contains("PRIVATE COMPACTION"));
        assert!(!presented.contains("/internal/secret"));
        assert!(state
            .messages
            .iter()
            .any(|m| turn_label(m).contains("provider · model · high · 2.0s")));
        assert_eq!(state.usage["totalTokens"].as_f64(), Some(19.0));
        assert!(usage_label(&state.usage).contains("—"));
        let mut app = App {
            state,
            cache: CommonMarkCache::default(),
            smoke: false,
            phase: 0,
            hold: Duration::ZERO,
            started: Instant::now(),
            ready_emitted: true,
            focus_search_once: false,
        };
        let context = egui::Context::default();
        let mut frame = eframe::Frame::_new_kittest();
        let _ = context.run(egui::RawInput::default(), |ctx| app.update(ctx, &mut frame));
        drop(app);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn replacement_symlink_cannot_escape_store_on_selection() {
        let root = fixture_root("symlink");
        let path = root.join("group/fixture.jsonl");
        std::fs::write(&path, JOURNAL).unwrap();
        let mut state = State::discover(&root).unwrap();
        assert_eq!(state.sessions.len(), 1);
        state.select(0).unwrap();
        let before = state.messages.clone();
        let before_usage = state.usage.clone();
        let before_selected = state.selected;
        let outside = root.with_extension("outside.jsonl");
        std::fs::write(&outside, JOURNAL.replace("fixture\"}]", "escaped\"}]")).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(&outside, &path).unwrap();
        assert!(state.select(0).is_err());
        assert_eq!(state.messages, before);
        assert_eq!(state.usage, before_usage);
        assert_eq!(state.selected, before_selected);
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_file(outside).unwrap();
    }
    #[test]
    fn discovery_reports_oversized_history() {
        let root = fixture_root("oversized");
        let path = root.join("group/large.jsonl");
        let file = std::fs::File::create(path).unwrap();
        file.set_len(65 * 1024 * 1024).unwrap();
        let state = State::discover(&root).unwrap();
        assert!(state.sessions.is_empty());
        assert!(!state.skipped.is_empty());
        drop(state);
        drop(file);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn saved_blocks_preserve_text_and_suppress_reasoning() {
        let v = json!({"content":[{"type":"text","text":"hello"},{"type":"thinking","text":"private"}]});
        assert_eq!(blocks(&v), vec![("text".into(), "hello".into())]);
    }
    #[test]
    fn invalid_selection_does_not_change_state() {
        let mut s = State::default();
        assert!(s.select(0).is_err());
        assert!(s.selected.is_none());
    }
    #[test]
    fn title_search_keyboard_candidates_do_not_change_selection_before_load() {
        let mut state = State {
            sessions: vec![
                Session {
                    path: PathBuf::new(),
                    title: "Alpha".into(),
                },
                Session {
                    path: PathBuf::new(),
                    title: "Beta alpha".into(),
                },
                Session {
                    path: PathBuf::new(),
                    title: "Gamma".into(),
                },
            ],
            search: "ALPHA".into(),
            ..Default::default()
        };
        let matches = state.matching_sessions();
        assert_eq!(matches, vec![0, 1]);
        assert_eq!(
            state.search_key(egui::Key::ArrowDown),
            Some(SearchAction::Highlight(0))
        );
        assert!(state.selected.is_none());
        state.highlighted = Some(0);
        assert_eq!(
            state.search_key(egui::Key::ArrowDown),
            Some(SearchAction::Highlight(1))
        );
        state.highlighted = Some(1);
        assert_eq!(
            state.search_key(egui::Key::ArrowUp),
            Some(SearchAction::Highlight(0))
        );
        assert_eq!(
            state.search_key(egui::Key::Enter),
            Some(SearchAction::Open(1))
        );
        state.highlighted = None;
        assert_eq!(
            state.search_key(egui::Key::Enter),
            Some(SearchAction::Open(0))
        );
    }
    #[test]
    fn keyboard_navigation_ignores_an_empty_search_result() {
        let mut state = State {
            sessions: vec![Session {
                path: PathBuf::new(),
                title: "Alpha".into(),
            }],
            search: "missing".into(),
            ..Default::default()
        };
        let matches = state.matching_sessions();
        assert!(matches.is_empty());
        state.selected = Some(0);
        assert_eq!(state.search_key(egui::Key::ArrowDown), None);
        assert_eq!(state.search_key(egui::Key::ArrowUp), None);
        assert_eq!(state.search_key(egui::Key::Enter), None);
        assert_eq!(state.selected, Some(0));
    }
    #[test]
    fn egui_arrow_input_proposes_the_first_matching_session() {
        let context = egui::Context::default();
        let mut state = State {
            sessions: vec![Session {
                path: PathBuf::new(),
                title: "Alpha".into(),
            }],
            search: "alpha".into(),
            ..Default::default()
        };
        let id = egui::Id::new("session-search-test");
        let _ = context.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                let search = ui.add(egui::TextEdit::singleline(&mut state.search).id(id));
                search.request_focus();
            });
        });
        let input = egui::RawInput {
            events: vec![egui::Event::Key {
                key: egui::Key::ArrowDown,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers: egui::Modifiers::NONE,
            }],
            ..Default::default()
        };
        let mut candidate = None;
        let _ = context.run(input, |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                let search = ui.add(egui::TextEdit::singleline(&mut state.search).id(id));
                candidate = search_keyboard_selection(ui, &search, &state);
            });
        });
        assert_eq!(candidate, Some(SearchAction::Highlight(0)));
    }
    #[test]
    fn app_arrow_highlights_without_loading_and_enter_loads() {
        let root = std::env::temp_dir().join(format!(
            "suffice-native-keyboard-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let group = root.join("group");
        std::fs::create_dir_all(&group).unwrap();
        let path = group.join("fixture.jsonl");
        std::fs::write(
            &path,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"fixture\",\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"cwd\":\"/fixture\"}\n",
                "{\"type\":\"message\",\"id\":\"m0\",\"parentId\":null,\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"fixture\"}]}}\n"
            ),
        )
        .unwrap();
        let context = egui::Context::default();
        let mut frame = eframe::Frame::_new_kittest();
        let mut app = App {
            state: State {
                sessions: vec![Session {
                    path: PathBuf::from("group/fixture.jsonl"),
                    title: "Alpha".into(),
                }],
                store: Some(
                    suffice_session::SessionStore::open(
                        &root,
                        suffice_session::ReadLimits::default(),
                    )
                    .unwrap(),
                ),
                search: "alpha".into(),
                messages: vec![json!({"sentinel": true})],
                ..Default::default()
            },
            cache: CommonMarkCache::default(),
            smoke: false,
            phase: 0,
            hold: Duration::ZERO,
            started: Instant::now(),
            ready_emitted: true,
            focus_search_once: true,
        };
        let _ = context.run(egui::RawInput::default(), |ctx| app.update(ctx, &mut frame));
        let arrow = egui::RawInput {
            events: vec![egui::Event::Key {
                key: egui::Key::ArrowDown,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers: egui::Modifiers::NONE,
            }],
            ..Default::default()
        };
        let _ = context.run(arrow, |ctx| app.update(ctx, &mut frame));
        assert_eq!(app.state.highlighted, Some(0));
        assert_eq!(app.state.selected, None);
        assert_eq!(app.state.messages, vec![json!({"sentinel": true})]);
        let enter = egui::RawInput {
            events: vec![egui::Event::Key {
                key: egui::Key::Enter,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers: egui::Modifiers::NONE,
            }],
            ..Default::default()
        };
        let _ = context.run(enter, |ctx| app.update(ctx, &mut frame));
        assert_eq!(app.state.selected, Some(0));
        assert_eq!(app.state.messages.len(), 1);
        drop(app);
        std::fs::remove_dir_all(root).unwrap();
    }
}
