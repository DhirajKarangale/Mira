CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY,
    retention_period INTEGER DEFAULT 30,
    show_logs_vault BOOLEAN DEFAULT 1,
    show_logs_operator BOOLEAN DEFAULT 1,
    show_logs_engine BOOLEAN DEFAULT 1,
    show_logs_memory BOOLEAN DEFAULT 1,
    show_logs_client BOOLEAN DEFAULT 1,
    show_logs_message_broker BOOLEAN DEFAULT 1,
    store_logs_vault BOOLEAN DEFAULT 1,
    store_logs_operator BOOLEAN DEFAULT 1,
    store_logs_engine BOOLEAN DEFAULT 1,
    store_logs_memory BOOLEAN DEFAULT 1,
    store_logs_client BOOLEAN DEFAULT 1,
    store_logs_message_broker BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS message_broker (
    id INTEGER PRIMARY KEY,
    REDIS_HOST TEXT DEFAULT 'localhost',
    REDIS_PORT INTEGER DEFAULT 6379,
    REDIS_DB INTEGER DEFAULT 0,
    REDIS_PASSWORD TEXT DEFAULT NULL,
    REDIS_PROTOCOL INTEGER DEFAULT 2,
    REDIS_DECODE_RESPONSES BOOLEAN DEFAULT 1,
    SERVER_HOST TEXT DEFAULT '127.0.0.1',
    SERVER_RELOAD BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operator (
    id INTEGER PRIMARY KEY,
    CAPTURE_INTERVAL_SECS INTEGER DEFAULT 10,
    AUTO_START BOOLEAN DEFAULT 0,
    KNOWLEDGE_BASE_RETENTION_PERIOD TEXT DEFAULT 'Never auto delete'
);

CREATE TABLE IF NOT EXISTS user_details (
    id INTEGER PRIMARY KEY,
    user_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    country TEXT DEFAULT '',
    address TEXT DEFAULT '',
    postal_code TEXT DEFAULT '',
    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS app_permissions (
    id INTEGER PRIMARY KEY,
    app_id TEXT UNIQUE NOT NULL,
    app_name TEXT NOT NULL,
    allowed_to_capture BOOLEAN DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_app_permissions_name ON app_permissions(app_name COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS idx_app_permissions_lower_app_id ON app_permissions(LOWER(app_id));

CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY,
    llm_provider TEXT UNIQUE NOT NULL,
    total_keys INTEGER DEFAULT 0,
    current_key INTEGER DEFAULT 0,
    keys TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_ai_configs_lower_provider ON ai_configs(LOWER(llm_provider));

CREATE TABLE IF NOT EXISTS ai_priorities (
    id INTEGER PRIMARY KEY,
    priorities TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS engine_workers (
    id INTEGER PRIMARY KEY,
    chat_workers INTEGER DEFAULT 1,
    screenshot_extraction_workers INTEGER DEFAULT 1,
    screenshot_summarization_workers INTEGER DEFAULT 1,
    embedding_vector_store_workers INTEGER DEFAULT 1,
    chat_workers_poll_time REAL DEFAULT 1.0,
    screenshot_extraction_poll_time REAL DEFAULT 5.0,
    screenshot_summarization_poll_time REAL DEFAULT 60.0,
    embedding_vector_store_workers_poll_time REAL DEFAULT 180.0
);

CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    chat_name TEXT,
    role TEXT NOT NULL CHECK(role IN ('user', 'ai')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id);
CREATE INDEX IF NOT EXISTS idx_chats_session_created ON chats(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chats_created ON chats(created_at);
CREATE INDEX IF NOT EXISTS idx_chats_session_created_id ON chats(session_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_chats_session_role_created ON chats(session_id, role, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS daily_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_suggestions TIMESTAMP,
    suggestions TEXT DEFAULT '[]',
    completed TEXT DEFAULT '',
    date_weather TIMESTAMP,
    weather TEXT DEFAULT '{}',
    date_music TIMESTAMP,
    music TEXT DEFAULT '[]',
    date_entertainment TIMESTAMP,
    entertainment TEXT DEFAULT '[]',
    date_news TIMESTAMP,
    news TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_daily_suggestions_date ON daily_suggestions(date_suggestions DESC);

CREATE TABLE IF NOT EXISTS gnews_config (
    id TEXT PRIMARY KEY,
    current_key INTEGER DEFAULT 0,
    keys TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS voice_models (
    id INTEGER PRIMARY KEY,
    provider TEXT UNIQUE NOT NULL,
    total_keys INTEGER DEFAULT 0,
    current_key INTEGER DEFAULT 0,
    keys TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_voice_models_provider ON voice_models(provider);
CREATE INDEX IF NOT EXISTS idx_voice_models_lower_provider ON voice_models(LOWER(provider));
CREATE INDEX IF NOT EXISTS idx_voice_models_total_keys ON voice_models(total_keys);

CREATE TABLE IF NOT EXISTS voice_config (
    id INTEGER PRIMARY KEY,
    mic_auto_start BOOLEAN DEFAULT 0,
    voice_enable_master BOOLEAN DEFAULT 0,
    voice_enable_while_typing BOOLEAN DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_voice_config_master ON voice_config(voice_enable_master);
CREATE INDEX IF NOT EXISTS idx_voice_config_while_typing ON voice_config(voice_enable_while_typing);
CREATE INDEX IF NOT EXISTS idx_voice_config_mic_auto ON voice_config(mic_auto_start);

