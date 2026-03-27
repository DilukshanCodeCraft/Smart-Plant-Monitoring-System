const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const readingRoutes = require('./routes/readingRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const cameraRollRoutes = require('./routes/cameraRollRoutes');
const arthropodRoutes = require('./routes/arthropodRoutes');
const plantRoutes = require('./routes/plantRoutes');
const alertRoutes = require('./routes/alertRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const journalRoutes = require('./routes/journalRoutes');
const profileRoutes = require('./routes/profileRoutes');
const kbaRoutes = require('./routes/kbaRoutes');
const actuatorRoutes = require('./routes/actuatorRoutes');
const diagnosticsRoutes = require('./routes/diagnosticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const polyPizzaRoutes = require('./routes/polyPizzaRoutes');
const simulationRoutes = require('./routes/simulationRoutes');
const automationRoutes = require('./routes/automationRoutes');
const chatRoutes = require('./routes/chatRoutes');
const mlRoutes = require('./routes/mlRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/readings', readingRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/camera-roll', cameraRollRoutes);
app.use('/api/arthropod', arthropodRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/kba', kbaRoutes);
app.use('/api/actuators', actuatorRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/poly-pizza', polyPizzaRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/automation-rules', automationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ml', mlRoutes);

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
