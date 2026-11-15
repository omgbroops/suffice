# Automatic session naming

The desktop currently shortens the first prompt for Automatic. Add a title tool
to the shared session only for that setting, with a 90-character single-line
limit. Instruct new sessions to call it, preserve a provisional title if cancelled,
and emit history_changed after persistence. Refresh the selected header together
with the sidebar. Existing named sessions are not renamed by migration.
