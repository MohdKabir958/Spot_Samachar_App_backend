# Encode Firebase Service Account to Base64 (for Render deployment)

Write-Host "=== Firebase Service Account Base64 Encoder ===" -ForegroundColor Cyan
Write-Host ""

$filePath = ".\spotapp-e918d-firebase-adminsdk-fbsvc-c79a88114e.json"

if (Test-Path $filePath) {
    $json = Get-Content $filePath -Raw
    $base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
    
    Write-Host "✓ File found and encoded!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Copy this base64 string to Render environment variable:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "FIREBASE_SERVICE_ACCOUNT_BASE64=" -NoNewline
    Write-Host $base64 -ForegroundColor White
    Write-Host ""
    
    # Save to file for easy copy
    $base64 | Set-Content "firebase-base64.txt"
    Write-Host "✓ Also saved to: firebase-base64.txt" -ForegroundColor Green
    
} else {
    Write-Host "✗ Error: Firebase service account file not found!" -ForegroundColor Red
    Write-Host "Expected: $filePath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
