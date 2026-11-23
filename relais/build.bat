@echo off
cd /d "%~dp0"
if exist PhoenixRelais.exe del PhoenixRelais.exe
echo Construction en cours...
.\node.exe --experimental-sea-config sea-config.json
if errorlevel 1 goto echec
copy /Y node.exe PhoenixRelais.exe >nul
.\node.exe node_modules\postject\dist\cli.js PhoenixRelais.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto echec
echo.
echo CONSTRUCTION REUSSIE : PhoenixRelais.exe est pret.
goto fin
:echec
echo.
echo ECHEC : la construction ne sest pas terminee. Copiez ce message.
:fin
pause
