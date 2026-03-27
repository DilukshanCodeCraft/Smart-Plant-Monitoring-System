const app = require('./app');
const { port } = require('./config/env');
const { connectDatabase } = require('./config/db');
const { initializeDatabase } = require('./services/databaseInitService');
const { startUsbLuxBoardService } = require('./services/usbLuxBoardService');
const { getBoard1StatusSnapshot } = require('./services/deviceService');
const { startBackgroundSync } = require('./services/monitoringProgressService');

async function bgConnect() {
  try {
    await connectDatabase();
    await initializeDatabase();
    app.locals.databaseConnected = true;
    console.log('Database connected and initialized successfully.');
  } catch (error) {
    app.locals.databaseConnected = false;
    console.warn('Database unavailable. Readings APIs will return 503 until MongoDB is connected.');
    console.warn(`Connection error: ${error.message}. Retrying in 5 seconds...`);
    setTimeout(bgConnect, 5000);
  }
}

function startServer() {
  bgConnect();
  startUsbLuxBoardService();
  
  // Keep Board 1 and Board 2 synchronized in the background
  startBackgroundSync(getBoard1StatusSnapshot);

  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

startServer();
