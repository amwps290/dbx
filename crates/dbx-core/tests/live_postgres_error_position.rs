//! Live PostgreSQL verification of the SQL error-position plumbing.
//!
//! Requires a writable/connectable PostgreSQL pointed at by `DBX_LIVE_POSTGRES_*`
//! (same variables as the other `live_postgres_*` tests). Run with:
//!
//! ```text
//! DBX_LIVE_POSTGRES_HOST=... DBX_LIVE_POSTGRES_PORT=... \
//! DBX_LIVE_POSTGRES_USER=... DBX_LIVE_POSTGRES_PASSWORD=... \
//! DBX_LIVE_POSTGRES_DATABASE=... \
//! cargo test -p dbx-core --no-default-features --test live_postgres_error_position -- --ignored
//! ```

use std::time::Duration;

use dbx_core::db::postgres;
use dbx_core::sql_error_position::{take_message_position, SQL_ERROR_POSITION_MARKER};

fn postgres_url() -> String {
    let host = std::env::var("DBX_LIVE_POSTGRES_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("DBX_LIVE_POSTGRES_PORT").ok().and_then(|value| value.parse().ok()).unwrap_or(5432);
    let user = std::env::var("DBX_LIVE_POSTGRES_USER").unwrap_or_else(|_| "postgres".to_string());
    let password = std::env::var("DBX_LIVE_POSTGRES_PASSWORD").unwrap_or_default();
    let database = std::env::var("DBX_LIVE_POSTGRES_DATABASE").unwrap_or_else(|_| "postgres".to_string());
    format!("postgres://{user}:{password}@{host}:{port}/{database}")
}

fn char_offset(haystack: &str, needle: &str) -> u32 {
    haystack[..haystack.find(needle).unwrap_or_else(|| panic!("`{needle}` not found"))].chars().count() as u32
}

#[tokio::test]
#[ignore = "requires DBX_LIVE_POSTGRES_* pointing at a PostgreSQL database"]
async fn live_pg_error_positions_resolve_against_the_executed_statement() {
    let pool = postgres::connect(&postgres_url(), Duration::from_secs(10)).await.expect("connect to PostgreSQL");

    // (sql, offending token)
    let cases = [
        // The exact shape DBX sends for the user's `select  * from no_such_table`
        // after pagination appends LIMIT.
        ("select  * from no_such_table LIMIT 100", "no_such_table"),
        // Multi-line statement: the position must land on the second line.
        ("SELECT *\nFROM no_such_table", "no_such_table"),
        // Unknown column inside a self-contained subquery (no metadata needed).
        ("SELECT no_such_col FROM (SELECT 1 AS x) AS t", "no_such_col"),
        // DML against a missing relation.
        ("INSERT INTO no_such_table VALUES (1)", "no_such_table"),
    ];

    for (sql, offending) in cases {
        let message = postgres::execute_query(&pool, sql).await.expect_err("statement must fail");
        assert!(message.contains(SQL_ERROR_POSITION_MARKER), "driver error must carry the position marker: {message}");

        let (cleaned, position) = take_message_position(&message, sql);
        assert!(!cleaned.contains(SQL_ERROR_POSITION_MARKER), "marker must be stripped: {cleaned}");
        let position = position.unwrap_or_else(|| panic!("position must resolve for {sql}"));

        let expected_offset = char_offset(sql, offending);
        assert_eq!(
            position.offset, expected_offset,
            "offset for `{offending}` in `{sql}` should be {expected_offset}, got {position:?}"
        );
        let line = sql[..sql.find(offending).unwrap()].matches('\n').count() + 1;
        assert_eq!(position.line as usize, line, "line for `{offending}` in `{sql}`");
        // Column is 1-based and counted from the start of the line.
        let line_start = sql[..sql.find(offending).unwrap()].rfind('\n').map_or(0, |index| index + 1);
        let expected_column = sql[line_start..sql.find(offending).unwrap()].chars().count() as u32 + 1;
        assert_eq!(position.column, expected_column, "column for `{offending}` in `{sql}`");
    }

    // A syntax error still produces a usable position (points at the bad token).
    let syntax_sql = "SELECT * FROMM no_such_table";
    let message = postgres::execute_query(&pool, syntax_sql).await.expect_err("syntax error");
    let (_, position) = take_message_position(&message, syntax_sql);
    let position = position.expect("syntax error must carry a position");
    assert_eq!(position.offset, char_offset(syntax_sql, "FROMM"), "syntax error should point at FROMM");

    pool.close();
}
