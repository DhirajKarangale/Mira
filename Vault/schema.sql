CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY,
    retention_period INTEGER DEFAULT 30,
    show_logs_operator BOOLEAN DEFAULT 1,
    show_logs_engine BOOLEAN DEFAULT 1,
    show_logs_memory BOOLEAN DEFAULT 1,
    show_logs_client BOOLEAN DEFAULT 1,
    show_logs_message_broker BOOLEAN DEFAULT 1,
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
