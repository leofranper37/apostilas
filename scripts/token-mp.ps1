# Salva o Access Token do Mercado Pago no servidor e publica as funções do Pix.
# Uso (no terminal, nesta pasta): powershell -ExecutionPolicy Bypass -File scripts\token-mp.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host ""
Write-Host "1) No site do Mercado Pago: Producao > Credenciais de producao > copie o ACCESS TOKEN." -ForegroundColor Cyan
Write-Host "2) Volte aqui, clique com o botao direito para colar e aperte Enter." -ForegroundColor Cyan
Write-Host ""
while ($true) {
  $t = (Read-Host "Cole o Access Token aqui").Trim() -replace '^Bearer\s+', ''
  if ($t -match '^TEST-') { Write-Host "Esse e o token de TESTE. Copie o da aba PRODUCAO (comeca com APP_USR-)." -ForegroundColor Yellow; continue }
  if ($t -notmatch '^APP_USR-\S+$') { Write-Host "Isso nao parece o Access Token (ele comeca com APP_USR- e nao tem espacos). Copie de novo." -ForegroundColor Yellow; continue }
  if ($t.Length -lt 60) { Write-Host "Esse codigo e curto demais: deve ser a Public Key. Copie o ACCESS TOKEN." -ForegroundColor Yellow; continue }
  break
}
Write-Host "Token conferido ($($t.Length) caracteres). Salvando no servidor..." -ForegroundColor Green
$t | firebase functions:secrets:set MP_ACCESS_TOKEN --data-file -
if ($LASTEXITCODE -ne 0) { Write-Host "Nao consegui salvar o token. Mande um print desta tela." -ForegroundColor Red; exit 1 }
Write-Host "Publicando as funcoes do Pix (leva uns 2 minutos)..." -ForegroundColor Green
firebase deploy --only functions:criarPix,functions:conferirPix,functions:avisoMercadoPago
if ($LASTEXITCODE -ne 0) { Write-Host "A publicacao falhou. Mande um print desta tela." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "PRONTO! Agora teste no app: Ctrl+Shift+R > Comprar > Pagar com Pix." -ForegroundColor Green
