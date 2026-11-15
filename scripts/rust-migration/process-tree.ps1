param([Parameter(Mandatory=$true)][int]$RootPid)
$all = @(Get-CimInstance Win32_Process)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($RootPid)
do {
  $changed = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true }
  }
} while ($changed)
$rows = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object {
  [pscustomobject]@{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; name=$_.Name; workingSetBytes=[long]$_.WorkingSetSize; privateBytes=[long]$_.PrivatePageCount; cpuTimeMs=([double]$_.KernelModeTime + [double]$_.UserModeTime)/10000 }
})
[pscustomobject]@{ rootPid=$RootPid; processes=$rows; totals=[pscustomobject]@{ workingSetBytes=($rows | Measure-Object workingSetBytes -Sum).Sum; privateBytes=($rows | Measure-Object privateBytes -Sum).Sum; cpuTimeMs=($rows | Measure-Object cpuTimeMs -Sum).Sum } } | ConvertTo-Json -Depth 6 -Compress
