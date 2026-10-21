"""Public smoke checks from original task instructions, never private verifier cases."""
import gzip
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request

def check(task):
    if task=='query-optimize':
        sql=Path('/app/sol.sql').read_text().strip()
        assert sql.endswith(';') and '--' not in sql and '/*' not in sql
        with sqlite3.connect('file:/app/oewn.sqlite?mode=ro',uri=True) as db:
            db.execute('EXPLAIN QUERY PLAN '+sql).fetchall()
        print('SQLite syntax/plan passed; equivalence and performance NOT established')
    elif task=='gcode-to-text':
        assert Path('/app/out.txt').read_text().strip()
        print('Nonempty output exists; interpretation correctness NOT established')
    elif task=='path-tracing':
        source=Path('/app/image.c').read_bytes()
        assert len(gzip.compress(source))<2048
        subprocess.run(['gcc','-static','-o','/tmp/suffice-image','/app/image.c','-lm'],check=True,timeout=60)
        subprocess.run(['/tmp/suffice-image'],cwd='/app',check=True,timeout=60)
        assert Path('/app/reconstructed.ppm').stat().st_size>16
        print('Compile/run/size/output checks passed; image similarity NOT established')
    elif task=='regex-log':
        pattern=Path('/app/regex.txt').read_text().strip()
        actual=re.findall(pattern,'host 1.2.3.4 2025-02-29 and 2026-12-31\nno IP 2026-01-01\nhost 999.2.3.4 2026-01-01',re.MULTILINE)
        assert actual==['2026-12-31'],actual
        print('Small public regex example passed; full edge coverage NOT established')
    elif task=='configure-git-webserver':
        with tempfile.TemporaryDirectory() as tmp:
            def git(*args):subprocess.run(['git',*args],cwd=tmp,check=True,capture_output=True,timeout=30)
            git('clone','/git/server','work')
            work=Path(tmp)/'work'
            (work/'suffice-public-probe.html').write_text('hello world')
            for args in [('add','suffice-public-probe.html'),('-c','user.name=Public check','-c','user.email=check@example.invalid','commit','-m','public deployment check'),('push','origin','HEAD:master')]:
                subprocess.run(['git',*args],cwd=work,check=True,capture_output=True,timeout=30)
            assert urllib.request.urlopen('http://localhost:8080/suffice-public-probe.html',timeout=10).read()==b'hello world'
        print('Local push-to-HTTP flow passed; SSH login is outside the public requirement')
    else:raise ValueError(task)

if __name__=='__main__':check(sys.argv[1])
