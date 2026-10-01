param([switch]$Publish)
$ErrorActionPreference="Stop"
$Project="D:\gpt\Pulso 90"
$Deploy=Join-Path $Project "deploy-pages"
$Engine=Join-Path $Deploy "games-engine"
$Tests=Join-Path $Project "tests"
$ConfigPath=Join-Path $Deploy "runtime-config.json"
$Cloudflared="C:\Program Files (x86)\cloudflared\cloudflared.exe"
$Port=19011
New-Item -ItemType Directory -Force -Path $Tests | Out-Null

function Test-Health([string]$Base){
  if([string]::IsNullOrWhiteSpace($Base)){return $false}
  try{
    $r=Invoke-WebRequest -UseBasicParsing -Uri ($Base.TrimEnd("/")+"/api/lab/health") -TimeoutSec 8
    if($r.StatusCode -ne 200){return $false}
    $j=$r.Content|ConvertFrom-Json
    return [bool]($j.ok -eq $true -and $j.mode -eq "DEMO_ONLY")
  }catch{return $false}
}

function Ensure-Rgs{
  if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){return}
  $out=Join-Path $Tests "rgs-auto.out.log"
  $err=Join-Path $Tests "rgs-auto.err.log"
  $secureLauncher=Join-Path $Deploy "ops\start-rgs-secure.py"
  if(Test-Path $secureLauncher){
    Start-Process -FilePath "python" -WorkingDirectory $Deploy -ArgumentList $secureLauncher -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden | Out-Null
  }else{
    Start-Process -FilePath "node" -WorkingDirectory $Engine -ArgumentList "rgs-demo.mjs" -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden | Out-Null
  }
  for($i=0;$i -lt 20;$i++){
    Start-Sleep -Milliseconds 500
    if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){return}
  }
  throw "RGS did not start on port $Port"
}

function Start-QuickTunnel{
  if(!(Test-Path $Cloudflared)){throw "cloudflared not found"}
  $stamp=Get-Date -Format "yyyyMMdd-HHmmss"
  $out=Join-Path $Tests ("cloudflared-auto-"+$stamp+".out.log")
  $err=Join-Path $Tests ("cloudflared-auto-"+$stamp+".err.log")
  Start-Process -FilePath $Cloudflared -ArgumentList "tunnel","--url","http://127.0.0.1:$Port","--no-autoupdate" -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden | Out-Null
  for($i=0;$i -lt 40;$i++){
    Start-Sleep -Milliseconds 500
    $txt=""
    if(Test-Path $out){$txt+=(Get-Content $out -Raw -ErrorAction SilentlyContinue)}
    if(Test-Path $err){$txt+=(Get-Content $err -Raw -ErrorAction SilentlyContinue)}
    $m=[regex]::Match($txt,'https://[a-z0-9-]+\.trycloudflare\.com')
    if($m.Success){
      $url=$m.Value
      for($j=0;$j -lt 20;$j++){
        if(Test-Health $url){return $url}
        Start-Sleep -Seconds 1
      }
      throw "Tunnel health failed: $url"
    }
  }
  throw "Quick Tunnel URL not discovered"
}

Ensure-Rgs
$current=$null
if(Test-Path $ConfigPath){try{$current=Get-Content $ConfigPath -Raw|ConvertFrom-Json}catch{}}
$currentBase=if($current){[string]$current.rgs_base}else{""}

if(Test-Health $currentBase){
  Write-Output ("PULSO90_RUNTIME_OK="+$currentBase)
  exit 0
}

$newBase=Start-QuickTunnel
$cfg=[ordered]@{
  updated_at=(Get-Date).ToString("o")
  mode="DEMO_ONLY"
  rgs_base=$newBase
  health_path="/api/lab/health"
  fallback="local_same_origin"
}
$cfg|ConvertTo-Json|Set-Content -Path $ConfigPath -Encoding UTF8
Write-Output ("PULSO90_RUNTIME_UPDATED="+$newBase)

if($Publish){
  Push-Location $Deploy
  try{
    git add runtime-config.json
    git diff --cached --quiet
    if($LASTEXITCODE -ne 0){
      git commit -m ("Update Pulso 90 runtime endpoint "+(Get-Date -Format "yyyy-MM-dd HH:mm"))
      if($LASTEXITCODE -ne 0){throw "git commit failed"}
      git push origin main
      if($LASTEXITCODE -ne 0){throw "git push failed"}
      Write-Output "PULSO90_RUNTIME_PUBLISHED=1"
    }else{Write-Output "PULSO90_RUNTIME_PUBLISHED=NO_CHANGE"}
  }finally{Pop-Location}
}
