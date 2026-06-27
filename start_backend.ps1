$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
Write-Host "Starting JARVIS FastAPI backend on http://localhost:8000"
py -m pip install -r requirements.txt
py run_server.py
