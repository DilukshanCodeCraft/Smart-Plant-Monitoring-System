const mongoose = require('mongoose');
const { mongodbUri } = require('./env');

async function connectDatabase() {
  if (!mongodbUri) {
    throw new Error('MONGODB_URI is not configured. Add it to backend/.env before starting the backend.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 10000
  });

  return mongoose.connection;
}

module.exports = {
  connectDatabase
};
