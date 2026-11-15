use eframe::egui::{self, Color32, RichText, ScrollArea};
use egui_commonmark::{CommonMarkCache, CommonMarkViewer};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

const MAX_SESSION: u64 = 64 * 1024 * 1024;
#[derive(Clone)]
struct Session {
    path: PathBuf,
    title: String,
}
#[derive(Default)]
struct State {
    sessions: Vec<Session>,
    selected: Option<usize>,
    messages: Vec<Value>,
    error: Option<String>,
    follow: bool,
    jump: bool,
}
impl State {
    fn discover(root: &Path) -> Result<Self, String> {
        let root = root
            .canonicalize()
            .map_err(|e| format!("Session root: {e}"))?;
        let sessions = suffice_session::discover(&root)?
            .into_iter()
            .filter_map(|v| {
                let path = PathBuf::from(v["path"].as_str()?);
                let canonical = path.canonicalize().ok()?;
                if !canonical.starts_with(&root)
                    || fs::metadata(&canonical).ok()?.len() > MAX_SESSION
                {
                    return None;
                }
                let title = v["name"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| v["firstMessage"].as_str().unwrap_or("Untitled"));
                Some(Session {
                    path: canonical,
                    title: title.to_owned(),
                })
            })
            .collect();
        Ok(Self {
            sessions,
            follow: true,
            ..Default::default()
        })
    }
    fn select(&mut self, index: usize) -> Result<(), String> {
        let session = self
            .sessions
            .get(index)
            .ok_or("Session index out of range")?;
        if fs::metadata(&session.path)
            .map_err(|e| e.to_string())?
            .len()
            > MAX_SESSION
        {
            return Err("Session exceeds 64 MiB limit".into());
        }
        let text = fs::read_to_string(&session.path).map_err(|e| e.to_string())?;
        let entries = suffice_session::read_journal(&text)?;
        let projected = suffice_session::project(&entries, None)?;
        self.messages = projected["messages"]
            .as_array()
            .cloned()
            .ok_or("Invalid projection")?;
        self.selected = Some(index);
        self.follow = true;
        self.jump = true;
        self.error = None;
        Ok(())
    }
}
fn blocks(message: &Value) -> Vec<(String, String)> {
    let content = &message["content"];
    if let Some(s) = content.as_str() {
        return vec![("text".into(), s.into())];
    }
    if let Some(arr) = content.as_array() {
        return arr
            .iter()
            .map(|b| {
                let kind = b["type"].as_str().unwrap_or("unknown");
                let text = match kind {
                    "text" => b["text"].as_str().unwrap_or("").to_owned(),
                    "thinking" => b["thinking"].as_str().unwrap_or("").to_owned(),
                    _ => serde_json::to_string_pretty(b).unwrap_or_default(),
                };
                (kind.into(), text)
            })
            .collect();
    }
    message["summary"]
        .as_str()
        .map(|s| vec![("text".into(), s.into())])
        .unwrap_or_default()
}
struct App {
    state: State,
    cache: CommonMarkCache,
    smoke: bool,
    phase: u8,
    hold: Duration,
    started: Instant,
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
                ScrollArea::vertical().show(ui, |ui| {
                    for i in 0..self.state.sessions.len() {
                        let title = self.state.sessions[i].title.clone();
                        if ui
                            .selectable_label(self.state.selected == Some(i), title)
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
                            for (kind, text) in blocks(message) {
                                if kind == "text" {
                                    CommonMarkViewer::new().show(ui, &mut self.cache, &text);
                                } else {
                                    egui::CollapsingHeader::new(format!("{kind} details")).show(
                                        ui,
                                        |ui| {
                                            ui.add(
                                                egui::Label::new(RichText::new(text).monospace())
                                                    .selectable(true),
                                            );
                                        },
                                    );
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
        json!({"event":"ready","sessions":state.sessions.len(),"experimental":true})
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
            }))
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_preserve_text_and_disclose_thinking() {
        let v = json!({"content":[{"type":"text","text":"hello"},{"type":"thinking","thinking":"private"}]});
        assert_eq!(
            blocks(&v),
            vec![
                ("text".into(), "hello".into()),
                ("thinking".into(), "private".into())
            ]
        );
    }
    #[test]
    fn invalid_selection_does_not_change_state() {
        let mut s = State::default();
        assert!(s.select(0).is_err());
        assert!(s.selected.is_none());
    }
}
