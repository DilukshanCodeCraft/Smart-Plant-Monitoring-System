const { connectDatabase } = require('../src/config/db');
const { initializeDatabase } = require('../src/services/databaseInitService');

async function run() {
  const connection = await connectDatabase();
  await initializeDatabase();

  console.log(`Database initialized on ${connection.host}/${connection.name}`);
  process.exit(0);
}

run().catch((error) => {
  console.error('Database initialization failed.');
  console.error(error);
  process.exit(1);
});
