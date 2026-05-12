// Auto-select SQLite or PostgreSQL based on DATABASE_URL
const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
  console.log('[db-adapter] Using PostgreSQL');
  module.exports = require('./db-postgres');
} else {
  console.log('[db-adapter] Using SQLite');
  module.exports = require('./db');
}
