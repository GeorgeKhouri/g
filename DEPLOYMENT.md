# Package Tracker

A reliable, always-accessible incoming package tracking system with automatic backups and zero downtime deployment.

## Features

- **Always Accessible**: Deployed on Render (free tier, auto-restarts on crash)
- **Automatic Backups**: SQLite locally, PostgreSQL in production (15-minute intervals)
- **Health Monitoring**: `/api/health` endpoint for uptime monitoring services
- **Graceful Shutdown**: Clean database closure on server termination
- **Multi-Database**: SQLite for local development, PostgreSQL for production

## Local Development

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/package-tracker.git
   cd package-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your settings:
   # - OUTLOOK_USER and OUTLOOK_APP_PASSWORD for email
   # - LOIC_EMAIL for recipient
   # - Leave DATABASE_URL empty (SQLite will be used)
   ```

4. Run the app:
   ```bash
   npm start
   ```

5. Open browser to `http://localhost:3000`

### Manual Backup

```bash
npm run backup:now
```

Backups are stored in `./backups/` with 14-day retention.

## Deployment on Render

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Create repository named `package-tracker`
3. Push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/package-tracker.git
   git push -u origin main
   ```

### Step 2: Connect to Render

1. Go to https://dashboard.render.com
2. Sign up with GitHub (authorize Render to access your repos)
3. Click "New +" → "Web Service"
4. Select your `package-tracker` repository
5. Configure:
   - **Name**: `package-tracker`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

6. Under "Environment", add:
   ```
   NODE_ENV=production
   OUTLOOK_USER=your-email@vaniercollege.qc.ca
   OUTLOOK_APP_PASSWORD=your-outlook-app-password
   LOIC_EMAIL=recipient@example.com
   BACKUP_INTERVAL_MINUTES=15
   BACKUP_RETENTION_DAYS=14
   ```

7. Click "Create Web Service"

8. Render will add PostgreSQL database automatically and set `DATABASE_URL`

### Step 3: Deploy

Every time you push to GitHub, Render automatically:
- Pulls the latest code
- Installs dependencies
- Restarts the app
- Keeps PostgreSQL database with automatic backups

## Monitoring

### Health Check

Your app exposes a health endpoint:

```bash
curl https://your-app.onrender.com/api/health
# Returns: {"status":"ok","timestamp":"2026-05-12T..."}
```

### Uptime Monitoring

Use a service like **UptimeRobot** (free):

1. Go to https://uptimerobot.com
2. Create Monitor
3. Select "HTTP(s)" type
4. URL: `https://your-app.onrender.com/api/health`
5. Check interval: 5 minutes
6. Get alerts if app goes down

## Database

### Local (SQLite)

- File: `packages.db`
- Backup interval: 15 minutes
- Location: `backups/` folder
- Retention: 14 days

### Production (PostgreSQL on Render)

- Managed by Render (no setup needed)
- Automatic daily backups included
- Accessible via `DATABASE_URL` env var
- Scale to paid plan if needed

## Security

⚠️ **Important**: Your `.env` file contains secrets. Never commit it to GitHub.

1. Add to `.gitignore` (already done):
   ```
   .env
   node_modules/
   backups/
   ```

2. On Render, set environment variables in the dashboard (never in code)

3. To rotate credentials:
   - Change password in Render dashboard
   - Redeploy: `git push origin main` or click "Redeploy" in Render

## Troubleshooting

### App not responding

Check logs in Render dashboard → Logs tab.

### Database connection error

- Ensure `DATABASE_URL` is set in Render environment
- Check PostgreSQL is enabled in render.yaml

### Backup failures

- Check disk space: Render free tier has 0.5 GB total storage
- Old backups are pruned automatically (14-day retention)

### Email not sending

- Verify OUTLOOK_USER and OUTLOOK_APP_PASSWORD are set correctly
- Confirm SMTP auth/app password is enabled for your Vanier Microsoft 365 account

## File Structure

```
package-tracker/
├── server.js           # Express app entry point
├── db-unified.js       # SQLite + PostgreSQL adapter
├── backup.js           # Automated backup scheduler
├── package.json        # Dependencies & scripts
├── render.yaml         # Render deployment config
├── Procfile            # Process definition
├── .env                # Environment variables (NOT in git)
├── .env.example        # Template for .env
├── .gitignore          # Git ignore rules
├── public/             # Frontend files
├── routes/             # API endpoints
├── scripts/            # Utility scripts
├── uploads/            # Uploaded files
├── backups/            # Local SQLite backups
└── packages.db         # Local SQLite database
```

## API Endpoints

- `GET /api/health` - Health check for monitoring
- `GET /api/config` - Get config (email settings)
- `GET /api/packages` - List packages
- `POST /api/packages` - Create package
- `GET /api/packages/:id` - Get package detail
- `PUT /api/packages/:id` - Update package
- `DELETE /api/packages/:id` - Delete package
- `POST /api/files/package/:id` - Upload file to package
- `DELETE /api/files/:id` - Delete file
- `GET /api/nonpo` - List non-PO items
- `POST /api/nonpo` - Create non-PO item
- `POST /api/email/draft` - Generate email draft
- `POST /api/email/send` - Send email

## License

MIT

## Support

For issues or questions, create a GitHub issue or email the maintainer.
