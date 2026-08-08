@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..\..") do set "REPOSITORY_ROOT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%\..") do set "REPOSITORY_PARENT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%") do set "REPOSITORY_NAME=%%~nxI"
set "DATABASE_PATH=%REPOSITORY_ROOT%\.data\software-delivery-example.sqlite3"
set "TASK_WORKSPACE_ROOT=%REPOSITORY_PARENT%\%REPOSITORY_NAME%-software-delivery-example-workspaces"

if not defined REPOSITORY_ROOT exit /b 2
if not defined TASK_WORKSPACE_ROOT exit /b 2
if /I "%TASK_WORKSPACE_ROOT%"=="%REPOSITORY_ROOT%" exit /b 2

cd /d "%REPOSITORY_ROOT%"

git status --short >nul
if errorlevel 1 (
  echo.
  echo Error: Git cannot access this checkout as the current Windows account.
  echo Run this reset from a normal, non-elevated terminal owned by the same account as the checkout.
  exit /b 1
)

echo This permanently resets the software-delivery example state:
echo   Database:  %DATABASE_PATH%
echo   Worktrees: %TASK_WORKSPACE_ROOT%
echo.
echo Stop the example application before continuing.

if /I not "%~1"=="--yes" (
  set "CONFIRMATION="
  set /p "CONFIRMATION=Type RESET to continue: "
  if /I not "!CONFIRMATION!"=="RESET" (
    echo Reset cancelled. Nothing was deleted.
    exit /b 0
  )
)

if exist "%TASK_WORKSPACE_ROOT%\" (
  for /d %%D in ("%TASK_WORKSPACE_ROOT%\*") do (
    git -C "%REPOSITORY_ROOT%" worktree remove --force "%%~fD" >nul 2>&1
  )
  rmdir /s /q "%TASK_WORKSPACE_ROOT%"
  if exist "%TASK_WORKSPACE_ROOT%\" (
    echo Error: Could not remove task workspaces. Stop processes using them and try again.
    exit /b 1
  )
)

git -C "%REPOSITORY_ROOT%" worktree prune --expire now
if errorlevel 1 exit /b %errorlevel%

for %%F in ("%DATABASE_PATH%" "%DATABASE_PATH%-shm" "%DATABASE_PATH%-wal") do (
  if exist "%%~fF" del /f /q "%%~fF"
  if exist "%%~fF" (
    echo Error: Could not remove %%~fF. Stop the example application and try again.
    exit /b 1
  )
)

echo Software-delivery example state reset successfully.
exit /b 0
