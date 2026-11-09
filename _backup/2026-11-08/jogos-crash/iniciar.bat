@echo off
chcp 65001 >nul
title Lucky Charm Demo
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

echo.
echo  Iniciando o Lucky Charm Demo... o navegador vai abrir sozinho.
echo  Deixe esta janela aberta enquanto joga. Feche para parar.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
echo.
pause
