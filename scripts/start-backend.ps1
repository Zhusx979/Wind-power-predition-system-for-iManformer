$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\backend"
$env:PYTHONPATH = (Get-Location).Path

$envFile = Join-Path (Get-Location) ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }
    $name, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim().Trim('"').Trim("'"), "Process")
  }
}

$condaPython = "$env:USERPROFILE\anaconda3\envs\deep_Learning\python.exe"
if (Test-Path $condaPython) {
  $python = $condaPython
} else {
  $python = "python"
}

& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
