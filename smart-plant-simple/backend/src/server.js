const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const app = require('./app');

const envFileName = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });

const port = Number(process.env.PORT || 5101);
const mongoUri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
const mongoDbName = (process.env.MONGODB_DB_NAME || '').trim();

async function start() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI (or MONGO_URI) is required. Add it to backend/.env');
  }

  const connectOptions = mongoDbName ? { dbName: mongoDbName } : {};
  await mongoose.connect(mongoUri, connectOptions);
  console.log(`MongoDB connected${mongoDbName ? ` (db: ${mongoDbName})` : ''}.`);

  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start backend:', error.message);
  process.exit(1);
});
