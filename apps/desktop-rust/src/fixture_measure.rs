//! Explicit, synthetic-fixture-only driver for matched desktop measurements.
use serde_json::{Value, json};
use wry::WebView;

const ACTIONS: [&str; 5] = ["ready", "select", "settings", "pty", "finish"];
const DRIVER: &str = include_str!("measure-fixture.js");

#[derive(Default)]
pub struct Fixture {
    index: usize,
    pending: bool,
}

impl Fixture {
    pub fn expected(&self) -> Option<&'static str> {
        ACTIONS.get(self.index).copied()
    }

    pub fn start(&mut self, action: &str, view: &WebView) -> Result<(), String> {
        if self.pending || self.expected() != Some(action) {
            return Err("Fixture command is out of order".into());
        }
        let script = format!(
            "(()=>{{if(window.top!==window||location.protocol+'//'+location.host!=={origin:?}||!['','/','/index.html'].includes(location.pathname))return;({DRIVER})({action:?}).then(receipt=>window.ipc.postMessage(JSON.stringify({{type:'fixture-result',action:{action:?},ok:true,receipt}})),error=>window.ipc.postMessage(JSON.stringify({{type:'fixture-result',action:{action:?},ok:false,reason:String(error.message).slice(0,512)}})));}})()",
            origin = super::app_origin(),
        );
        self.pending = true;
        view.evaluate_script(&script).map_err(|e| e.to_string())
    }

    pub fn accept(&mut self, value: &Value, elapsed: u128) -> Result<Value, String> {
        let action = self.expected().ok_or("Fixture already finished")?;
        if !self.pending || value["action"].as_str() != Some(action) {
            return Err("Unexpected fixture result".into());
        }
        if value["ok"] != true {
            return Err(value["reason"]
                .as_str()
                .unwrap_or("Fixture action failed")
                .chars()
                .take(512)
                .collect());
        }
        let r = &value["receipt"];
        let mut result = match action {
            "ready"
                if r["threadCount"] == 30
                    && ["width", "height", "devicePixelRatio"]
                        .iter()
                        .all(|k| r[k].as_f64().is_some_and(|n| n > 0.0)) =>
            {
                json!({"event":"fixture-ready","threadCount":30,"width":r["width"],"height":r["height"],"devicePixelRatio":r["devicePixelRatio"]})
            }
            "select"
                if r["threadCount"] == 30
                    && r["marker"] == "Rust host fixture message 999"
                    && r["transcriptCharacters"].as_u64().is_some_and(|n| n > 0) =>
            {
                json!({"event":"fixture-phase","action":action,"threadCount":30,"transcriptCharacters":r["transcriptCharacters"],"marker":r["marker"]})
            }
            "settings" if r["marker"] == "Configure OpenAI" => {
                json!({"event":"fixture-phase","action":action,"marker":r["marker"]})
            }
            "pty" if r["marker"] == "SUFFICE_MACOS_PTY_READY" && r["terminalVisible"] == true => {
                json!({"event":"fixture-phase","action":action,"marker":r["marker"],"terminalVisible":true})
            }
            "finish" if r.is_object() => json!({"event":"fixture-phase","action":action}),
            _ => return Err("Invalid fixture result".into()),
        };
        result["ok"] = true.into();
        result["elapsedMs"] = json!(elapsed);
        self.pending = false;
        self.index += 1;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipts_require_the_expected_phase_and_concrete_rendered_evidence() {
        let mut fixture = Fixture {
            index: 3,
            pending: true,
        };
        assert!(
            fixture
                .accept(&json!({"action":"finish","ok":true,"receipt":{}}), 1)
                .is_err()
        );
        assert!(fixture.accept(&json!({"action":"pty","ok":true,"receipt":{"marker":"SUFFICE_MACOS_PTY_READY","terminalVisible":false}}),2).is_err());
        let good = json!({"action":"pty","ok":true,"receipt":{"marker":"SUFFICE_MACOS_PTY_READY","terminalVisible":true}});
        assert_eq!(fixture.accept(&good, 3).unwrap()["elapsedMs"], 3);
        assert_eq!(fixture.expected(), Some("finish"));
        assert!(fixture.accept(&good, 4).is_err());
    }
}
