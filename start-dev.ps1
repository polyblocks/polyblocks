# Start Polyblocks dev servers (API + Frontend)
# Run this from the polyblocks root directory
$root = "c:\Users\gamin.DESKTOP-Q0G3AKH\Documents\polymarket_bots\polyblocks\polyblocks"

# 0) Kill any existing node processes from previous runs
Write-Host "Stopping old node processes..." -ForegroundColor Yellow
# Kill only what's on our ports, not ALL node
$ports = @(3001, 3000, 5173)
foreach ($port in $ports) {
    $procId = (netstat -ano | Select-String ":$port " | ForEach-Object { ($_ -split '\s+')[-1] }) | Select-Object -First 1
    if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2
Write-Host "Cleared." -ForegroundColor Green

# 0.5) Build shared packages so new blocks appear in the editor
Write-Host "Building shared packages..." -ForegroundColor Cyan
pnpm -C $root -r --filter @polyblocks/types --filter @polyblocks/engine-core build
Write-Host "Shared packages built." -ForegroundColor Green

# 1) Launch API server in a new window
Write-Host "Starting API server in new window..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList "-NoExit","-Command","cd '$root\apps\api'; npx tsx src/server.ts"

# 2) Poll until port 3001 is listening (simple TCP check — no HTTP needed)
Write-Host "Waiting for API on port 3001..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", 3001)
        $tcp.Close()
        $ready = $true; break
    } catch {
        # not listening yet
    } finally {
        $tcp.Dispose()
    }
    Write-Host "." -NoNewline
}
Write-Host ""

if ($ready) {
    Write-Host "API is running on :3001" -ForegroundColor Green
    Write-Host "Starting frontend..." -ForegroundColor Cyan
    Set-Location "$root\apps\web"
    pnpm run dev
} else {
    Write-Host "API did not respond within 30s - check the API window for errors" -ForegroundColor Red
}
