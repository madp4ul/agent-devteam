@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..\..") do set "REPOSITORY_ROOT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%\..") do set "REPOSITORY_PARENT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%") do set "REPOSITORY_NAME=%%~nxI"
set "PROJECT_STATE_ROOT="

if not defined REPOSITORY_ROOT exit /b 2
cd /d "%REPOSITORY_ROOT%"

git status --short >nul
if errorlevel 1 (
  echo.
  echo Error: Git cannot access this checkout as the current Windows account.
  echo Run this reset from a normal, non-elevated terminal owned by the same account as the checkout.
  exit /b 1
)

for /f "usebackq delims=" %%I in (`git config --local --get coordination.projectStateRoot 2^>nul`) do set "PROJECT_STATE_ROOT=%%~fI"
if not defined PROJECT_STATE_ROOT set "PROJECT_STATE_ROOT=%REPOSITORY_PARENT%\%REPOSITORY_NAME%-agent-coordination-state"
set "TASK_WORKSPACE_ROOT=%PROJECT_STATE_ROOT%\task-worktrees"
if /I "%PROJECT_STATE_ROOT%"=="%REPOSITORY_ROOT%" exit /b 2
if /I "%PROJECT_STATE_ROOT%"=="%REPOSITORY_PARENT%" exit /b 2

echo This permanently resets the software-delivery example state:
echo   Project state root: %PROJECT_STATE_ROOT%
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
)

git -C "%REPOSITORY_ROOT%" worktree prune --expire now
if errorlevel 1 exit /b %errorlevel%

if exist "%PROJECT_STATE_ROOT%\" rmdir /s /q "%PROJECT_STATE_ROOT%"
if exist "%PROJECT_STATE_ROOT%\" (
  echo Error: Could not remove the project state root. Stop processes using it and try again.
  exit /b 1
)
git config --local --unset coordination.projectStateRoot >nul 2>&1

echo Software-delivery example state reset successfully.
exit /b 0
