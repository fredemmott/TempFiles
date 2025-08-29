use crate::api_error::ApiError;
use crate::app_db::AppDb;
use crate::session::{SessionSecret, SessionStore};
use rocket::State;
use rocket::form::Form;
use rocket::fs::TempFile;
use rocket::serde::json::Json;
use rocket_db_pools::Connection;
use rocket_db_pools::sqlx::query;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/File.ts")]
pub struct File {
    pub uuid: Uuid,
    pub e2ee: bool,
    pub salt: String,
    pub filename_iv: String,
    pub data_iv: String,
    pub encrypted_filename: String,
    pub created_at: i64,
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/files/ListRequest.ts")]
#[serde(crate = "rocket::serde")]
pub struct ListRequest {
    session_id: Uuid,
    session_secret: SessionSecret,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/ListResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct ListResponse {
    files: Vec<File>,
}

#[post("/api/files/list", data = "<payload>")]
pub async fn list(
    mut db: Connection<AppDb>,
    payload: Json<ListRequest>,
    sessions: &State<SessionStore>,
) -> Result<Json<ListResponse>, ApiError> {
    let session = sessions
        .get(&payload.session_id, &payload.session_secret)
        .ok_or(ApiError::InvalidSessionError())?;
    let user_id = session.user_id();
    let passkey_id = session.passkey_id();
    let rows = query!(
        r#"
    SELECT uuid as "uuid: Uuid", e2ee_passkey_id, salt, filename_iv, data_iv, encrypted_filename, created_at
    FROM files
    WHERE user_id = ?1
    AND salt IS NOT NULL
    AND (e2ee_passkey_id IS NULL OR e2ee_passkey_id = ?2)
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    AND (downloads_remaining IS NULL or downloads_remaining > 0)
    "#,
        user_id,
        passkey_id,
    )
    .fetch_all(&mut **db)
    .await?;

    let files: Vec<File> = rows
        .into_iter()
        .map(|row| File {
            uuid: row.uuid,
            e2ee: row.e2ee_passkey_id.is_some(),
            salt: row.salt.unwrap(),
            filename_iv: row.filename_iv,
            data_iv: row.data_iv,
            encrypted_filename: row.encrypted_filename,
            created_at: row.created_at.and_utc().timestamp(),
        })
        .collect();
    Ok(Json(ListResponse { files }))
}

#[derive(TS, FromForm)]
#[ts(export_to = "api/files/UploadRequest.ts")]
pub struct UploadRequest<'r> {
    pub is_e2ee: bool,
    pub salt: String,
    pub filename_iv: String,
    pub data_iv: String,
    pub encrypted_filename: String,
    #[ts(type = "Blob")]
    pub encrypted_data: TempFile<'r>,
    pub session_id: Uuid,
    pub session_secret: SessionSecret,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/UploadResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct UploadResponse {
    pub file: File,
}

#[post("/api/files/upload", data = "<payload>")]
pub async fn upload(
    mut db: Connection<AppDb>,
    mut payload: Form<UploadRequest<'_>>,
    sessions: &State<SessionStore>,
) -> Result<Json<UploadResponse>, ApiError> {
    let session = sessions
        .get(&payload.session_id, &payload.session_secret)
        .ok_or(ApiError::InvalidSessionError())?;
    let uuid = Uuid::new_v4();
    let uuid_str = uuid.to_string();
    let directory = format!("uploads/{}/{}", &uuid_str[0..2], &uuid_str[2..4]);
    std::fs::create_dir_all(&directory)?;
    let path = format!("{}/{}", directory, uuid_str);

    payload.encrypted_data.persist_to(path).await?;
    let user_id = session.user_id();
    let passkey_id = if payload.is_e2ee {
        Some(session.passkey_id())
    } else {
        None
    };

    query!(
        r#"
    INSERT INTO files (uuid, user_id, e2ee_passkey_id, salt, filename_iv, data_iv, encrypted_filename)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        uuid,
        user_id,
        passkey_id,
        payload.salt,
        payload.filename_iv,
        payload.data_iv,
        payload.encrypted_filename,
    ).execute(&mut **db).await?;

    let row = query!("SELECT created_at FROM files WHERE uuid = ?1", uuid)
        .fetch_one(&mut **db)
        .await?;

    Ok(Json(UploadResponse {
        file: File {
            uuid,
            e2ee: payload.is_e2ee,
            salt: payload.salt.clone(),
            filename_iv: payload.filename_iv.clone(),
            data_iv: payload.data_iv.clone(),
            encrypted_filename: payload.encrypted_filename.clone(),
            created_at: row.created_at.and_utc().timestamp(),
        },
    }))
}

pub fn generate_typescript(dest: &str) {
    File::export_all_to(dest).unwrap();
    ListRequest::export_all_to(dest).unwrap();
    ListResponse::export_all_to(dest).unwrap();
    UploadRequest::export_all_to(dest).unwrap();
    UploadResponse::export_all_to(dest).unwrap();
}
