use napi::{bindgen_prelude::AsyncTask, Error, Result, Task};
use napi_derive::napi;
use std::path::Path;

pub struct WalkTask {
    root: String,
}

impl Task for WalkTask {
    type Output = Vec<String>;
    type JsValue = Vec<String>;

    fn compute(&mut self) -> Result<Self::Output> {
        std::panic::catch_unwind(|| {
            let mut paths = Vec::new();
            suffice_fs::walk(Path::new(&self.root), "", &mut paths)?;
            Ok::<_, std::io::Error>(paths)
        })
        .map_err(|_| Error::from_reason("traversal panicked"))?
        .map_err(|e| Error::from_reason(e.to_string()))
    }
    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn walk(root: String) -> AsyncTask<WalkTask> {
    AsyncTask::new(WalkTask { root })
}
