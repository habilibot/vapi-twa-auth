-- twa_auth
CREATE SCHEMA IF NOT EXISTS twa_auth;
GRANT USAGE
ON SCHEMA twa_auth
TO postgres, anon, authenticated, service_role, dashboard_user;

-- --Telegram User
CREATE TABLE twa_auth.telegram_user (
    id SERIAL PRIMARY KEY,
    owner UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid(),
    telegram_id VARCHAR(50) NOT NULL UNIQUE,
    telegram_username VARCHAR(200) DEFAULT NULL,
    ton_wallet_address VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE twa_auth.telegram_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
ON twa_auth.telegram_user
FOR ALL
USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA twa_auth
TO postgres, authenticated, service_role, dashboard_user, anon;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA twa_auth
TO postgres, authenticated, service_role, dashboard_user, anon;
