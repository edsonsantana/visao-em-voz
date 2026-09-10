import { GeminiProvider } from './geminiProvider';

export interface AnalyzeResult {
    priority: number | null; // 1, 2, 3, 4, null para ocr
    priority_label: string; // 'risco_imediato', 'orientacao', 'pessoas_animais', 'contexto', 'ocr'
    text: string;
    should_interrupt: boolean;
}

export interface AIProvider {
    analyzeScene(imageBase64: string, command: string): Promise<AnalyzeResult>;
}

// Ponto único de configuração: altere aqui para trocar o provedor ativo no futuro
export const activeProvider: AIProvider = new GeminiProvider();
