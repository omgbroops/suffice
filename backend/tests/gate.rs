use suffice::gate::{check_event, check_task, Verdict};
use suffice::types::{Access, AgentKind, Event, Task, TaskState};
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
        access: Access::Edit,
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
fn browser_tools() {
    let cases: &[(&str, &str, bool)] = &[
        ("browser_click", r##"{"selector":"#search-btn","text":"Search"}"##, false),
        ("browser_type", r#"{"selector":"input[name=q]","value":"rust books"}"#, false),
        ("browser_click", r#"{"selector":"button","text":"Place order"}"#, true),
        ("browser_click", r#"{"selector":"button","text":"Subscribe now"}"#, true),
        ("browser_type", r#"{"selector":"input","value":"pay now"}"#, true),
        ("browser_click", r#"{"selector":"input","attrs":"type=submit"}"#, true),
        ("browser_click", r#"{"selector":"form","attrs":"form action=/save"}"#, true),
        ("browser_frobnicate", "{}", true),
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

#[test]
fn narrow_read_only_allow_rules() {
    let allow = [
        "curl -s https://github.com/a/b",
        "curl -s -L -S https://api.github.com/repos/a/b",
        "curl -f -L --max-time 10 https://docs.rs/serde",
        "curl --silent --show-error -I https://pypi.org/simple/x/",
        "curl -s https://crates.io/api/v1/crates?q=abc",
        "gh pr view --json number,title",
        "gh pr list -R owner/repo --state merged -L 5",
        "gh issue list --state all --limit 20",
        "gh repo view --repo owner/repo",
        "python3 check.py",
        "node build.mjs",
        "node test.js",
        "docker build -t app .",
        "docker build -t app ctx",
        "docker ps",
        "docker images",
    ];
    for c in allow {
        assert!(!held(&check_event(&call("Bash", c))), "should allow: {c}");
    }
    let hold = [
        "curl -X POST https://x.com/a",
        "curl -s -d a=b https://x.com/a",
        "curl -s -F f=@a https://x.com/a",
        "curl -s -T f https://x.com/a",
        "curl -s --data-binary a https://x.com/a",
        "curl -s --json a https://x.com/a",
        "curl -s --upload-file f https://x.com/a",
        "curl -s -o out https://x.com/a",
        "curl -s -O https://x.com/a",
        "curl -s -K cfg https://x.com/a",
        "curl -s --config cfg https://x.com/a",
        "curl -s -u user:pw https://x.com/a",
        "curl -s -x http://proxy https://x.com/a",
        "curl -s file:///etc/passwd",
        "curl -s -m 5 https://u@x.com/a",
        "curl -s https://x.com/a https://y.com/b",
        "curl -s https://github.com.evil.com/a",
        "curl -s https://github.com:443/a",
        "curl -s http://github.com/a",
        "curl -s http://example.com",
        "curl -s https://localhost/a",
        "curl -s https://127.0.0.1/a",
        "curl -s https://0.0.0.0/a",
        "curl -s https://169.254.169.254/latest",
        "curl -s https://10.0.0.1/a",
        "curl -s https://192.168.1.1/a",
        "curl -s https://172.16.0.1/a",
        "curl -s https://[::1]/a",
        "curl -s https://github.com@evil.com/a",
        "curl -s https://github.com/a?q=[1-3]",
        "curl -s https://github.com/{a,b}",
        "curl -s https://github.com/a?q=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "gh pr list -R github.com/owner/repo",
        "gh pr list --repo a/b/c",
        "gh pr list -R owner",
        "docker build -t app https://github.com/x/y.git",
        "docker build -t app github.com/x/y",
        "docker build -t app https://x.com/ctx.tar.gz",
        "docker build -t app ctx:1",
        "docker build -t app ctx.git",
        "python3 -evil.py",
        "node --x.js",
        "gh pr view --web",
        "gh pr list --web",
        "gh pr view 3",
        "gh issue view 4",
        "gh run list",
        "gh api repos/x/y",
        "python3 -c print(1)",
        "python3 /abs/check.py",
        "python3 ../check.py",
        "python3 scripts/check.py",
        "python3 check.py --x",
        "node -e 1",
        "node /abs/a.js",
        "node ../a.js",
        "docker build .",
        "docker build -t app /abs",
        "docker build -t app ../ctx",
        "docker build -f Dockerfile -t app .",
        "docker push img:1",
        "docker run img",
        "docker login",
        "docker exec -it c sh",
    ];
    for c in hold {
        assert!(held(&check_event(&call("Bash", c))), "should hold: {c}");
    }
}

#[test]
fn full_access_task_is_held_for_approval() {
    let mut t = task("summarize the repo");
    t.access = Access::Full;
    assert_eq!(check_task(&t), Verdict::Hold { reason: "full access needs OK".into() });
}

#[test]
fn reply_and_message_narrowed() {
    for p in [
        "Fix the error message in main.rs", "Reply with only the number", "What does this message mean?",
        "reply in one word", "Fix the commit message format", "Reply only: 42", "Answer with just: ok",
    ] {
        assert!(!held(&check_task(&task(p))), "should allow: {p}");
    }
    for p in [
        "reply to the email from Sam", "Reply all with the update", "message the team on slack", "please message Bob",
        "then reply on the PR", "send a message to Bob", "can you message Sam", "you should message the team",
        "let's message Sam", "reply in the slack thread", "reply using the support account", "Reply only to the customer",
        "Reply with a thank-you to Sam", "Reply briefly to the ticket", "DM Sam the link", "reply with ok, then cc the boss",
        "Reply in a few sentences, addressing Sam directly", "reply-with-thanks Sam", "the message Sam",
        "commit message Sam now", "your message to Sam goes out at 5", "REPLY WITH THANKS TO SAM",
        "ｒｅｐｌｙ to Sam", "ｓｅｎｄ the file", "reply with ok。 message Sam", "the message 日本 Sam",
        "the message about the launch Sam",
        "Tell Bob to reply yes", "Ask Alice and reply ok", "Fix it and reply yes", "Have Bob reply done", "I will reply yes",
        "the message bob", "Slack bob a message", "Leave a message for bob", "İx the message Bob", "İx the message 田中",
        "commit message Bob now", "your message to Sam goes out",
    ] {
        assert!(held(&check_task(&task(p))), "should hold: {p}");
    }
}
