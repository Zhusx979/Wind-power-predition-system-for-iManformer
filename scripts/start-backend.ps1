$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\backend"
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
