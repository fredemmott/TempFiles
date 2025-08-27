use rocket_db_pools::sqlx;

#[derive(rocket_db_pools::Database)]
#[database("app_db")]
pub struct AppDb(sqlx::SqlitePool);
