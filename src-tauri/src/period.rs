//! Utilitários de datas e meses. Datas trafegam como `YYYY-MM-DD` e meses como `YYYY-MM`.
//! Intervalos são sempre [início, fim) para respeitar os limites de cada mês e a virada do ano.

use chrono::{Datelike, Days, Months, NaiveDate};

use crate::error::{validation, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Month {
    pub year: i32,
    pub month: u32,
}

impl Month {
    pub fn new(year: i32, month: u32) -> AppResult<Self> {
        if !(1900..=2200).contains(&year) || !(1..=12).contains(&month) {
            return validation("Mês inválido.");
        }
        Ok(Self { year, month })
    }

    pub fn parse(s: &str) -> AppResult<Self> {
        let mut parts = s.trim().splitn(2, '-');
        let y = parts.next().and_then(|p| p.parse::<i32>().ok());
        let m = parts.next().and_then(|p| p.parse::<u32>().ok());
        match (y, m) {
            (Some(y), Some(m)) => Self::new(y, m),
            _ => validation("Mês inválido. Use o formato AAAA-MM."),
        }
    }

    pub fn from_date(d: NaiveDate) -> Self {
        Self { year: d.year(), month: d.month() }
    }

    fn index(self) -> i32 {
        self.year * 12 + self.month as i32 - 1
    }

    pub fn add(self, n: i32) -> Self {
        let idx = self.index() + n;
        Self { year: idx.div_euclid(12), month: (idx.rem_euclid(12) + 1) as u32 }
    }

    /// Quantidade de meses de `other` até `self`.
    pub fn diff(self, other: Month) -> i32 {
        self.index() - other.index()
    }

    pub fn first_day(self) -> NaiveDate {
        NaiveDate::from_ymd_opt(self.year, self.month, 1).expect("mês válido")
    }

    pub fn last_day(self) -> NaiveDate {
        self.add(1).first_day().pred_opt().expect("data válida")
    }

    pub fn key(self) -> String {
        format!("{:04}-{:02}", self.year, self.month)
    }

    /// Limites ISO [início, fim) do mês.
    pub fn bounds(self) -> (String, String) {
        (iso(self.first_day()), iso(self.add(1).first_day()))
    }
}

pub fn parse_date(s: &str) -> AppResult<NaiveDate> {
    match NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d") {
        Ok(d) if (1900..=2200).contains(&d.year()) => Ok(d),
        _ => validation("Data inválida."),
    }
}

pub fn iso(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn today() -> NaiveDate {
    chrono::Local::now().date_naive()
}

/// Soma meses a partir de uma data-base, ajustando para o último dia do mês quando necessário
/// (ex.: 31/01 + 1 mês = 28/02 ou 29/02). Sempre calcule a partir da data original para não
/// acumular desvios.
pub fn add_months(d: NaiveDate, n: u32) -> NaiveDate {
    d.checked_add_months(Months::new(n)).expect("data dentro do intervalo suportado")
}

pub fn add_days(d: NaiveDate, n: u64) -> NaiveDate {
    d.checked_add_days(Days::new(n)).expect("data dentro do intervalo suportado")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_arithmetic_crosses_year_boundary() {
        let jan = Month::parse("2026-01").unwrap();
        assert_eq!(jan.add(-1).key(), "2025-12");
        assert_eq!(jan.add(11).key(), "2026-12");
        assert_eq!(jan.add(12).key(), "2027-01");
        assert_eq!(jan.add(-13).key(), "2024-12");
        assert_eq!(jan.diff(Month::parse("2025-10").unwrap()), 3);
    }

    #[test]
    fn month_bounds_are_half_open() {
        let dec = Month::parse("2025-12").unwrap();
        assert_eq!(dec.bounds(), ("2025-12-01".into(), "2026-01-01".into()));
        assert_eq!(iso(Month::parse("2024-02").unwrap().last_day()), "2024-02-29");
    }

    #[test]
    fn add_months_clamps_to_month_end() {
        let d = parse_date("2026-01-31").unwrap();
        assert_eq!(iso(add_months(d, 1)), "2026-02-28");
        assert_eq!(iso(add_months(d, 2)), "2026-03-31");
    }

    #[test]
    fn rejects_invalid_input() {
        assert!(Month::parse("2026-13").is_err());
        assert!(Month::parse("abc").is_err());
        assert!(parse_date("2026-02-30").is_err());
        assert!(parse_date("31/12/2026").is_err());
    }
}
