"""Offline positive/negative checker fixtures; no models or private cases."""
import csv
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

class PublicChecks(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        path=Path(__file__).with_name('calibration-public-check.py')
        spec=importlib.util.spec_from_file_location('calibration_checks',path);self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.m.APP=Path(self.folder.name);self.m.DATA=self.m.APP

    def test_logs_preserve_date_and_severity_contract(self):
        (self.m.APP/'logs').mkdir()
        rows=[[p,s,0] for p in ['today','last_7_days','last_30_days','month_to_date','total'] for s in ['ERROR','WARNING','INFO']]
        (self.m.DATA/'logs.json').write_text(json.dumps({'inputHashes':{},'rows':rows}))
        with (self.m.APP/'summary.csv').open('w',newline='') as f:
            writer=csv.writer(f);writer.writerow(['period','severity','count']);writer.writerows(rows)
        self.m.logs()
        p=self.m.APP/'summary.csv';p.write_text(p.read_text().replace('today,ERROR,0','today,ERROR,1'))
        with self.assertRaises(AssertionError):self.m.logs()

    def test_html_check_detects_safe_format_loss_and_unsafe_noop(self):
        script=self.m.APP/'filter.py'
        script.write_text("import pathlib,re,sys\np=pathlib.Path(sys.argv[1]);s=p.read_text();s=re.sub(r'<script>.*?</script>','',s);s=re.sub(r' onclick=\"[^\"]*\"','',s);s=re.sub(r' href=\"javascript:[^\"]*\"','',s);p.write_text(s)\n")
        self.m.html_filter()
        script.write_text('pass\n')
        with self.assertRaises(AssertionError):self.m.html_filter()
        script.write_text("import pathlib,sys\np=pathlib.Path(sys.argv[1]);p.write_text(p.read_text().strip())\n")
        with self.assertRaises(AssertionError):self.m.html_filter()

    def test_wal_checks_json_against_sqlite_not_only_shape(self):
        rows=[{'id':i,'name':f'item{i}','value':i*7} for i in range(1,12)]
        with closing(sqlite3.connect(self.m.APP/'main.db')) as c:
            with c:
                c.execute('CREATE TABLE items(id INTEGER PRIMARY KEY,name TEXT,value INTEGER)')
                c.executemany('INSERT INTO items VALUES(:id,:name,:value)',rows)
        p=self.m.APP/'recovered.json';p.write_text(json.dumps(rows));self.m.wal()
        rows[-1]['value']+=1;p.write_text(json.dumps(rows))
        with self.assertRaises(AssertionError):self.m.wal()

if __name__=='__main__':unittest.main()
