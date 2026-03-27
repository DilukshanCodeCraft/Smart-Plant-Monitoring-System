const mongoose = require('mongoose');
const Reading = require('../models/Reading');
const UserProfile = require('../models/UserProfile');
const Plant = require('../models/Plant');
const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');
const JournalEntry = require('../models/JournalEntry');
const ActuatorLog = require('../models/ActuatorLog');
const RuleState = require('../models/RuleState');
const KBAArticle = require('../models/KBAArticle');
const { seedWithExistingConnection } = require('../../scripts/seedKBA');

const INITIALIZED_MODELS = [
  Reading,
  UserProfile,
  Plant,
  Alert,
  Recommendation,
  JournalEntry,
  ActuatorLog,
  RuleState,
  KBAArticle
];

async function ensureCollection(collectionName) {
  const existingCollections = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .toArray();

  if (existingCollections.length === 0) {
    await mongoose.connection.db.createCollection(collectionName);
  }
}

async function initializeDatabase() {
  for (const Model of INITIALIZED_MODELS) {
    await ensureCollection(Model.collection.collectionName);
    await Model.syncIndexes();
  }

  const kbaSeedSummary = await seedWithExistingConnection();
  if (kbaSeedSummary.inserted > 0) {
    console.log(`Seeded ${kbaSeedSummary.inserted} default Knowledge Base articles.`);
  }
}

module.exports = {
  initializeDatabase
};
