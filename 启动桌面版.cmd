@echo off
cd /d "%~dp0"
if exist "release\Lingo-Study-0.6.0-Windows.exe" (
  start "" "release\Lingo-Study-0.6.0-Windows.exe"
  exit /b
)
if exist "release\win-unpacked\Lingo伴学.exe" (
  start "" "release\win-unpacked\Lingo伴学.exe"
  exit /b
)
call npm run desktop
if errorlevel 1 pause
