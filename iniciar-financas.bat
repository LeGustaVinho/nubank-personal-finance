@echo off
chcp 65001 >nul
title Finanças & Controle de Gastos — Nubank Analytics
cd /d "%~dp0"

echo ==============================================================
echo   FINANCAS ^& CONTROLE DE GASTOS - INICIALIZADOR AUTOMATICO
echo ==============================================================
echo.

:: 1. Verifica se o Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado no PATH do sistema.
    pause
    exit /b 1
)

:: 2. Verifica e instala dependencias caso node_modules nao exista
if not exist "node_modules\" (
    echo [1/3] Instalando dependencias do projeto pela primeira vez...
    call npm install
) else (
    echo [1/3] Dependencias verificadas com sucesso!
)

:: 3. Verifica se a interface ja esta rodando na porta 5173
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [2/3] Servidor e Interface Visual ja estao ativos!
    echo [3/3] Abrindo navegador em http://localhost:5173 ...
    start "" "http://localhost:5173"
    timeout /t 3 >nul
    exit /b 0
)

:: 4. Abre o navegador automaticamente apos alguns segundos em paralelo e inicia servidor + web
echo [2/3] Iniciando Servidor Backend (porta 3001) e Interface Web (porta 5173)...
echo [3/3] O navegador abrira automaticamente em instantes em http://localhost:5173
echo       (Mantenha esta janela aberta enquanto estiver usando o sistema)
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"
call npm run dev
pause
