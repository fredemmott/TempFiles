use rocket::http::Status;
use rocket::response::Responder;
use rocket::{Request, response};
use webauthn_rs::prelude::WebauthnError;

#[derive(Debug)]
pub enum ApiError {
    NotFoundError(),
    DatabaseError(sqlx::Error),
    WebauthnError(WebauthnError),
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => ApiError::NotFoundError(),
            _ => ApiError::DatabaseError(e),
        }
    }
}

impl From<WebauthnError> for ApiError {
    fn from(e: WebauthnError) -> Self {
        ApiError::WebauthnError(e)
    }
}

impl<'r> Responder<'r, 'static> for ApiError {
    fn respond_to(self, r: &'r Request<'_>) -> response::Result<'static> {
        match self {
            ApiError::NotFoundError() => Status::NotFound.respond_to(r),
            ApiError::DatabaseError(e) => {
                if cfg!(debug_assertions) {
                    (
                        Status::InternalServerError,
                        format!("SQL error: {}", e.to_string()),
                    )
                        .respond_to(r)
                } else {
                    Status::InternalServerError.respond_to(r)
                }
            }
            ApiError::WebauthnError(e) => {
                if cfg!(debug_assertions) {
                    (
                        Status::InternalServerError,
                        format!("Webauthn error: {}", e.to_string()),
                    )
                        .respond_to(r)
                } else {
                    Status::InternalServerError.respond_to(r)
                }
            }
        }
    }
}
