/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */
use sqlx::{SqliteConnection, query};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn visit_directory(dir: &Path, visitor: &mut dyn FnMut(&Path)) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            visit_directory(&path, visitor)?;
        }

        visitor(&path);
    }
    Ok(())
}

fn list_recursive_files(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut ret: Vec<PathBuf> = vec![];
    visit_directory(dir, &mut |path| {
        if path.is_file() {
            ret.push(path.to_path_buf())
        }
    })?;
    Ok(ret)
}

async fn prune_files(conn: &mut SqliteConnection, upload_root: &Path) -> anyhow::Result<()> {
    let files = list_recursive_files(upload_root)?;
    let live_uuids = query!(
        r#"
        SELECT uuid AS "uuid: Uuid" FROM files
        WHERE
        (salt IS NOT NULL)
        AND (downloads_remaining IS NULL OR downloads_remaining > 0)
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        "#
    )
    .fetch_all(conn)
    .await?
    .iter()
    .map(|r| r.uuid)
    .collect::<HashSet<Uuid>>();
    for file in files {
        let file_name = file.file_name().expect("File without filename");
        let uuid = Uuid::parse_str(file_name.to_str().unwrap())?;
        if live_uuids.contains(&uuid) {
            continue;
        }
        std::fs::remove_file(&file)?;
        println!("Deleted file: {}", uuid)
    }
    Ok(())
}

fn delete_empty_directories(path: &Path) -> std::io::Result<()> {
    if !path.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(path)? {
        delete_empty_directories(entry?.path().as_path())?;
    }

    if std::fs::read_dir(path)?.next().is_none() {
        std::fs::remove_dir(path)?;
        println!("Deleted empty directory: {}", path.display());
    }

    Ok(())
}

async fn prune_file_rows(conn: &mut SqliteConnection) -> sqlx::Result<()> {
    query!(
        r#"
        DELETE FROM files
        WHERE
        (salt IS NULL)
        OR (downloads_remaining IS NOT NULL AND downloads_remaining < 1)
        OR (expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP)
        "#
    )
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn prune(conn: &mut SqliteConnection, upload_root: &Path) -> anyhow::Result<()> {
    prune_files(conn, upload_root).await?;
    delete_empty_directories(upload_root)?;
    prune_file_rows(conn).await?;

    Ok(())
}
