$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\backend"
$env:PYTHONPATH = (Get-Location).Path

$condaPython = "$env:USERPROFILE\anaconda3\envs\deep_Learning\python.exe"
if (Test-Path $condaPython) {
  $python = $condaPython
} else {
  $python = "python"
}

& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
