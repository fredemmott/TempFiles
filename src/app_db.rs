/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

use rocket_db_pools::sqlx;

#[derive(rocket_db_pools::Database, Clone)]
#[database("app_db")]
pub struct AppDb(sqlx::SqlitePool);
