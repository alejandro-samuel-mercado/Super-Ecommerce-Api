const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
console.log('Testing connection to:', connectionString.split('@')[1]); // Log host part only for safety

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function test() {
  try {
    const start = Date.now();
    const client = await pool.connect();
    console.log('Connected successfully in', Date.now() - start, 'ms');
    const res = await client.query('SELECT NOW()');
    console.log('Query successful:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('Connection failed:', err.message);
    if (err.code) console.error('Error Code:', err.code);
  } finally {
    await pool.end();
  }
}

test();
