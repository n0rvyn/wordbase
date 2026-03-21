import { initializeDatabase } from './index.js';

try {
  console.log('Running migrations...');
  initializeDatabase();
  console.log('Database initialized successfully!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
