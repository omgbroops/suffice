# Project identity and membership

Keep custom project display metadata in the desktop's registry rather than rewriting repository files. Hide chats for removed registry projects while preserving every saved transcript. Re-adding the same directory restores them.

Moving a thread changes its future working directory and project association while preserving messages and thread ID. Require an idle thread, release cached hosts, then atomically replace its session header. The move cannot race with a new run in this window. Historical chat receipts remain historical; future root changes make file-change tracking partial rather than mixing files across repositories as confidently attributed changes.
