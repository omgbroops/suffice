"""Visible partial checks derived only from public task text and initial data."""
import csv
from contextlib import closing
import hashlib
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import uuid

APP=Path(os.environ.get('CALIBRATION_CHECK_APP','/app'))
DATA=Path(os.environ.get('CALIBRATION_CHECK_DATA','/public-data'))

def logs():
    contract=json.loads((DATA/'logs.json').read_text())
    for name,digest in contract['inputHashes'].items():
        assert hashlib.sha256((APP/'logs'/name).read_bytes()).hexdigest()==digest,'Input log changed: '+name
    with (APP/'summary.csv').open(newline='') as f:
        reader=csv.DictReader(f);assert reader.fieldnames==['period','severity','count'],'Wrong CSV header';rows=list(reader)
    assert len(rows)==15,'Expected fifteen period/severity rows'
    assert [(r['period'],r['severity'],int(r['count'])) for r in rows]==[tuple(r) for r in contract['rows']],'Severity/date counts differ'

def grpc_store():
    import grpc
    for package in ['grpcio','grpcio-tools']:assert importlib.metadata.version(package)=='1.73.0',package+' must be 1.73.0'
    assert (APP/'kv-store.proto').is_file() and (APP/'server.py').is_file(),'Required deliverable missing'
    sys.path.insert(0,str(APP))
    service=None;module=None
    for path in APP.glob('*_pb2.py'):
        candidate=importlib.import_module(path.stem)
        if 'KVStore' in candidate.DESCRIPTOR.services_by_name:module=candidate;service=candidate.DESCRIPTOR.services_by_name['KVStore'];break
    assert service is not None,'KVStore service missing'
    methods=service.methods_by_name
    assert {'GetVal','SetVal'}<=methods.keys(),'Required RPCs missing'
    get,setter=methods['GetVal'],methods['SetVal']
    assert get.input_type.name=='GetValRequest' and get.output_type.name=='GetValResponse'
    assert setter.input_type.name=='SetValRequest' and setter.output_type.name=='SetValResponse'
    assert 'key' in get.input_type.fields_by_name and 'key' in setter.input_type.fields_by_name
    values=[f for f in setter.input_type.fields if f.name!='key']
    assert len(values)==1 and values[0].type in [3,5,13,17,18],'SetVal needs one integer value field'
    for method in [get,setter]:assert method.output_type.fields_by_name['val'].type in [3,5,13,17,18]
    from google.protobuf.message_factory import GetMessageClass
    with grpc.insecure_channel('localhost:5328') as channel:
        grpc.channel_ready_future(channel).result(timeout=3)
        def rpc(method,**fields):
            request=GetMessageClass(method.input_type)(**fields)
            return channel.unary_unary('/'+service.full_name+'/'+method.name,request_serializer=lambda x:x.SerializeToString(),response_deserializer=GetMessageClass(method.output_type).FromString)(request,timeout=3)
        key='public-check-'+uuid.uuid4().hex
        for number in [42,7]:
            assert rpc(setter,key=key,**{values[0].name:number}).val==number,'SetVal response differs'
            assert rpc(get,key=key).val==number,'GetVal did not retain the value'

def html_filter():
    script=APP/'filter.py';assert script.is_file(),'filter.py missing'
    safe='<html>\n  <h1 class="title">Hello &amp; welcome</h1>\n<table><tr><td data-id="7">Keep me</td></tr></table>\n<a href="https://example.com/a?q=1&amp;b=2" title="keep">Safe</a>\n</html>\n'
    cases=[(safe,lambda x:x==safe,'Safe HTML formatting must stay byte-identical'),
        ('<p>before</p><script>alert(1)</script><p>after</p>',lambda x:x=='<p>before</p><p>after</p>','Remove script, preserve adjacent HTML'),
        ('<div onclick="alert(1)" class="keep">Hello</div>',lambda x:not re.search(r'\bonclick\s*=',x,re.I) and 'class="keep"' in x and '>Hello</div>' in x,'Remove event handler, preserve harmless attribute'),
        ('<a href="javascript:alert(1)">Link</a>',lambda x:'javascript:' not in x.lower() and '>Link</a>' in x,'Remove JavaScript URL, preserve text')]
    with tempfile.TemporaryDirectory(prefix='public-html-') as folder:
        for i,(source,accept,reason) in enumerate(cases):
            path=Path(folder)/f'case-{i}.html';path.write_bytes(source.encode())
            run=subprocess.run([sys.executable,str(script),str(path)],capture_output=True,timeout=8)
            assert run.returncode==0,'Filter command failed: '+run.stderr.decode(errors='replace')[-1000:]
            assert accept(path.read_text()),reason

def wal():
    rows=json.loads((APP/'recovered.json').read_text())
    assert isinstance(rows,list) and len(rows)==11,'Expected eleven recovered records'
    assert [r['id'] for r in rows]==list(range(1,12)),'Records must be sorted by id'
    assert all(set(r)=={'id','name','value'} for r in rows),'Wrong record fields'
    assert all(isinstance(r['name'],str) and isinstance(r['value'],(int,float)) for r in rows),'Wrong value types'
    with tempfile.TemporaryDirectory(prefix='public-wal-') as folder:
        db=Path(folder)/'main.db';shutil.copyfile(APP/'main.db',db)
        if (APP/'main.db-wal').exists():shutil.copyfile(APP/'main.db-wal',Path(str(db)+'-wal'))
        with closing(sqlite3.connect(db)) as connection:
            connection.row_factory=sqlite3.Row
            tables=[r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            candidates=[]
            for table in tables:
                name='"'+table.replace('"','""')+'"'
                fields={r[1] for r in connection.execute('PRAGMA table_info('+name+')')}
                if {'id','name','value'}<=fields:candidates.append(name)
            assert len(candidates)==1,'Expected one recoverable table with id/name/value'
            recovered=[dict(r) for r in connection.execute('SELECT id,name,value FROM '+candidates[0]+' ORDER BY id')]
    assert recovered==rows,'JSON must agree with SQLite after WAL recovery'

CHECKS={'log-summary-date-ranges':logs,'kv-store-grpc':grpc_store,'filter-js-from-html':html_filter,'db-wal-recovery':wal}
if __name__=='__main__':
    try:CHECKS[sys.argv[1]]();print(json.dumps({'status':'passed','coverage':'Visible partial public contracts only; not a correctness certificate.'}))
    except Exception as error:print(json.dumps({'status':'failed','error':str(error)}));sys.exit(1)
