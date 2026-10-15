import subprocess
r=subprocess.run(['wsl.exe','-d','Ubuntu','--','sh','-c','ls -t /home/mohammed/.npm/_logs/* | head -n 3 | xargs -r tail -n 3'],capture_output=True,text=True)
print(r.stdout[-2000:]);print(r.stderr[-1000:])
