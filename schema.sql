CREATE TABLE users
(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  uuid       TEXT UNIQUE NOT NULL,
  prf_seed   TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registration_tokens
(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  token      TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+1 hour')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE passkeys
(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  credential_id TEXT    NOT NULL,
  public_key    TEXT    NOT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE files
(
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER,
  e2e_credential_id   INTEGER,
  uuid                TEXT UNIQUE,
  downloads_remaining INTEGER,
  salt                TEXT,
  encrypted_filename  TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at          DATETIME,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (e2e_credential_id) REFERENCES passkeys (id) ON DELETE CASCADE
);
