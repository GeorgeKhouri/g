@echo off
REM Quick setup for GitHub and Render deployment on Windows

echo === Package Tracker GitHub Setup ===
echo.
echo Prerequisites:
echo - GitHub account (https://github.com)
echo - Git installed on your computer (https://git-scm.com)
echo - Render account (https://render.com, sign in with GitHub)
echo.

set /p github_user="Enter your GitHub username: "
set /p git_email="Enter your email (for Git commits): "

echo.
echo Step 1: Initialize Git repository...
git config user.email "%git_email%"
git config user.name "%github_user%"
git init
git add .
git commit -m "Initial commit: package tracker with PostgreSQL and Render deployment"

echo.
echo Step 2: Create GitHub repository...
echo Go to https://github.com/new and create a repository named 'package-tracker'
pause

set /p repo_url="Enter your GitHub repository URL (e.g., https://github.com/your-username/package-tracker.git): "

echo.
echo Adding remote origin...
git remote add origin "%repo_url%"
git branch -M main
git push -u origin main

echo.
echo Step 3: Deploy on Render...
echo Go to https://dashboard.render.com
echo 1. Click 'New +' ^> 'Web Service'
echo 2. Select 'package-tracker' repository
echo 3. Use these settings:
echo    - Name: package-tracker
echo    - Runtime: Node
echo    - Build Command: npm install
echo    - Start Command: node server.js
echo    - Plan: Free
echo.
echo 4. Add environment variables in Render dashboard:
echo    - NODE_ENV=production
echo    - GMAIL_USER=your-email@gmail.com
echo    - GMAIL_APP_PASSWORD=your-app-password (Gmail app password)
echo    - LOIC_EMAIL=recipient@example.com
echo    - BACKUP_INTERVAL_MINUTES=15
echo    - BACKUP_RETENTION_DAYS=14
echo.
echo 5. Click 'Create Web Service'
echo 6. Render will provision PostgreSQL automatically
echo.

echo === Setup Complete ===
echo.
echo Your app will be available at: https://package-tracker.onrender.com
echo.
echo For future deployments, just push to GitHub:
echo   git push origin main
echo.
echo Render will automatically redeploy on every push!
pause
