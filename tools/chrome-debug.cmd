@echo off
REM Chrome ייעודי לדיבוג — פרופיל נפרד, פורט 9222, התוסף נטען מהריפו.
REM Chrome 151 חוסם דיבוג על הפרופיל הראשי, ולכן פרופיל נפרד. הפרופיל הראשי לא נפגע.
setlocal
set "REPO=%~dp0.."
set "EXT=%REPO%\extension"
set "PROFILE=%LOCALAPPDATA%\banks-debug-profile"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
echo profile : %PROFILE%
echo extension: %EXT%
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check chrome://extensions
endlocal
