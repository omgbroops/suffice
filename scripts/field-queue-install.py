import subprocess,pathlib,sys
root=pathlib.Path(__file__).resolve().parent.parent
ident=sys.argv[1]
p=root/'.suffice/field-campaign-v1/tasks'/ident
linux=lambda p:'/mnt/'+p.drive[0].lower()+'/'+str(p).replace('\\','/')[3:]
command='export PATH=/home/mohammed/suffice-general-runtime/bin:/usr/bin:/bin; cd '+linux(p/'base')+'; npm install '+('--ignore-scripts ' if ident=='q03' else '')+'--no-audit --no-fund'
with (p/'private/install.log').open('wb') as log:
 result=subprocess.run(['wsl.exe','-d','Ubuntu','--','sh','-lc',command],stdout=log,stderr=subprocess.STDOUT)
print(ident,result.returncode);print((p/'private/install.log').read_text(errors='replace')[-1500:])
