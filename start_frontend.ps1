$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$Root\pwa"
Write-Host "Starting PHOENIX PWA on http://127.0.0.1:5180"
npm install
npm run dev -- --host 127.0.0.1 --port 5180
