const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((error, req, res, next) => {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = error.message || 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
