# Package Tracker – Incoming Package Management System

A lightweight web app for tracking incoming packages, managing non-PO items, and automating delivery notifications.

## Features
- Package intake & tracking
- Non-PO item logging
- Email notifications (Gmail integration)
- Automatic backups (SQLite or PostgreSQL)
- Health monitoring endpoint
- Graceful shutdown handling

## Local Setup

```bash
git clone <your-repo-url>
cd package-tracker
npm install
cp .env.example .env
node server.js
```

Visit: http://localhost:3000

## Deployment (Render)

1. Push code to GitHub
2. Create new Render Web Service
3. Connect GitHub repo
4. Set Environment Variables (from .env.example)
5. Deploy!

## Environment Variables

See `.env.example` for required variables.

- **DATABASE_URL**: Leave empty for SQLite (local) or set PostgreSQL connection string (Render)
- **BACKUP_INTERVAL_MINUTES**: Default 15
- **BACKUP_RETENTION_DAYS**: Default 14
- **GMAIL_USER** / **GMAIL_APP_PASSWORD**: For email notifications
- **LOIC_EMAIL**: Recipient email for notifications

## API Endpoints

- `GET /api/health` – Health check (for uptime monitoring)
- `POST /api/packages` – Create package
- `GET /api/packages` – List packages
- `GET /api/config` – Get app configuration

## Database

- **Local**: SQLite (auto-created)
- **Production**: PostgreSQL (Render) - auto-configured
