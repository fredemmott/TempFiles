/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

use crate::api_error::ApiError;
use crate::app_db::AppDb;
use crate::session::Session;
use rocket::form::Form;
use rocket::fs::{NamedFile, TempFile};
use rocket::serde::json::Json;
use rocket_db_pools::Connection;
use rocket_db_pools::sqlx::prelude::*;
use rocket_db_pools::sqlx::query;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/File.ts")]
pub struct File {
    pub uuid: Uuid,
    #[ts(type = "number")]
    pub created_at: i64,
    pub is_e2ee: bool,
    pub salt: String,
    pub filename_iv: String,
    pub data_iv: String,
    pub encrypted_filename: String,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/ListResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct ListResponse {
    files: Vec<File>,
}

#[post("/api/files/list")]
pub async fn list(
    mut db: Connection<AppDb>,
    session: Session,
) -> Result<Json<ListResponse>, ApiError> {
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
            is_e2ee: row.e2ee_passkey_id.is_some(),
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
    #[ts(type = "'true' | 'false'")]
    pub is_e2ee: bool,
    pub salt: String,
    pub filename_iv: String,
    pub data_iv: String,
    pub encrypted_filename: String,
    #[ts(type = "Blob")]
    pub encrypted_data: TempFile<'r>,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/files/UploadResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct UploadResponse {
    pub file: File,
}

fn uploaded_file_path(uuid: &Uuid) -> Result<PathBuf, std::io::Error> {
    let uuid_str = uuid.to_string();
    let path = PathBuf::from(format!(
        "uploads/{}/{}/{}",
        &uuid_str[0..2],
        &uuid_str[2..4],
        uuid_str
    ));
    std::fs::create_dir_all(path.parent().unwrap())?;
    Ok(path)
}

#[post("/api/files/upload", data = "<payload>")]
pub async fn upload(
    mut db: Connection<AppDb>,
    mut payload: Form<UploadRequest<'_>>,
    session: Session,
) -> Result<Json<UploadResponse>, ApiError> {
    let uuid = Uuid::new_v4();
    let path = uploaded_file_path(&uuid)?;

    match payload.encrypted_data.persist_to(&path).await {
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            payload.encrypted_data.move_copy_to(&path).await?;
        }
        Err(e) => return Err(ApiError::IOError(e)),
    }
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
            is_e2ee: payload.is_e2ee,
            salt: payload.salt.clone(),
            filename_iv: payload.filename_iv.clone(),
            data_iv: payload.data_iv.clone(),
            encrypted_filename: payload.encrypted_filename.clone(),
            created_at: row.created_at.and_utc().timestamp(),
        },
    }))
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/files/DownloadRequest.ts")]
pub struct DownloadRequest {
    pub uuid: Uuid,
}

#[post("/api/files/download", data = "<payload>")]
pub async fn download(
    mut db: Connection<AppDb>,
    payload: Json<DownloadRequest>,
    session: Session,
) -> Result<NamedFile, ApiError> {
    let user_id = session.user_id();
    // Deleting the salt is effectively deleting it, as we can't decrypt.
    //
    // We might keep the row if we haven't cleaned up the filesystem yet
    let row = query!(
        "SELECT salt FROM files WHERE uuid = ?1 AND user_id = ?2",
        payload.uuid,
        user_id,
    )
    .fetch_one(&mut **db)
    .await?;
    if row.salt.is_none() {
        return Err(ApiError::NotFoundError());
    }

    let path = uploaded_file_path(&payload.uuid)?;
    Ok(NamedFile::open(path).await?)
}

#[post("/api/files/delete_all")]
pub async fn delete_all(mut db: Connection<AppDb>, session: Session) -> Result<(), ApiError> {
    let mut tx = db.begin().await?;
    let user_id = session.user_id();
    query!("UPDATE files SET salt = NULL WHERE user_id = ?1", user_id)
        .execute(&mut *tx)
        .await?;
    let rows = query!(
        r#"SELECT uuid AS "uuid: Uuid" FROM files WHERE user_id = ?1"#,
        user_id
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    for row in rows {
        std::fs::remove_file(uploaded_file_path(&row.uuid)?)?
    }

    query!(
        "DELETE FROM files WHERE user_id = ?1 AND salt IS NULL",
        user_id
    )
    .execute(&mut **db)
    .await?;

    Ok(())
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/files/DeleteRequest.ts")]
pub struct DeleteRequest {
    pub uuid: Uuid,
}

#[post("/api/files/delete", data = "<payload>")]
pub async fn delete(
    mut db: Connection<AppDb>,
    payload: Json<DeleteRequest>,
    session: Session,
) -> Result<(), ApiError> {
    let user_id = session.user_id();
    let file_uuid = payload.uuid;
    let result = query!(
        "DELETE FROM files WHERE uuid = ?1 AND user_id = ?2",
        file_uuid,
        user_id,
    ).execute(&mut **db).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFoundError());
    }
    std::fs::remove_file(uploaded_file_path(&file_uuid)?)?;
    Ok(())
}

pub fn generate_typescript(dest: &str) {
    DeleteRequest::export_all_to(dest).unwrap();
    DownloadRequest::export_all_to(dest).unwrap();
    File::export_all_to(dest).unwrap();
    ListResponse::export_all_to(dest).unwrap();
    UploadRequest::export_all_to(dest).unwrap();
    UploadResponse::export_all_to(dest).unwrap();
}
