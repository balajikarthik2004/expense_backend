# Registers the weekly backup as a Windows Scheduled Task.
#
#   powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup.ps1
#
# Use this if the project is not on GitHub. Note the tradeoff: this only runs
# when the machine is on. -StartWhenAvailable catches up after a missed window
# once the machine is back, but a laptop that stays off for a fortnight simply
# misses those backups. The GitHub Actions workflow does not have that problem.

param(
    [string]$TaskName = "ExpenseWeeklyMongoBackup",
    [string]$DayOfWeek = "Sunday",
    [string]$At = "02:30"
)

$ErrorActionPreference = "Stop"

$backendPath = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $backendPath "backups"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$node = (Get-Command node).Source
if (-not $node) { throw "node not found on PATH" }

# Output is appended to a log file: a scheduled task runs with no console, so
# without this a failure leaves nothing to read afterwards.
$logFile = Join-Path $logDir "weekly-backup.log"
$command = "& '$node' '$backendPath\scripts\backup-to-cluster.js' *>> '$logFile'"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`"" `
    -WorkingDirectory $backendPath

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $At

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Replaced existing task '$TaskName'."
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Weekly verified MongoDB snapshot to the Atlas backup cluster" | Out-Null

Write-Host "Registered '$TaskName': every $DayOfWeek at $At"
Write-Host "Log: $logFile"
Write-Host ""
Write-Host "Run it now to confirm:  Start-ScheduledTask -TaskName $TaskName"
Write-Host "Check the result:       Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Host "Remove it:              Unregister-ScheduledTask -TaskName $TaskName"
