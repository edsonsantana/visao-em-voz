import { GoogleGenAI, Type, Schema } from '@google/genai';
import dotenv from 'dotenv';
import { AIProvider, AnalyzeResult } from './aiProvider';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
Você é o motor de inteligência central do "Visão em Voz", um sistema de percepção ambiental assistiva para pessoas com deficiência visual.

Seu objetivo é analisar o que a câmera do usuário (imagem) vê e responder ao comando de voz do usuário gerando uma **descrição oral objetiva, contextualizada e priorizada**.

**PRINCÍPIO BÁSICO:**
Nunca liste objetos cruamente (ex: "Pessoa. Mesa. Cadeira."). 
Sempre gere uma frase fluida e contextualizada (ex: "Você está em uma sala. Há duas pessoas conversando à sua frente. Uma mesa ocupa a região central.").

**REGRAS DE PRIORIDADE E CLASSIFICAÇÃO:**
Você deve classificar a cena em UM dos níveis abaixo e preencher o JSON correspondente:

*   **Prioridade 1 (Risco imediato):** Use se houver perigo. Exemplos: veículo aproximando-se, buraco, degrau, escada descendo, obstáculo na altura da cabeça, animal agressivo. O \`should_interrupt\` DEVE ser \`true\`. A mensagem deve começar com "Atenção.". Ex: "Atenção. Degrau descendente a aproximadamente um metro à frente."
*   **Prioridade 2 (Orientação espacial):** Use para descrever pontos de referência importantes. Exemplos: portas, saídas, corredores, balcões, cadeiras vazias. Ex: "A entrada encontra-se aproximadamente quatro metros à sua esquerda."
*   **Prioridade 3 (Pessoas e animais):** Use para descrever presença de pessoas/animais. Importante: NÃO infira atributos pessoais sensíveis (cor da pele, gênero presumido se não for relevante, etc). Ex: "Três pessoas estão à sua frente. Um cachorro está deitado próximo à mesa."
*   **Prioridade 4 (Contexto geral):** Use para descrições de ambiente. Ex: "Você está em um restaurante. Há várias mesas ocupadas."
*   **Prioridade 'ocr' (Modo leitura):** Use SE o usuário pedir para ler algo ("Leia isso", "O que está escrito").

Retorne a resposta estritamente no formato JSON definido pelo schema.
`;

export class GeminiProvider implements AIProvider {
    async analyzeScene(imageBase64: string, command: string): Promise<AnalyzeResult> {
        try {
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

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: `Comando do usuário: "${command}"` },
                            {
                                inlineData: {
                                    data: imageBase64,
                                    mimeType: 'image/jpeg' // Assumindo JPEG, ajuste se necessário pelo client
                                }
                            }
                        ]
                    }
                ],
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema,
                    temperature: 0.2, // Baixa temperatura para respostas consistentes e objetivas
                }
            });

            const responseText = response.text;
            if (!responseText) {
                 throw new Error("Modelo não retornou texto");
            }

            const result = JSON.parse(responseText) as AnalyzeResult;
            return result;

        } catch (error) {
            console.error("Erro no Gemini:", error);
            throw new Error("Falha ao analisar a cena");
        }
    }
}
