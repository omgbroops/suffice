"""Seeded desktop facade for the Timeline screenshots. usage: python3 seed_api.py PORT [modes]
modes (comma list): empty, many (200 saves), long (very long message), slowload, slowrewind, failrewind, failload.
Real desktop_api.py routes; only the Client is fake, and timeline() adds the optional per-save fields
(changes, db, tests) the contract does not carry yet."""
import sys, time, datetime
sys.path.insert(0, "/Users/abhayg/suffice-cloud-wt/w5-desktopreal/python")
import desktop_api
from desktop_api import make_server
from suffice_cloud import ScError

port, modes = int(sys.argv[1]), set((sys.argv[2] if len(sys.argv) > 2 else "").split(","))
now = datetime.datetime.now(datetime.timezone.utc)
iso = lambda m: (now - datetime.timedelta(minutes=m)).strftime("%Y-%m-%dT%H:%M:%SZ")
LONG = ("Agent edit: rewrite the task list to group by due date, move the tag filter into the header, replace the inline "
        "bulk-complete handler with a queue that retries failed writes three times, add optimistic updates, and rename every "
        "legacy 'todo' column to 'task' across the schema, the API and the seed data so older exports still import cleanly")
# oldest first: (minutes ago, name, files, added, removed, db rows, destructive, tests)
S = [(118, "First boot from the todo template", 14, 612, 0, 0, None, None),
     (101, "Add tasks table and seed data", 3, 74, 2, 40, None, ("passed", None)),
     (85, "Add due dates to tasks", 4, 51, 9, 40, None, ("passed", None)),
     (68, "Agent edit: tag filter in the task list", 5, 88, 21, 0, None, ("passed", None)),
     (50, "Saved before the edit", 0, 0, 0, 0, None, None),
     (35, "Agent edit: drop the notes column", 3, 12, 47, 212, {"what": "tasks.notes", "rows": 212}, ("passed", None)),
     (22, "Agent edit: bulk complete", 6, 133, 18, 18, None, ("failed", "step 4 of the checkout test")),
     (9, "Fix bulk complete retry", 2, 24, 8, 0, None, ("passed", None)),
     (0, "Saved after the tests ran", 0, 0, 0, 0, None, ("passed", None))]
if "many" in modes:
    S = [(2 * (200 - i) + 118, f"Agent edit {i + 1}: adjust the task list" + (" and failing check" if i % 17 == 0 else ""), i % 6, 10 + i % 40, i % 9, (i * 7) % 60, None,
          ("failed", "step 4 of the checkout test") if i % 17 == 0 else ("passed", None)) for i in range(200)]
if "long" in modes:
    S[6] = (S[6][0], LONG) + S[6][2:]
if "empty" in modes:
    S = []
META = {}
class Fake:
    def __init__(self): self.cps = []; self.n = 0
    def load(self):
        for i, (m, name, f, a, r, rows, dest, tests) in enumerate(S):
            cid = f"sv_{i + 1:03d}"; self.cps.append({"id": cid, "name": name, "created_at": iso(m), "size_gb": 0.2 + i * 0.004, "includes_memory": False})
            META[cid] = {"changes": {"files": f, "added": a, "removed": r}, "db": {"rows_changed": rows, "destructive": dest}, **({"tests": {"status": tests[0], "failed_step": tests[1]}} if tests else {})}
    def get_vm(self, _): return {"state": "running"}
    def list_urls(self, _): return {"data": []}
    def list_checkpoints(self, _):
        if "failload" in modes: raise RuntimeError("boom")
        if "slowload" in modes: time.sleep(6)
        return {"data": list(self.cps)}
    def create_checkpoint(self, _, name):
        self.n += 1; self.cps.insert(0, {"id": f"sv_new{self.n}", "name": name, "created_at": iso(0), "size_gb": 0.3, "includes_memory": False})
        META[f"sv_new{self.n}"] = {"changes": {"files": 0, "added": 0, "removed": 0}, "db": {"rows_changed": 0}}
    def rewind_vm(self, _, sid):
        if "failrewind" in modes: raise RuntimeError("boom")
        if "slowrewind" in modes: time.sleep(3)
c = Fake(); c.load()
orig = desktop_api.Desktop.timeline
def timeline(self, app_id):
    out = orig(self, app_id)
    for s in out["saves"]: s.update(META.get(s["save_id"], {}))
    return out
desktop_api.Desktop.timeline = timeline
srv = make_server(c, port)
H = srv.RequestHandlerClass
_end = H.end_headers
def end_headers(self):  # file:// origin in Electron needs CORS; the real facade has none, this seed only
    self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); _end(self)
def options(self):
    self.send_response(204); self.send_header("Content-Length", "0"); self.end_headers()
H.end_headers = end_headers; H.do_OPTIONS = options
print("seed api on", srv.server_address[1], sorted(modes), flush=True)
srv.serve_forever()
