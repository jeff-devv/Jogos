@echo off
chcp 65001 >nul
title Lucky Charm
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao foi encontrado neste computador.
  echo  Baixe a versao LTS em https://nodejs.org , instale,
  echo  FECHE esta janela e de dois cliques em iniciar.bat de novo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\mysql2 (
  echo  Instalando o driver do MySQL, so na primeira vez...
  call npm i mysql2
)

rem Apache + MySQL do XAMPP (ajuste o caminho se o seu for outro)
if exist "C:\xampp\xampp_start.exe" (
  echo  Ligando o Apache e o MySQL...
  start "" "C:\xampp\xampp_start.exe"
  timeout /t 6 >nul
)

echo.
echo  Site:   http://localhost/lucky-charm/public/
echo  Crash:  API do crash rodando nesta janela (porta 3000). Deixe aberta.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost/lucky-charm/public/"
node server.js
echo.
pause
