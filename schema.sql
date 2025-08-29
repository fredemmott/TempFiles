CREATE TABLE users
(
  id         INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  username   TEXT UNIQUE                       NOT NULL,
  uuid       TEXT UNIQUE                       NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registration_tokens
(
  id         INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id    INTEGER                           NOT NULL,
  token      TEXT UNIQUE                       NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+1 hour')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE passkeys
(
  id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id       INTEGER                           NOT NULL,
  credential_id TEXT                              NOT NULL,
  public_key    TEXT                              NOT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE files
(
  id                  INTEGER PRIMARY KEY AUTOINCREMENT  NOT NULL,
  user_id             INTEGER                            NOT NULL,
  uuid                TEXT UNIQUE                        NOT NULL,
  salt                TEXT,
  filename_iv         TEXT                               NOT NULL,
  data_iv             TEXT                               NOT NULL,
  encrypted_filename  TEXT                               NOT NULL,
  e2ee_passkey_id     INTEGER,
  downloads_remaining INTEGER,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at          DATETIME,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (e2ee_passkey_id) REFERENCES passkeys (id) ON DELETE CASCADE
);
