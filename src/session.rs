/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

use crate::api_error::ApiError;
use base64::prelude::*;
use rocket::http::Status;
use rocket::request::{FromRequest, Outcome};
use rocket::{Request, State};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use ts_rs::TS;

#[derive(TS, Debug, Clone, Hash, PartialEq, Eq)]
#[ts(type = "string")]
pub struct SessionSecret {
    value: [u8; 32],
}

impl SessionSecret {
    pub fn new() -> Self {
        Self {
            value: rand::random(),
        }
    }
}

impl AsRef<SessionSecret> for SessionSecret {
    fn as_ref(&self) -> &SessionSecret {
        self
    }
}

impl Serialize for SessionSecret {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let encoded = BASE64_URL_SAFE_NO_PAD.encode(&self.value);
        serializer.serialize_str(&encoded)
    }
}

impl<'de> Deserialize<'de> for SessionSecret {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let encoded = String::deserialize(deserializer)?;
        match BASE64_URL_SAFE_NO_PAD.decode(&encoded) {
            Ok(decoded) => Ok(Self {
                value: decoded.try_into().unwrap(),
            }),
            Err(_) => Err(serde::de::Error::custom("Invalid session secret")),
        }
    }
}

impl FromStr for SessionSecret {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match BASE64_URL_SAFE_NO_PAD.decode(s) {
            Ok(decoded) => Ok(Self {
                value: decoded.try_into().map_err(|_| ())?,
            }),
            Err(_) => Err(()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    secret: SessionSecret,
    user_id: i64,
    passkey_id: i64,
    expires: Instant,
}

impl Session {
    pub fn secret(&self) -> &SessionSecret {
        &self.secret
    }

    pub fn user_id(&self) -> i64 {
        self.user_id
    }

    pub fn passkey_id(&self) -> i64 {
        self.passkey_id
    }
}

#[derive(Default)]
pub struct SessionStore {
    sessions: Mutex<HashMap<SessionSecret, Session>>,
}

impl SessionStore {
    pub fn create(self: &Self, user_id: i64, passkey_id: i64) -> Session {
        let session = Session {
            expires: Instant::now() + Duration::from_secs(60 * 60),
            secret: SessionSecret::new(),
            user_id,
            passkey_id,
        };

        self.sessions
            .lock()
            .unwrap()
            .insert(session.secret().clone(), session.clone());
        session
    }

    pub fn get<T: AsRef<SessionSecret>>(self: &Self, secret: T) -> Option<Session> {
        match self.sessions.lock().unwrap().get_mut(secret.as_ref()) {
            Some(session) if session.expires > Instant::now() => {
                session.expires = Instant::now() + Duration::from_secs(60 * 60);
                Some(session.clone())
            }
            _ => None,
        }
    }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Session {
    type Error = ApiError;
    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match request.headers().get_one("Authorization") {
            Some(header) if header.starts_with("Bearer ") => {
                let encoded = header.strip_prefix("Bearer ").unwrap();
                let secret = SessionSecret::from_str(encoded).unwrap();

                let store = request.guard::<&State<SessionStore>>().await.unwrap();
                let session = store.get(secret);
                match session {
                    Some(session) => Outcome::Success(session),
                    None => Outcome::Error((Status::Unauthorized, ApiError::InvalidSessionError())),
                }
            }
            _ => Outcome::Error((Status::Unauthorized, ApiError::InvalidSessionError())),
        }
    }
}
