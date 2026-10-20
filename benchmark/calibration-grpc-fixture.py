"""Disposable public gRPC checker fixture, never mounted into an actor."""
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

subprocess.run([sys.executable,'-m','pip','install','--quiet','grpcio==1.73.0','grpcio-tools==1.73.0'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=120)
import grpc
from grpc_tools import protoc

with tempfile.TemporaryDirectory(prefix='grpc-fixture-') as folder:
    root=Path(folder)
    (root/'kv-store.proto').write_text('''syntax = "proto3";
package fixture;
service KVStore { rpc GetVal(GetValRequest) returns(GetValResponse); rpc SetVal(SetValRequest) returns(SetValResponse); }
message GetValRequest { string key=1; }
message GetValResponse { int32 val=1; }
message SetValRequest { string key=1; int32 val=2; }
message SetValResponse { int32 val=1; }
''')
    assert protoc.main(['protoc','-I'+folder,'--python_out='+folder,'--grpc_python_out='+folder,str(root/'kv-store.proto')])==0
    (root/'server.py').write_text('# Disposable public checker fixture; not an actor deliverable.\n')
    sys.path.insert(0,folder)
    import kv_store_pb2 as pb
    import kv_store_pb2_grpc as rpc
    class Store(rpc.KVStoreServicer):
        def __init__(self):self.values={}
        def GetVal(self,r,context):return pb.GetValResponse(val=self.values.get(r.key,0))
        def SetVal(self,r,context):self.values[r.key]=r.val;return pb.SetValResponse(val=r.val)
    server=grpc.server(ThreadPoolExecutor(max_workers=2));rpc.add_KVStoreServicer_to_server(Store(),server)
    assert server.add_insecure_port('localhost:5328')>0;server.start()
    spec=importlib.util.spec_from_file_location('checks','/check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.APP=root
    try:
        m.grpc_store()
        server.stop(0).wait()
        try:m.grpc_store()
        except grpc.FutureTimeoutError:pass
        else:raise AssertionError('A stopped server must not pass')
    finally:server.stop(0).wait()
print(json.dumps({'grpcPositiveFixture':'passed','stoppedServerNegativeFixture':'passed','inference':False}))
