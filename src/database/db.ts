import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Em produção (Railway), DATABASE_URL é fornecida automaticamente.
// Em desenvolvimento local (Docker Compose), usa as variáveis separadas como fallback.
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // necessário para Railway/Postgres gerenciado
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'visao_em_voz',
      password: process.env.DB_PASSWORD || 'password',
      port: parseInt(process.env.DB_PORT || '5432', 10),
    };

export const pool = new Pool(poolConfig);

export async function logTelemetry(sessionId: string | null, priority: number | null, latencyMs: number) {
  try {
    await pool.query(
      'INSERT INTO telemetry (session_id, priority, latency_ms) VALUES ($1, $2, $3)',
      [sessionId, priority, latencyMs]
    );
  } catch (error) {
    console.error('Error logging telemetry:', error);
  }
}
