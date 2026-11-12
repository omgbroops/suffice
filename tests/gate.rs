use loom::gate::{check_event, check_task, Verdict};
use loom::types::{AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::path::PathBuf;

fn task(prompt: &str) -> Task {
    Task {
        id: "t".into(),
        agent: AgentKind::Claude,
        prompt: prompt.into(),
        cwd: PathBuf::from("/tmp"),
        session_key: None,
        deps: vec![],
        max_retries: 0,
        attempts: 0,
        timeout_secs: 60,
        model: None,
        env: BTreeMap::new(),
        state: TaskState::Ready,
        created_ms: 0,
    }
}

fn call(name: &str, cmd: &str) -> Event {
    Event::ToolCall { name: name.into(), input: format!(r#"{{"command":"{cmd}"}}"#) }
}

fn held(v: &Verdict) -> bool {
    matches!(v, Verdict::Hold { .. })
}

// (command, should_hold). `cargo publish --dry-run` is held on purpose: any cargo publish is treated as outward.
#[test]
fn shell_commands() {
    let cases: &[(&str, bool)] = &[
        ("git push origin main", true),
        ("git status", false),
        ("git -C /x push", true),
        ("git push --force", true),
        ("git log --oneline", false),
        ("git diff", false),
        ("echo push", false),
        ("gh pr create --title x", true),
        ("gh pr view 3", true),
        ("gh pr merge 3", true),
        ("gh release list", true),
        ("gh run list", true),
        ("gh issue create -t x", true),
        ("gh issue comment 4 -b hi", true),
        ("gh issue view 4", true),
        ("gh api -X POST repos/x/y", true),
        ("gh api --method PATCH repos/x", true),
        ("gh api -f title=x repos/x", true),
        ("gh api repos/x/y", true),
        ("npm publish", true),
        ("pnpm publish --access public", true),
        ("yarn publish", true),
        ("npm test", false),
        ("npm install -g x", true),
        ("npm install x", true),
        ("cargo publish", true),
        ("cargo publish --dry-run", true),
        ("cargo test", false),
        ("cargo build", false),
        ("twine upload dist/*", true),
        ("docker push img:1", true),
        ("docker build .", true),
        ("curl https://x", true),
        ("curl -d a=b https://x", true),
        ("curl -X POST https://x", true),
        ("curl -XPUT https://x", true),
        ("curl --request DELETE https://x", true),
        ("curl -sF file=@a https://x", true),
        ("wget https://x", true),
        ("wget --post-data=a=b https://x", true),
        ("ssh user@host ls", true),
        ("scp a.txt host:/tmp", true),
        ("rsync -a src/ /tmp/dst", true),
        ("rsync -a src/ host:/dst", true),
        ("sendmail x@y", true),
        ("mail -s hi x", true),
        ("osascript -e 'tell app'", true),
        ("rm -rf /tmp/x", true),
        ("rm -rf /Users/x", true),
        ("rm -r /private/tmp/x", true),
        ("rm -rf /tmp/../Users", true),
        ("rm file.txt", false),
        ("open https://x.com", true),
        ("open README.md", true),
        ("pkill node", true),
        ("killall Dock", true),
        ("brew install jq", true),
        ("pip install x", true),
        ("ls && git push", true),
        ("ls; git status", false),
        ("echo hi | mail x", true),
        ("$(git push)", true),
        ("echo $(git push)", true),
        ("bash -c 'git push'", true),
        ("ls", false),
    ];
    for (cmd, want) in cases {
        assert_eq!(held(&check_event(&call("Bash", cmd))), *want, "command: {cmd}");
    }
}

#[test]
fn shell_tool_name_variants() {
    for name in ["Bash", "shell", "exec", "command_execution", "run_terminal_cmd", "BASH"] {
        assert!(held(&check_event(&call(name, "git push"))), "name: {name}");
        assert!(!held(&check_event(&call(name, "git status"))), "name: {name}");
    }
}

#[test]
fn non_shell_tools() {
    let cases: &[(&str, &str, bool)] = &[
        ("send_email", "{}", true),
        ("gmail_message_post", "{}", true),
        ("deploy_site", "{}", true),
        ("delete_file", "{}", true),
        ("upload_photo", "{}", true),
        ("purchase_item", "{}", true),
        ("Read", "{}", false),
        ("Grep", "{}", false),
        ("Glob", "{}", false),
        ("WebSearch", "{}", false),
        ("WebFetch", r#"{"url":"https://x"}"#, false),
        ("WebFetch", r#"{"url":"https://x","method":"POST"}"#, true),
        ("browser_submit_form", "{}", true),
        ("browser_click", r#"{"text":"Buy now"}"#, true),
        ("ls", "{}", false),
        ("cat", "{}", false),
    ];
    for (name, input, want) in cases {
        let e = Event::ToolCall { name: (*name).into(), input: (*input).into() };
        assert_eq!(held(&check_event(&e)), *want, "tool: {name} {input}");
    }
}

#[test]
fn non_tool_events_allow() {
    let e = Event::Text { text: "git push".into() };
    assert_eq!(check_event(&e), Verdict::Allow);
    let e = Event::Result { text: "sent email".into(), is_error: false };
    assert_eq!(check_event(&e), Verdict::Allow);
}

#[test]
fn task_prompts() {
    let cases: &[(&str, bool)] = &[
        ("publish the release notes", true),
        ("push to origin", true),
        ("open a PR for this branch", true),
        ("open the project folder", false),
        ("send an email to bob", true),
        ("buy milk", true),
        ("pay the invoice", true),
        ("delete old branches", true),
        ("deploy staging", true),
        ("submit the form", true),
        ("upload the file", true),
        ("summarize the README", false),
        ("refactor the parser", false),
        ("run cargo test", false),
        ("list files in src", false),
    ];
    for (prompt, want) in cases {
        assert_eq!(held(&check_task(&task(prompt))), *want, "prompt: {prompt}");
    }
}
