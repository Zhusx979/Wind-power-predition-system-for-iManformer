$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\backend"
$env:PYTHONPATH = (Get-Location).Path

function Test-PythonUsable {
  param(
    [string]$Candidate,
    [string[]]$PrefixArgs = @(),
    [bool]$MustExist = $true
  )

  if ($MustExist -and -not (Test-Path $Candidate)) {
    return $false
  }

  try {
    & $Candidate @PrefixArgs -c "import uvicorn" *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-PythonCommand {
  $candidates = @()

  if ($env:VIRTUAL_ENV) {
    $candidates += [PSCustomObject]@{
      Description = "active virtual environment"
      Executable  = (Join-Path $env:VIRTUAL_ENV "Scripts\python.exe")
      PrefixArgs  = @()
      MustExist   = $true
    }
  }

  if ($env:CONDA_PREFIX) {
    $candidates += [PSCustomObject]@{
      Description = "active conda environment"
      Executable  = (Join-Path $env:CONDA_PREFIX "python.exe")
      PrefixArgs  = @()
      MustExist   = $true
    }
  }

  $candidates += [PSCustomObject]@{
    Description = "project .venv"
    Executable  = (Join-Path "$PSScriptRoot\.." ".venv\Scripts\python.exe")
    PrefixArgs  = @()
    MustExist   = $true
  }

  $candidates += [PSCustomObject]@{
    Description = "python from PATH"
    Executable  = "python"
    PrefixArgs  = @()
    MustExist   = $false
  }

  $candidates += [PSCustomObject]@{
    Description = "Python launcher"
    Executable  = "py"
    PrefixArgs  = @("-3")
    MustExist   = $false
  }

  foreach ($candidate in $candidates) {
    if (Test-PythonUsable $candidate.Executable $candidate.PrefixArgs $candidate.MustExist) {
      return $candidate
    }
  }

  throw "No usable Python environment with uvicorn was found. Activate a Python environment and run 'pip install -r backend\requirements.txt'."
}

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

$python = Resolve-PythonCommand
Write-Host "Using Python from $($python.Description): $($python.Executable)"

& $python.Executable @($python.PrefixArgs + @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"))
