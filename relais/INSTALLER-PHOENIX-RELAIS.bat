@echo off
chcp 65001 >nul
title Phoenix Relais - installation
setlocal enabledelayedexpansion

rem ================================================================
rem  Phoenix Relais : installe le petit serveur qui relie la caisse
rem  aux imprimantes. A lancer UNE fois sur le PC du restaurant
rem  (double-clic). Il se relance ensuite tout seul a chaque demarrage.
rem ================================================================

set "DOSSIER=%LOCALAPPDATA%\PhoenixRelais"
set "SRC=https://schoenaersb-crypto.github.io/phoenix-dashboard/relais/phoenix_relais.py"
if not exist "%DOSSIER%" mkdir "%DOSSIER%"

echo.
echo  [1/5] Recherche de Python...
set "PY="
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe" "%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe" "%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe" "%ProgramFiles%\Python313\pythonw.exe" "%ProgramFiles%\Python312\pythonw.exe") do (
  if exist %%P if not defined PY set "PY=%%~P"
)
if not defined PY (
  where pythonw >nul 2>nul && for /f "delims=" %%W in ('where pythonw') do if not defined PY set "PY=%%W"
)
if defined PY echo !PY! | find /i "WindowsApps" >nul && set "PY="
if not defined PY (
  echo        Python absent : installation automatique ^(2-3 minutes^)...
  winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
  if exist "%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"
)
if not defined PY (
  echo.
  echo  PROBLEME : Python n'a pas pu s'installer tout seul.
  echo  Ouvre le Microsoft Store, cherche "Python 3.12", installe-le,
  echo  puis relance ce fichier.
  pause
  exit /b 1
)
echo        OK : !PY!

echo  [2/5] Telechargement du programme...
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing '%SRC%' -OutFile '%DOSSIER%\phoenix_relais.py'; exit 0}catch{exit 1}"
if errorlevel 1 (
  if exist "%~dp0phoenix_relais.py" (copy /y "%~dp0phoenix_relais.py" "%DOSSIER%\phoenix_relais.py" >nul) else (
    echo  PROBLEME : pas d'internet et pas de copie locale. & pause & exit /b 1 )
)
echo        OK

echo  [3/5] Lanceur automatique...
> "%DOSSIER%\demarrer.bat" (
  echo @echo off
  echo cd /d "%DOSSIER%"
  echo powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing '%SRC%' -OutFile 'phoenix_relais.new'; Move-Item -Force 'phoenix_relais.new' 'phoenix_relais.py'}catch{}"
  echo start "" "!PY!" "%DOSSIER%\phoenix_relais.py"
)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Phoenix Relais.vbs" (
  echo CreateObject^("WScript.Shell"^).Run """%DOSSIER%\demarrer.bat""", 0, False
)
echo        OK : il demarrera tout seul a chaque allumage du PC

echo  [4/5] Ouverture du pare-feu Windows (une fenetre peut demander "Oui")...
powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList 'advfirewall firewall add rule name=\"Phoenix Relais\" dir=in action=allow protocol=TCP localport=8080 profile=any'" 2>nul
echo        OK

echo  [5/5] Demarrage...
taskkill /f /fi "WINDOWTITLE eq Phoenix Relais*" >nul 2>nul
wscript "%STARTUP%\Phoenix Relais.vbs"
timeout /t 6 /nobreak >nul
start "" "http://localhost:8080/reglages"

echo.
echo  ================================================================
echo   C'EST INSTALLE.
echo   La page de reglage vient de s'ouvrir dans le navigateur :
echo   choisis l'imprimante Cuisine et l'imprimante Bar, touche "Test",
echo   puis "Enregistrer".
echo   L'adresse a ouvrir sur les tablettes est ecrite en haut de la page.
echo  ================================================================
pause
