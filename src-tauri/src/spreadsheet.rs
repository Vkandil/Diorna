use std::path::Path;

use rust_xlsxwriter::{Format, FormatAlign, Workbook};
use serde::Deserialize;

use crate::error::{DiornaError, Result};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetInput {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

pub fn export_xlsx(path: &Path, sheets: Vec<SheetInput>) -> Result<()> {
    if sheets.is_empty() {
        return Err(DiornaError::InvalidData(
            "An export needs at least one sheet".into(),
        ));
    }
    let mut workbook = Workbook::new();
    let header = Format::new().set_bold().set_align(FormatAlign::Center);
    for sheet in sheets {
        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name(safe_sheet_name(&sheet.name))
            .map_err(xlsx_error)?;
        worksheet.set_freeze_panes(1, 1).map_err(xlsx_error)?;
        worksheet.set_column_width(0, 24).map_err(xlsx_error)?;
        for (row_index, row) in sheet.rows.iter().enumerate() {
            for (column_index, value) in row.iter().enumerate() {
                let row = u32::try_from(row_index).map_err(|_| {
                    DiornaError::InvalidData("Spreadsheet has too many rows".into())
                })?;
                let column = u16::try_from(column_index).map_err(|_| {
                    DiornaError::InvalidData("Spreadsheet has too many columns".into())
                })?;
                if row_index == 0 {
                    worksheet
                        .write_string_with_format(row, column, value, &header)
                        .map_err(xlsx_error)?;
                } else if column_index > 0 {
                    if let Ok(number) = value.parse::<f64>() {
                        worksheet
                            .write_number(row, column, number)
                            .map_err(xlsx_error)?;
                    } else {
                        worksheet
                            .write_string(row, column, value)
                            .map_err(xlsx_error)?;
                    }
                } else {
                    worksheet
                        .write_string(row, column, value)
                        .map_err(xlsx_error)?;
                }
            }
        }
    }
    workbook.save(path).map_err(xlsx_error)
}

fn safe_sheet_name(name: &str) -> String {
    let mut value: String = name
        .chars()
        .filter(|character| !matches!(character, ':' | '\\' | '/' | '?' | '*' | '[' | ']'))
        .take(31)
        .collect();
    if value.is_empty() {
        value.push_str("Diorna");
    }
    value
}

fn xlsx_error(error: rust_xlsxwriter::XlsxError) -> DiornaError {
    DiornaError::InvalidData(format!("Could not create XLSX export: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_valid_xlsx_archive() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("daily.xlsx");
        export_xlsx(
            &path,
            vec![SheetInput {
                name: "Habits/invalid".into(),
                rows: vec![
                    vec!["Habit".into(), "2026-07-22".into()],
                    vec!["Read".into(), "1".into()],
                ],
            }],
        )
        .unwrap();
        let bytes = std::fs::read(path).unwrap();
        assert!(bytes.starts_with(b"PK"));
    }
}
