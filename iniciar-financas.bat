@echo off
chcp 65001 >nul
title Finanças & Controle de Gastos — Nubank Analytics
cd /d "%~dp0"

echo ==============================================================
echo   FINANCAS ^& CONTROLE DE GASTOS - INICIALIZADOR INTELIGENTE
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
    echo [0/4] Instalando dependencias do projeto pela primeira vez...
    call npm install
)

:: 3. Executa o Launcher Inteligente (Forca Build + Detecta Conflitos de Porta + Aloca Porta Dinamica + Abre Navegador)
call npx tsx server/launcher.ts
pause
