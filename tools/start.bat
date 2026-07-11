@echo off
echo.
echo  ====================================
echo   SportFun Portaal — Lokale server
echo  ====================================
echo.
echo  Open je browser en ga naar:
echo  http://localhost:8181
echo.
echo  Druk Ctrl+C om de server te stoppen.
echo.
cd /d "%~dp0"
python server.py
pause
