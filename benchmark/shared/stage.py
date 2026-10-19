"""Stage canonical Windows source into a new WSL runtime; never edit old runtimes."""
import hashlib, json, os, pathlib, shutil, subprocess
SOURCE = pathlib.Path(__file__).resolve().parents[2]
TARGET = pathlib.Path('/home/eric_qin/suffice-shared-core-v1/app')
if os.name != 'posix' or not str(SOURCE).startswith('/mnt/c/'):
    raise SystemExit('Run this staging script in WSL from the canonical Windows checkout')
if (TARGET / '.suffice/shared-core-v1/manifest.json').exists():
    raise SystemExit('Runtime already frozen; preserve it')
names = subprocess.check_output(['git', '-c', 'safe.directory='+str(SOURCE), '-C', str(SOURCE),
                                 'ls-files', '-co', '--exclude-standard', '-z']).decode().split('\0')
hashes = {}
for name in sorted(set(names)-{''}):
    source = SOURCE / name
    if not source.is_file() or source.is_symlink():
        raise RuntimeError('Unsupported source '+name)
    target = TARGET / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    assert hashes[name] == hashlib.sha256(target.read_bytes()).hexdigest()
(TARGET / '.suffice/pi').mkdir(parents=True, exist_ok=True)
link = TARGET / 'node_modules'
if not link.exists():
    link.symlink_to('/home/eric_qin/suffice-general-runtime/app/node_modules', target_is_directory=True)
(TARGET / '.suffice/staging.json').write_text(json.dumps({'source':str(SOURCE),'hashes':hashes},indent=2))
print(json.dumps({'target':str(TARGET),'verifiedFiles':len(hashes)}))
