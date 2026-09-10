CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    device_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS preferences (
    session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    nivel_descricao VARCHAR(50) DEFAULT 'normal', -- resumida, normal, detalhada
    prioridades_ativas JSONB DEFAULT '{"pessoas": true, "obstaculos": true, "animais": true, "textos": true, "orientacao": true}'::jsonb,
    voz_config JSONB DEFAULT '{"velocidade": 1.0, "volume": 1.0, "idioma": "pt-BR"}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consent_log (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    tipo_consentimento VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    session_id UUID, -- Opcional, para permitir telemetria anônima solta se necessário
    priority INTEGER, -- 1 a 4, ou null para OCR
    latency_ms INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para telemetria e busca
CREATE INDEX idx_telemetry_timestamp ON telemetry(timestamp);
CREATE INDEX idx_consent_log_session ON consent_log(session_id);
