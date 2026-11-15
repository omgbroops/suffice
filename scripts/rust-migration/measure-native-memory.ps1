param([Parameter(Mandatory=$true)][string]$Binary, [Parameter(Mandatory=$true)][string]$Fixture)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ProcessPeak {
 [StructLayout(LayoutKind.Sequential)] public struct Counters { public uint cb,PageFaultCount; public UIntPtr PeakWorkingSetSize,WorkingSetSize,QuotaPeakPagedPoolUsage,QuotaPagedPoolUsage,QuotaPeakNonPagedPoolUsage,QuotaNonPagedPoolUsage,PagefileUsage,PeakPagefileUsage,PrivateUsage; }
 [DllImport("psapi.dll", SetLastError=true)] public static extern bool GetProcessMemoryInfo(IntPtr process, ref Counters counters, uint size);
}
"@
$binaryPath=(Resolve-Path -LiteralPath $Binary).Path
$fixturePath=(Resolve-Path -LiteralPath $Fixture).Path
$start=[System.Diagnostics.ProcessStartInfo]::new()
$start.FileName=$binaryPath
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.ArgumentList.Add('--protocol=1')
$start.ArgumentList.Add($fixturePath)
$p=[System.Diagnostics.Process]::new();$p.StartInfo=$start
if(-not $p.Start()){throw 'Failed to start helper'}
$handle=$p.Handle
$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(30000)){try{$p.Kill()}catch{};throw 'Helper timed out'}
[void]$out.Wait();[void]$err.Wait()
$c=[ProcessPeak+Counters]::new();$c.cb=[uint32][Runtime.InteropServices.Marshal]::SizeOf($c)
if(-not [ProcessPeak]::GetProcessMemoryInfo($handle,[ref]$c,$c.cb)){throw "GetProcessMemoryInfo on retained handle failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"}
if($p.ExitCode -ne 0){throw "Helper exit $($p.ExitCode): $($err.Result)"}
$paths=ConvertFrom-Json -InputObject $out.Result
[pscustomobject]@{metric='PROCESS_MEMORY_COUNTERS_EX.PeakWorkingSetSize, retained helper process handle, queried after exit; helper process only';peakWorkingSetBytes=$c.PeakWorkingSetSize.ToUInt64();outputCount=@($paths).Count;exitCode=$p.ExitCode;pass=($c.PeakWorkingSetSize.ToUInt64() -le 16MB)} | ConvertTo-Json -Compress
$p.Dispose()
