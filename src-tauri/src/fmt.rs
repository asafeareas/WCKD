//! Formatação pt-BR usada nas mensagens geradas pelo backend (análises e relatórios).

/// 123456 -> "R$ 1.234,56"
pub fn brl(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.unsigned_abs();
    format!("{sign}R$ {},{:02}", thousands(abs / 100), abs % 100)
}

/// 123456 -> "1234,56" (sem símbolo e sem separador de milhar; usado em CSV)
pub fn decimal(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.unsigned_abs();
    format!("{sign}{},{:02}", abs / 100, abs % 100)
}

fn thousands(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(ch);
    }
    out
}

/// Percentual: inteiro a partir de 10%, uma casa decimal abaixo disso. Ex.: "23%", "4,5%".
pub fn pct(value: f64) -> String {
    let abs = value.abs();
    if abs >= 10.0 || (abs * 10.0).round() % 10.0 == 0.0 {
        format!("{:.0}%", value.round())
    } else {
        format!("{:.1}%", value).replace('.', ",")
    }
}

/// "2026-03-05" -> "05/03/2026"
pub fn date_br(iso: &str) -> String {
    let p: Vec<&str> = iso.split('-').collect();
    if p.len() == 3 {
        format!("{}/{}/{}", p[2], p[1], p[0])
    } else {
        iso.to_string()
    }
}

const MONTHS: [&str; 12] = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
    "outubro", "novembro", "dezembro",
];

pub fn month_name(month: u32) -> &'static str {
    MONTHS[(month as usize).saturating_sub(1) % 12]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_brl() {
        assert_eq!(brl(0), "R$ 0,00");
        assert_eq!(brl(5), "R$ 0,05");
        assert_eq!(brl(123456), "R$ 1.234,56");
        assert_eq!(brl(-100000000), "-R$ 1.000.000,00");
        assert_eq!(decimal(-123456), "-1234,56");
    }

    #[test]
    fn formats_pct() {
        assert_eq!(pct(23.4), "23%");
        assert_eq!(pct(4.54), "4,5%");
        assert_eq!(pct(5.0), "5%");
        assert_eq!(pct(-12.6), "-13%");
    }

    #[test]
    fn formats_date() {
        assert_eq!(date_br("2026-03-05"), "05/03/2026");
    }
}
