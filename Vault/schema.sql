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

CREATE TABLE IF NOT EXISTS operator (
    id INTEGER PRIMARY KEY,
    CAPTURE_INTERVAL_SECS INTEGER DEFAULT 10,
    AUTO_START BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_details (
    id INTEGER PRIMARY KEY,
    user_name TEXT DEFAULT 'Dhiraj',
    email TEXT DEFAULT 'dakarangale02@gmail.com',
    phone_number TEXT DEFAULT '+91 7620320595',
    city TEXT DEFAULT 'Pune',
    state TEXT DEFAULT 'Maharashtra',
    country TEXT DEFAULT 'India'
);

CREATE TABLE IF NOT EXISTS app_permissions (
    id INTEGER PRIMARY KEY,
    app_id TEXT UNIQUE NOT NULL,
    app_name TEXT NOT NULL,
    allowed_to_capture BOOLEAN DEFAULT 1
);

