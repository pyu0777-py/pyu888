# --- 核心配置 ---
# 【已修正】这里改成了双下划线 __responsive
$targetFolder = "E:\my-new-site\public\__responsive"

# 定义要清理的文件后缀名
$fileExtensions = @("*.jpg", "*.jpeg", "*.png", "*.mp4", "*.mov")

# ---------------- 下面是执行逻辑 ----------------

Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "  Starting Cache Cleanup Tool..." -ForegroundColor Cyan
Write-Host "  Target: $targetFolder" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Cyan

$totalDeletedCount = 0

foreach ($ext in $fileExtensions) {
    # 查找文件
    $files = Get-ChildItem -Path $targetFolder -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
    
    if ($files.Count -gt 0) {
        Write-Host "Found $($files.Count) file(s) with extension '$ext'. Deleting..." -ForegroundColor Yellow
        
        foreach ($file in $files) {
            try {
                Remove-Item $file.FullName -Force
                Write-Host "  [Deleted] $($file.Name)" -ForegroundColor DarkGray
                $totalDeletedCount++
            }
            catch {
                Write-Host "  [Failed] Could not delete $($file.Name). It might be in use." -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Cyan
if ($totalDeletedCount -eq 0) {
    Write-Host "Cleanup Complete. No matching cache files found." -ForegroundColor Green
} else {
    Write-Host "Cleanup Complete! Successfully deleted $totalDeletedCount file(s)." -ForegroundColor Green
}
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host "Tip: If using 'astro dev', changes should reflect automatically." -ForegroundColor Gray