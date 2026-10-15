"""Launch a distinct durable Sonion Windows ScheduledTask. No Linux nohup."""
import base64,json,pathlib,subprocess
name='SufficeLunaSafeguardsV1'
script=r"""
$ErrorActionPreference = 'Stop'
$taskName = 'SufficeLunaSafeguardsV1'
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\wsl.exe' -Argument '-d Ubuntu -- taskset -c 0,1 nice -n 10 /home/eric_qin/suffice-general-runtime/bin/node /home/eric_qin/suffice-field-v1/experiments/luna-safeguards-v1/driver.mjs'
$principal = New-ScheduledTaskPrincipal -UserId 'SONION\Eric Qin' -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State | ConvertTo-Json -Compress
"""
encoded=base64.b64encode(script.encode('utf-16le')).decode()
r=subprocess.run(['C:/Windows/System32/OpenSSH/ssh.exe','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','sonion','powershell.exe -NoProfile -NonInteractive -EncodedCommand '+encoded],capture_output=True,text=True,timeout=60)
print(r.stdout);print(r.stderr)
raise SystemExit(r.returncode)
