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
    AUTO_START BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_details (
    id INTEGER PRIMARY KEY,
    user_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    country TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_permissions (
    id INTEGER PRIMARY KEY,
    app_id TEXT UNIQUE NOT NULL,
    app_name TEXT NOT NULL,
    allowed_to_capture BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY,
    llm_provider TEXT UNIQUE NOT NULL,
    total_keys INTEGER DEFAULT 0,
    current_key INTEGER DEFAULT 0,
    keys TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ai_priorities (
    id INTEGER PRIMARY KEY,
    priorities TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS engine_workers (
    id INTEGER PRIMARY KEY,
    llm_workers INTEGER DEFAULT 1,
    screenshot_extraction_workers INTEGER DEFAULT 1,
    screenshot_summarization_workers INTEGER DEFAULT 1,
    embedding_vector_store_workers INTEGER DEFAULT 1,
    screenshot_extraction_poll_time REAL DEFAULT 5.0,
    screenshot_summarization_poll_time REAL DEFAULT 60.0,
    embedding_vector_store_workers_poll_time REAL DEFAULT 180.0
);

