@echo off
title Package Tracker
echo.
echo  Starting Package Tracker...
echo  Open your browser to: http://localhost:3000
echo  (Press Ctrl+C to stop)
echo.
cd /d "%~dp0"
node server.js
pause
