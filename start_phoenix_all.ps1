$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "cd `"$Root`"; py -m pip install -r requirements.txt; py run_server.py"
)

Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "cd `"$Root\pwa`"; npm install; npm run dev -- --host 127.0.0.1 --port 5180"
)

Write-Host "Opened backend + frontend terminals."
Write-Host "Open: http://127.0.0.1:5180/"
