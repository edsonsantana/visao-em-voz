import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { activeProvider } from '../services/aiProvider';
import { logTelemetry } from '../database/db';

const router = Router();

const AnalyzeRequestSchema = z.object({
  image_base64: z.string(),
  command: z.string().default('descreva'),
  session_id: z.string().optional()
});

router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const parseResult = AnalyzeRequestSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Payload inválido', details: parseResult.error.issues });
    }

    const { image_base64, command, session_id } = parseResult.data;

    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
    
    const sizeKb = Math.round((base64Data.length * 0.75) / 1024);
    console.log(`[Backend] Imagem recebida para análise: ${sizeKb} KB`);

    const result = await activeProvider.analyzeScene(base64Data, command);

    const latencyMs = Date.now() - startTime;

    // Fire and forget telemetry
    logTelemetry(session_id || null, result.priority, latencyMs).catch(err => {
      console.error("Telemetry error:", err);
    });

    return res.json(result);
  } catch (error: any) {
    console.error('Error analyzing scene:', error);
    return res.status(500).json({ error: 'Erro ao processar imagem', details: error.message });
  }
});

export default router;
