switch(process.argv[2]) {
 case 'invalid-json':process.stdout.write('{');break;
 case 'invalid-utf8':process.stdout.write(Buffer.from([0xff]));break;
 case 'duplicate':process.stdout.write('["a","a"]');break;
 case 'conflict':process.stdout.write('["a","a/b"]');break;
 case 'nonzero':process.stdout.write('["a"]');process.exitCode=1;break;
 case 'oversize':process.stdout.write('x'.repeat(1024));setInterval(()=>{},1000);break;
 case 'timeout':setInterval(()=>{},1000);break;
 default:process.exitCode=2;
}
