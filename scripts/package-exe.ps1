$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$venv = Join-Path $root ".release-venv"
$python = Join-Path $venv "Scripts\python.exe"
$exe = Join-Path $root "release\YufengForecast.exe"
$pipIndexUrl = $env:PIP_INDEX_URL
$trustedHostArgs = @()

if (-not $pipIndexUrl) {
  $pipIndexUrl = "https://pypi.tuna.tsinghua.edu.cn/simple"
  $trustedHostArgs = @("--trusted-host", "pypi.tuna.tsinghua.edu.cn")
}

function Invoke-Checked {
  param(
    [scriptblock]$Command,
    [string]$ErrorMessage
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

function Stop-RunningReleaseProcess {
  param(
    [string]$ExecutablePath
  )

  $targetPath = [System.IO.Path]::GetFullPath($ExecutablePath)
  $running = Get-Process -Name "YufengForecast" -ErrorAction SilentlyContinue | Where-Object {
    try {
      $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -eq $targetPath)
    } catch {
      $false
    }
  }

  if ($running) {
    Write-Host "Stopping running release exe before packaging..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
  }
}

function Wait-ForUnlockedFile {
  param(
    [string]$Path,
    [int]$TimeoutSeconds = 10
  )

  if (-not (Test-Path $Path)) {
    return
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $stream = [System.IO.File]::Open($Path, "Open", "ReadWrite", "None")
      $stream.Close()
      return
    } catch [System.IO.IOException] {
    } catch [System.UnauthorizedAccessException] {
    }

    Start-Sleep -Milliseconds 300
  }

  throw "The existing exe is still locked. Close YufengForecast.exe and try again."
}

Set-Location $root

Stop-RunningReleaseProcess -ExecutablePath $exe
Wait-ForUnlockedFile -Path $exe

if (-not (Test-Path $python)) {
  Invoke-Checked { python -m venv $venv } "Failed to create .release-venv."
}

Invoke-Checked { & $python -m pip install --index-url $pipIndexUrl @trustedHostArgs --upgrade pip } "Failed to upgrade pip."
Invoke-Checked { & $python -m pip install --index-url $pipIndexUrl @trustedHostArgs -r "backend\requirements.txt" pyinstaller } "Failed to install backend dependencies or PyInstaller."

Set-Location (Join-Path $root "frontend")
Invoke-Checked { npm.cmd run build } "Frontend build failed."

Set-Location (Join-Path $root "backend")
Invoke-Checked {
  & $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name "YufengForecast" `
    --paths "." `
    --distpath (Join-Path $root "release") `
    --workpath (Join-Path $root "build\pyinstaller") `
    --add-data "..\frontend\dist;frontend\dist" `
    --add-data "..\data;data" `
    --add-data ".env;backend" `
    "run_app.py"
} "PyInstaller packaging failed."

if (-not (Test-Path $exe)) {
  throw "PyInstaller finished, but the expected exe was not found."
}

Write-Host ""
Write-Host "EXE created:"
Write-Host $exe
