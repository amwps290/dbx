//! Driver-reported SQL error positions (currently PostgreSQL only).
//!
//! PostgreSQL reports a 1-based *character* cursor position for many SQL
//! errors ([`tokio_postgres::error::ErrorPosition::Original`]). The native
//! driver error path in `db::postgres` only exposes a `String` to the query
//! layer, so the raw cursor is carried across that `String` ABI as a small
//! machine-readable suffix and resolved back into a typed [`SqlErrorPosition`]
//! as soon as the executed statement text is available.
//!
//! The suffix is a position carrier, not an error classifier: nothing about the
//! error category, retryability or recovery is inferred from it, and
//! [`strip_marker`] guarantees it can never surface in a user-facing message.

use serde::{Deserialize, Serialize};

/// Suffix appended to a driver error message to carry a raw PostgreSQL cursor
/// position across the `Result<_, String>` boundary of the `db` layer.
pub const SQL_ERROR_POSITION_MARKER: &str = "\nDBX_SQL_ERROR_POSITION:";

/// A SQL error position relative to the statement text that was actually sent
/// to the database.
///
/// `line`/`column` are 1-based and counted in Unicode scalar values (matching
/// PostgreSQL's character-based cursor positions); `offset` is the 0-based
/// scalar-value index into the statement text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlErrorPosition {
    pub line: u32,
    pub column: u32,
    pub offset: u32,
}

impl SqlErrorPosition {
    /// Convert a PostgreSQL 1-based character cursor into a line/column/offset.
    ///
    /// Returns `None` when the cursor is unusable (zero, non-positive, or the
    /// statement is empty). A cursor past the end (`position == len + 1`, e.g.
    /// "unexpected end of input") is clamped to the last character.
    pub fn from_pg_cursor(statement_sql: &str, cursor: u32) -> Option<Self> {
        if cursor == 0 {
            return None;
        }
        let total = statement_sql.chars().count() as u32;
        if total == 0 {
            return None;
        }
        let target = (cursor - 1).min(total - 1);
        let mut line = 1u32;
        let mut column = 1u32;
        for (index, ch) in statement_sql.chars().enumerate() {
            if index as u32 == target {
                return Some(Self { line, column, offset: target });
            }
            if ch == '\n' {
                line += 1;
                column = 1;
            } else {
                column += 1;
            }
        }
        None
    }
}

/// Encode a raw cursor as the transport suffix.
pub fn encode_marker(cursor: u32) -> String {
    format!("{SQL_ERROR_POSITION_MARKER}{cursor}")
}

/// Remove a trailing marker from `message` and return the raw cursor it carried.
///
/// A malformed or absent suffix leaves `message` untouched and returns `None`.
pub fn take_marker(message: &mut String) -> Option<u32> {
    let index = message.rfind(SQL_ERROR_POSITION_MARKER)?;
    let cursor = message[index + SQL_ERROR_POSITION_MARKER.len()..].trim().parse::<u32>().ok()?;
    message.truncate(index);
    Some(cursor)
}

/// Return `message` with any transport suffix stripped.
pub fn strip_marker(message: &str) -> String {
    let mut owned = message.to_string();
    let _ = take_marker(&mut owned);
    owned
}

/// Resolve an error `message` (possibly carrying a cursor marker) against the
/// executed statement text into a cleaned message plus a typed position.
pub fn resolve_message(message: &str, statement_sql: &str) -> Option<(String, SqlErrorPosition)> {
    let mut cleaned = message.to_string();
    let cursor = take_marker(&mut cleaned)?;
    let position = SqlErrorPosition::from_pg_cursor(statement_sql, cursor)?;
    Some((cleaned, position))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_maps_to_line_and_column() {
        let sql = "SELECT *\nFROM no_such_table";
        // 1-based cursor of the 'n' in no_such_table (second line, column 6).
        let cursor = sql.find("no_such_table").unwrap() as u32 + 1;
        let position = SqlErrorPosition::from_pg_cursor(sql, cursor).unwrap();
        assert_eq!(position.line, 2);
        assert_eq!(position.column, 6);
        assert_eq!(position.offset, sql[..sql.find("no_such_table").unwrap()].chars().count() as u32);
    }

    #[test]
    fn first_character_is_line_one_column_one() {
        let position = SqlErrorPosition::from_pg_cursor("SELECT 1", 1).unwrap();
        assert_eq!((position.line, position.column, position.offset), (1, 1, 0));
    }

    #[test]
    fn crlf_treats_carriage_return_as_a_column() {
        let sql = "SELECT 1\r\nFROM t";
        let cursor = sql.find("FROM").unwrap() as u32 + 1;
        let position = SqlErrorPosition::from_pg_cursor(sql, cursor).unwrap();
        assert_eq!(position.line, 2);
        assert_eq!(position.column, 1);
    }

    #[test]
    fn multi_byte_characters_count_as_one_column() {
        // '表' is 3 UTF-8 bytes; cursor positions are character based.
        let sql = "SELECT '表' FROM t";
        let from_byte = sql.find("FROM").unwrap();
        let cursor = sql[..from_byte].chars().count() as u32 + 1;
        let position = SqlErrorPosition::from_pg_cursor(sql, cursor).unwrap();
        assert_eq!(position.line, 1);
        assert_eq!(position.column, 12);
        assert_eq!(position.offset, 11);
    }

    #[test]
    fn cursor_past_end_is_clamped() {
        let sql = "SELECT";
        let position = SqlErrorPosition::from_pg_cursor(sql, 999).unwrap();
        assert_eq!(position.offset, 5);
        assert_eq!(position.column, 6);
    }

    #[test]
    fn zero_cursor_and_empty_sql_are_rejected() {
        assert!(SqlErrorPosition::from_pg_cursor("SELECT 1", 0).is_none());
        assert!(SqlErrorPosition::from_pg_cursor("", 1).is_none());
    }

    #[test]
    fn marker_round_trips_and_strips() {
        let mut message = format!("ERROR: relation does not exist{}", encode_marker(15));
        assert_eq!(take_marker(&mut message), Some(15));
        assert_eq!(message, "ERROR: relation does not exist");

        let mut without_marker = "ERROR: nope".to_string();
        assert_eq!(take_marker(&mut without_marker), None);
        assert_eq!(without_marker, "ERROR: nope");
    }

    #[test]
    fn malformed_marker_is_left_untouched() {
        let text = format!("{SQL_ERROR_POSITION_MARKER}not-a-number");
        let mut message = text.clone();
        assert_eq!(take_marker(&mut message), None);
        assert_eq!(message, text);
    }

    #[test]
    fn resolve_message_strips_marker_and_resolves_position() {
        let sql = "SELECT 1\nFROM missing";
        let cursor = sql.find("missing").unwrap() as u32 + 1;
        let raw = format!("ERROR: relation \"missing\" does not exist{}", encode_marker(cursor));
        let (message, position) = resolve_message(&raw, sql).unwrap();
        assert_eq!(message, "ERROR: relation \"missing\" does not exist");
        assert_eq!(position.line, 2);
        assert_eq!(position.column, 6);
    }

    #[test]
    fn strip_marker_without_marker_is_identity() {
        assert_eq!(strip_marker("ERROR: x"), "ERROR: x");
    }
}
