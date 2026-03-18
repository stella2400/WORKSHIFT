CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    employee_code VARCHAR(64) NOT NULL UNIQUE,
    team_name VARCHAR(255),
    company_name VARCHAR(255),
    workplace_name VARCHAR(255),
    settings_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    stored_path TEXT,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    month_label VARCHAR(100),
    source_note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE SET NULL,
    shift_date DATE NOT NULL,
    shift_code VARCHAR(32) NOT NULL,
    shift_label VARCHAR(100) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_shift_entries_user_date
ON shift_entries(user_id, shift_date);

CREATE INDEX IF NOT EXISTS ix_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS ix_shift_entries_user_id ON shift_entries(user_id);
CREATE INDEX IF NOT EXISTS ix_shift_entries_upload_id ON shift_entries(upload_id);