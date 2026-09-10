#!/usr/bin/env node
/**
 * Script de teste manual para a rota POST /api/analyze do backend Visão em Voz.
 *
 * Uso:
 *   node test-analyze.js <caminho-da-imagem> [comando] [url-base]
 *
 * Exemplos:
 *   node test-analyze.js ./sala.jpg
 *   node test-analyze.js ./degrau.jpg verificar_riscos
 *   node test-analyze.js ./corredor.jpg descreva http://localhost:3000
 *
 * Requer Node 18+ (usa fetch nativo). Não precisa instalar nada.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , imagePath, command = 'descreva', baseUrl = 'http://localhost:3000'] = process.argv;

if (!imagePath) {
  console.error('Uso: node test-analyze.js <caminho-da-imagem> [comando] [url-base]');
  process.exit(1);
}

const resolvedPath = path.resolve(imagePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Arquivo não encontrado: ${resolvedPath}`);
  process.exit(1);
}

const imageBuffer = fs.readFileSync(resolvedPath);
const imageBase64 = imageBuffer.toString('base64');
const sessionId = crypto.randomUUID();

const payload = {
  image_base64: imageBase64,
  command,
  session_id: sessionId
};

const endpoint = `${baseUrl.replace(/\/$/, '')}/api/analyze`;

// Contrato esperado, definido no plano técnico do V0
const EXPECTED_FIELDS = ['priority', 'priority_label', 'text', 'should_interrupt'];
const VALID_PRIORITIES = [1, 2, 3, 4, 'ocr'];

function validateContract(json) {
  const missing = EXPECTED_FIELDS.filter((f) => !(f in json));
  const problems = [];

  if (missing.length) {
    problems.push(`Campos ausentes na resposta: ${missing.join(', ')}`);
  }
  if ('priority' in json && !VALID_PRIORITIES.includes(json.priority)) {
    problems.push(`priority inesperado: "${json.priority}" (esperado um de ${VALID_PRIORITIES.join(', ')})`);
  }
  if ('should_interrupt' in json && typeof json.should_interrupt !== 'boolean') {
    problems.push('should_interrupt deveria ser boolean');
  }
  if ('text' in json && (!json.text || typeof json.text !== 'string')) {
    problems.push('text deveria ser uma string não vazia');
  }

  return problems;
}

async function main() {
  console.log(`\n→ Enviando "${path.basename(resolvedPath)}" com comando "${command}" para ${endpoint}\n`);

  const start = Date.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('✗ Falha ao conectar no backend. Ele está rodando? (npm run dev)');
    console.error(err.message);
    process.exit(1);
  }

  const elapsed = Date.now() - start;
  const raw = await response.text();

  if (!response.ok) {
    console.error(`✗ HTTP ${response.status} (${elapsed}ms)`);
    console.error(raw);
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.error('✗ Resposta não é um JSON válido:');
    console.error(raw);
    process.exit(1);
  }

  console.log(`✓ Resposta recebida em ${elapsed}ms\n`);
  console.log(JSON.stringify(json, null, 2));

  const problems = validateContract(json);
  console.log('');
  if (problems.length) {
    console.log('⚠ Contrato de resposta com divergências:');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  } else {
    console.log('✓ Resposta bate com o contrato definido no plano técnico (priority, priority_label, text, should_interrupt).');
  }
}

main();
