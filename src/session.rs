use base64::prelude::*;
use rocket::form::{FromFormField, ValueField};
use serde::{Deserialize, Serialize, Serializer};
use std::collections::HashMap;
use std::sync::Mutex;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, TS)]
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

    fn from_base64(data: &str) -> Self {
        let bytes = BASE64_STANDARD_NO_PAD.decode(data.as_bytes()).unwrap();
        Self {
            value: bytes.try_into().unwrap(),
        }
    }
}
impl Serialize for SessionSecret {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let encoded = BASE64_STANDARD_NO_PAD.encode(self.value);
        serializer.serialize_str(&encoded)
    }
}
impl<'de> Deserialize<'de> for SessionSecret {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let encoded = String::deserialize(deserializer)?;
        Ok(Self::from_base64(&encoded))
    }
}
#[rocket::async_trait]
impl<'r> FromFormField<'r> for SessionSecret {
    fn from_value(field: ValueField<'r>) -> rocket::form::Result<'r, Self> {
        Ok(Self::from_base64(&field.value))
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    uuid: Uuid,
    secret: SessionSecret,
    user_id: i64,
    passkey_id: i64,
}

impl Session {
    pub fn uuid(&self) -> &Uuid {
        &self.uuid
    }

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
    sessions: Mutex<HashMap<Uuid, Session>>,
}

impl SessionStore {
    pub fn create(self: &Self, user_id: i64, passkey_id: i64) -> Session {
        let uuid = Uuid::new_v4();
        let session = Session {
            uuid,
            secret: SessionSecret::new(),
            user_id,
            passkey_id,
        };

        self.sessions.lock().unwrap().insert(uuid, session.clone());
        session
    }

    pub fn get(self: &Self, uuid: &Uuid, secret: &SessionSecret) -> Option<Session> {
        match self.sessions.lock().unwrap().get(uuid) {
            Some(session) if session.secret == *secret => Some(session.clone()),
            _ => None,
        }
    }
}
