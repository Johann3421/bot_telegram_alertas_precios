const fs = require('fs');
const { Client } = require('pg');
(async function(){
  try{
    const env = fs.readFileSync('.env','utf8');
    const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    if(!m){
      console.error('DATABASE_URL not found in .env');
      process.exit(1);
    }
    const dbUrl = m[1];
    const u = new URL(dbUrl);
    const targetDb = (u.pathname || '').replace(/^\//, '') || 'precios_pe';

    // build admin connection string to connect to default 'postgres' database
    const adminDb = 'postgres';
    const adminUrl = dbUrl.replace(/\/([^\/?]+)([\?].*)?$/, `/${adminDb}$2`);

    const client = new Client({ connectionString: adminUrl });
    await client.connect();

    // validate target db name to avoid SQL injection in identifier
    if(!/^[a-zA-Z0-9_]+$/.test(targetDb)){
      console.error('Refusing to create database with unsafe name:', targetDb);
      process.exit(1);
    }

    const res = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [targetDb]);
    if(res.rowCount > 0){
      console.log('Database already exists:', targetDb);
    } else {
      console.log('Creating database:', targetDb);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log('Database created:', targetDb);
    }

    await client.end();
  }catch(err){
    console.error('ERROR', err.message);
    process.exit(1);
  }
})();
