param(
 [Parameter(Mandatory=$true,Position=0)][string]$NodePath,
 [Parameter(Mandatory=$true,Position=1)][string]$Fixture,
 [Parameter(Mandatory=$true,Position=2)][string]$Baseline,
 [Parameter(Mandatory=$true,Position=3)][string]$Candidate,
 [Parameter(Mandatory=$true,Position=4)][string]$AddonBinary,
 [Parameter(Mandatory=$true,Position=5)][ValidateSet('baseline','addon')][string]$Mode
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 or later is required for ProcessStartInfo.ArgumentList.'}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AddonMeasure {
 [StructLayout(LayoutKind.Sequential)] public struct Counters { public uint cb,PageFaultCount; public UIntPtr PeakWorkingSetSize,WorkingSetSize,QuotaPeakPagedPoolUsage,QuotaPagedPoolUsage,QuotaPeakNonPagedPoolUsage,QuotaNonPagedPoolUsage,PagefileUsage,PeakPagefileUsage,PrivateUsage; }
 [StructLayout(LayoutKind.Sequential)] public struct FileTime { public uint low,high; public ulong Value {get {return ((ulong)high << 32) | low;}} }
 [DllImport("psapi.dll", SetLastError=true)] public static extern bool GetProcessMemoryInfo(IntPtr p, ref Counters c, uint size);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessTimes(IntPtr p,out FileTime creation,out FileTime exit,out FileTime kernel,out FileTime user);
}
"@
$node=(Resolve-Path -LiteralPath $NodePath).Path
$fixturePath=(Resolve-Path -LiteralPath $Fixture).Path
$base=(Resolve-Path -LiteralPath $Baseline).Path
$candidatePath=(Resolve-Path -LiteralPath $Candidate).Path
$addon=(Resolve-Path -LiteralPath $AddonBinary).Path
$script=Join-Path $PSScriptRoot 'measure-addon.mjs'
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$node;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
foreach($arg in @($script,'--child',$fixturePath,$base,$candidatePath,$addon,$Mode)){$info.ArgumentList.Add($arg)}
$p=[Diagnostics.Process]::new();$p.StartInfo=$info;$clock=[Diagnostics.Stopwatch]::StartNew()
if(-not $p.Start()){throw 'Node child failed to start'}
$handle=$p.Handle;$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(120000)){try{$p.Kill($true)}catch{};throw 'Node child exceeded 120 seconds'}
$clock.Stop();[void]$stdout.Wait();[void]$stderr.Wait()
$c=[AddonMeasure+Counters]::new();$c.cb=[uint32][Runtime.InteropServices.Marshal]::SizeOf($c)
if(-not [AddonMeasure]::GetProcessMemoryInfo($handle,[ref]$c,$c.cb)){throw "GetProcessMemoryInfo failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"}
$creation=[AddonMeasure+FileTime]::new();$exit=[AddonMeasure+FileTime]::new();$kernel=[AddonMeasure+FileTime]::new();$user=[AddonMeasure+FileTime]::new()
if(-not [AddonMeasure]::GetProcessTimes($handle,[ref]$creation,[ref]$exit,[ref]$kernel,[ref]$user)){throw "GetProcessTimes failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"}
if($p.ExitCode -ne 0){throw "Node child exit $($p.ExitCode): $($stderr.Result)"}
$child=ConvertFrom-Json -InputObject $stdout.Result
[pscustomobject]@{mode=$Mode;nodePath=$node;exitCode=$p.ExitCode;wallMs=$clock.Elapsed.TotalMilliseconds;cpuMs=($kernel.Value+$user.Value)/10000;peakWorkingSetBytes=$c.PeakWorkingSetSize.ToUInt64();peakPagefileUsageBytes=$c.PeakPagefileUsage.ToUInt64();metric='PROCESS_MEMORY_COUNTERS_EX on retained Node process handle after exit; peak working set and peak pagefile usage; process CPU from GetProcessTimes';child=$child;stderr=$stderr.Result} | ConvertTo-Json -Depth 20 -Compress
$p.Dispose()
