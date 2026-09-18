import { GoogleGenAI, Type, Schema } from '@google/genai';
import dotenv from 'dotenv';
import { AIProvider, AnalyzeResult } from './aiProvider';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
Você é o motor de percepção do "Visão em Voz", um sistema assistivo para pessoas com deficiência visual. A imagem vem de uma câmera que o usuário carrega apontada para frente. Sua resposta será ouvida, não lida.

## O comando manda

O comando do usuário define o QUE responder. A cena define o CONTEÚDO. Nunca ignore o comando para descrever o que achou mais chamativo na imagem.

- **Pedido de risco** ("verificar riscos", "tem obstáculo", "posso andar"): varra a cena procurando degraus, buracos, desníveis, objetos no chão, portas de vidro, quinas na altura da cabeça, veículos, animais soltos, piso molhado. Responda a pergunta de forma explícita nos dois casos. Se houver perigo: prioridade 1, \`should_interrupt\` verdadeiro, texto começando com "Atenção.". Se não houver: prioridade 2, \`should_interrupt\` falso, e diga claramente que nada foi identificado no caminho imediato.
- **Pedido de descrição** ("descreva", "o que tem aqui"): dê o panorama do ambiente. Mas se existir um risco evidente na cena, ele vem primeiro, mesmo que não tenha sido perguntado.
- **Pedido de leitura** ("leia isso", "o que está escrito"): transcreva o texto visível. Prioridade nula, rótulo \`ocr\`.
- **Pergunta específica** ("onde está a porta", "tem alguém vindo"): responda só o que foi perguntado. Se o elemento não estiver visível, diga isso em vez de descrever outra coisa.

## Como falar

Frase fluida, nunca lista de objetos. Não diga "Pessoa. Mesa. Cadeira."; diga "Há duas pessoas conversando à sua frente, junto a uma mesa."

Sempre que possível, dê **direção e distância aproximada**: "à sua esquerda", "três metros à frente", "logo ao seu lado direito". A distância é o que torna a informação útil para andar. Use "aproximadamente" — estimativa honesta vale mais que precisão falsa. Se o enquadramento não permitir estimar, use referência relativa ("bem próximo", "ao fundo") e não invente número.

Comprimento: risco imediato em uma frase curta, sem preâmbulo. Demais respostas em até três frases. O usuário está em movimento.

Descreva apenas o que está visível. Se a imagem estiver escura, desfocada ou apontada para o chão ou o teto, diga isso — é informação útil, e o usuário pode reposicionar a câmera.

## Limites

Não infira atributos pessoais: cor de pele, idade, gênero, condição física, aparente classe social. Descreva pessoas pela posição e pela ação ("uma pessoa em pé à sua direita", "alguém se aproximando pela esquerda").

Não leia em voz alta nomes, documentos, crachás ou telas com dados pessoais, a menos que o usuário peça leitura explicitamente.

## Classificação

- **1 — risco_imediato**: perigo físico no caminho. \`should_interrupt\` verdadeiro.
- **2 — orientacao**: pontos de referência e navegação — portas, saídas, corredores, escadas de subida, assentos livres. Também o "nenhum risco identificado" de uma verificação.
- **3 — pessoas_animais**: presença de pessoas ou animais como informação principal.
- **4 — contexto**: descrição geral do ambiente.
- **ocr**: leitura de texto. Campo \`priority\` nulo.

Escolha o nível pelo que a resposta de fato entrega, considerando o comando. Retorne estritamente o JSON do schema.
`;

export class GeminiProvider implements AIProvider {
    private static readonly MAX_ATTEMPTS = 3;
    private static readonly BACKOFF_MS = [500, 1000];

    /**
     * Verifica se o erro é transitório (503 / UNAVAILABLE) e vale retry.
     */
    private isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
            const msg = error.message || '';
            // O SDK do Google GenAI inclui o status code e/ou "UNAVAILABLE" na mensagem
            if (msg.includes('503') || msg.toUpperCase().includes('UNAVAILABLE')) {
                return true;
            }
        }
        // Checa propriedade 'status' caso o SDK exponha (ex: error.status === 503)
        if (typeof error === 'object' && error !== null && 'status' in error) {
            const status = (error as Record<string, unknown>).status;
            if (status === 503 || status === '503') {
                return true;
            }
        }
        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async analyzeScene(imageBase64: string, command: string): Promise<AnalyzeResult> {
        const responseSchema: Schema = {
            type: Type.OBJECT,
            properties: {
                priority: {
                    type: Type.INTEGER,
                    description: "Nível de prioridade de 1 a 4, ou nulo se for OCR/leitura",
                    nullable: true,
                },
                priority_label: {
                    type: Type.STRING,
                    description: "Rótulo da prioridade: risco_imediato, orientacao, pessoas_animais, contexto, ocr"
                },
                text: {
                    type: Type.STRING,
                    description: "O texto da audiodescrição que será lido para o usuário"
                },
                should_interrupt: {
                    type: Type.BOOLEAN,
                    description: "Verdadeiro apenas se for um risco de Prioridade 1"
                }
            },
            required: ["priority", "priority_label", "text", "should_interrupt"]
        };

        let lastError: unknown;

        for (let attempt = 1; attempt <= GeminiProvider.MAX_ATTEMPTS; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-3.1-flash-lite',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        data: imageBase64,
                                        mimeType: 'image/jpeg'
                                    }
                                },
                                { text: `Comando do usuário: "${command}"\n\nResponda a este comando com base na imagem acima.` }
                            ]
                        }
                    ],
                    config: {
                        systemInstruction: SYSTEM_PROMPT,
                        responseMimeType: 'application/json',
                        responseSchema: responseSchema,
                        temperature: 0.2,
                    }
                });

                const responseText = response.text;
                if (!responseText) {
                    throw new Error("Modelo não retornou texto");
                }

                return JSON.parse(responseText) as AnalyzeResult;

            } catch (error) {
                lastError = error;

                // Só faz retry em erros transitórios (503 / UNAVAILABLE)
                if (!this.isRetryableError(error)) {
                    console.error("Erro não-recuperável no Gemini (sem retry):", error);
                    throw new Error("Falha ao analisar a cena");
                }

                // Se ainda temos tentativas sobrando, espera e tenta de novo
                if (attempt < GeminiProvider.MAX_ATTEMPTS) {
                    const delayMs = GeminiProvider.BACKOFF_MS[attempt - 1];
                    console.warn(
                        `Gemini instável (503/UNAVAILABLE), tentando novamente (tentativa ${attempt + 1} de ${GeminiProvider.MAX_ATTEMPTS})... aguardando ${delayMs}ms`
                    );
                    await this.sleep(delayMs);
                }
            }
        }

        // Todas as tentativas falharam
        console.error(
            `Gemini: todas as ${GeminiProvider.MAX_ATTEMPTS} tentativas falharam. Último erro:`,
            lastError
        );
        throw new Error("Falha ao analisar a cena");
    }
}
