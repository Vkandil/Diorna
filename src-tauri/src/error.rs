use thiserror::Error;

#[derive(Debug, Error)]
pub enum DiornaError {
    #[error("The vault has not been initialised")]
    VaultNotInitialised,
    #[error("Unsafe path rejected: {0}")]
    UnsafePath(String),
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),
    #[error("The file changed outside Diorna; reload it before saving")]
    SyncConflict,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("Invalid data: {0}")]
    InvalidData(String),
    #[error("Windows security error: {0}")]
    WindowsSecurity(String),
}

pub type Result<T> = std::result::Result<T, DiornaError>;

impl serde::Serialize for DiornaError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
