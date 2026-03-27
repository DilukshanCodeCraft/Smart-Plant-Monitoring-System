const mongoose = require('mongoose');
const { AppError } = require('./errorHandler');

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

function ensureDatabaseConnected() {
  if (!isDatabaseConnected()) {
    throw new AppError(503, 'Database is not connected yet. Please retry in a few seconds.');
  }
}

function requireDatabase(req, res, next) {
  try {
    ensureDatabaseConnected();
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  isDatabaseConnected,
  ensureDatabaseConnected,
  requireDatabase
};