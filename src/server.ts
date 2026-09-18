import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;

// Em produção, define ALLOWED_ORIGIN para restringir o CORS à origem do app
// Se não definida, libera tudo (comportamento de desenvolvimento)
const corsOptions = process.env.ALLOWED_ORIGIN
  ? { origin: process.env.ALLOWED_ORIGIN }
  : {};
app.use(cors(corsOptions));
// Limite alto para suportar imagens em base64
app.use(express.json({ limit: '10mb' }));

// Serve a página de teste e outros arquivos estáticos de public/
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/analyze', analyzeRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Visão em Voz Backend (V0) rodando na porta ${port}`);
});
