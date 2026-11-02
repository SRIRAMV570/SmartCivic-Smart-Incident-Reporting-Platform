
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  max: 10,
});

export default pool;
