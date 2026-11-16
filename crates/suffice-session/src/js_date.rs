//! Bounded ECMAScript Date conversion for JSON values. Parsing intentionally
//! covers common ISO and legacy forms, not V8's complete implementation.
use serde_json::Value;

const LIMIT: i64 = 8_640_000_000_000_000;

pub fn timestamp(value: Option<&Value>) -> Result<Option<i64>, String> {
    let Some(value) = value else { return Ok(None) };
    match value {
        Value::Null => Ok(Some(0)),
        Value::Bool(b) => Ok(Some(i64::from(*b))),
        Value::Number(n) => Ok(n
            .as_f64()
            .and_then(|n| (n.is_finite() && n.abs() <= LIMIT as f64).then_some(n.trunc() as i64))),
        Value::String(s) => Ok(parse(s)),
        Value::Array(_) => Ok(parse(&array_string(value)?)),
        Value::Object(o) => {
            if o.contains_key("toString") {
                Err("Cannot convert object to primitive value".into())
            } else {
                Ok(None)
            }
        }
    }
}

fn array_string(value: &Value) -> Result<String, String> {
    match value {
        Value::Null => Ok(String::new()),
        Value::String(s) => Ok(s.clone()),
        Value::Array(a) => a
            .iter()
            .map(array_string)
            .collect::<Result<Vec<_>, _>>()
            .map(|a| a.join(",")),
        Value::Object(o) => {
            // Array#join uses the string hint: an own non-callable toString is
            // skipped and the inherited valueOf returns an object, so it throws.
            if o.contains_key("toString") {
                Err("Cannot convert object to primitive value".into())
            } else {
                Ok("[object Object]".into())
            }
        }
        _ => crate::to_js_string(value, false).map_err(|e| e.to_string()),
    }
}

#[derive(Clone, Copy)]
struct Parts {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    ms: u32,
}

// Proleptic Gregorian days since 1970-01-01 (Howard Hinnant's civil-date algorithm).
fn days(y: i32, m: u32, d: u32) -> i64 {
    let y = i64::from(y) - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = i64::from(m) + if m > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468
}
fn finish(p: Parts, offset: Option<i32>) -> Option<i64> {
    if !(1..=12).contains(&p.month)
        || !(1..=31).contains(&p.day)
        || p.hour > 24
        || p.minute > 59
        || p.second > 59
        || (p.hour == 24 && (p.minute != 0 || p.second != 0 || p.ms != 0))
    {
        return None;
    }
    let local_ms = days(p.year, p.month, p.day)
        .checked_mul(86_400_000)?
        .checked_add(
            i64::from(p.hour) * 3_600_000
                + i64::from(p.minute) * 60_000
                + i64::from(p.second) * 1000
                + i64::from(p.ms),
        )?;
    let result = if let Some(offset) = offset {
        local_ms.checked_sub(i64::from(offset) * 60_000)?
    } else {
        local_time(p, local_ms)?
    };
    (result.abs() <= LIMIT).then_some(result)
}

fn local_time(p: Parts, local_ms: i64) -> Option<i64> {
    // Jiff uses the same compatible policy as Date for gaps and overlaps.
    // Beyond its civil year range, map the Gregorian cycle into a year with
    // equivalent weekdays and the time zone's post- or pre-transition rules.
    let mapped_year = if p.year > 9998 {
        2400 + p.year.rem_euclid(400)
    } else if p.year < -9998 {
        -9600 + p.year.rem_euclid(400)
    } else {
        p.year
    };
    let delta_days = days(mapped_year, p.month, p.day) - days(p.year, p.month, p.day);
    let mapped_ms = local_ms.checked_add(delta_days.checked_mul(86_400_000)?)?;
    let naive = jiff::Timestamp::from_millisecond(mapped_ms)
        .ok()?
        .to_zoned(jiff::tz::TimeZone::UTC)
        .datetime();
    let resolved = jiff::tz::TimeZone::system()
        .to_zoned(naive)
        .ok()?
        .timestamp()
        .as_millisecond();
    local_ms.checked_add(resolved.checked_sub(mapped_ms)?)
}

fn digits(s: &str) -> Option<u32> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        None
    } else {
        s.parse().ok()
    }
}
fn parse(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(result) = iso(s) {
        return result;
    }
    legacy(s)
}
// Outer Option indicates that the ISO grammar matched: invalid ISO forms must
// not be reinterpreted as legacy after matching its strict date-time grammar.
fn iso(s: &str) -> Option<Option<i64>> {
    if !s.is_ascii() {
        return None;
    }
    let (year, rest) = if s.starts_with(['+', '-']) {
        if s.len() < 7 {
            return None;
        }
        let n = digits(&s[1..7])? as i32;
        if s.starts_with('-') && n == 0 {
            if s.contains(['T', 't']) {
                return Some(None);
            }
            return None;
        }
        (if s.starts_with('-') { -n } else { n }, &s[7..])
    } else {
        if s.len() < 4 {
            return None;
        }
        (digits(&s[..4])? as i32, &s[4..])
    };
    let mut p = Parts {
        year,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        ms: 0,
    };
    let mut r = rest;
    if r.starts_with('-') {
        if r.len() < 3 {
            return None;
        }
        p.month = digits(&r[1..3])?;
        r = &r[3..];
        if r.starts_with('-') {
            if r.len() < 3 {
                return None;
            }
            p.day = digits(&r[1..3])?;
            r = &r[3..];
        }
    }
    if r.is_empty() {
        // Invalid date-only forms may be reinterpreted by V8's legacy parser.
        let result = finish(p, Some(0));
        return if s.starts_with(['+', '-']) {
            Some(result)
        } else {
            result.map(Some)
        };
    }
    if !r.starts_with(['T', 't']) {
        return None;
    }
    r = &r[1..];
    if r.len() < 5 || &r[2..3] != ":" {
        return Some(None);
    }
    p.hour = match digits(&r[..2]) {
        Some(n) => n,
        None => return Some(None),
    };
    p.minute = match digits(&r[3..5]) {
        Some(n) => n,
        None => return Some(None),
    };
    r = &r[5..];
    if r.starts_with(':') {
        if r.len() < 3 {
            return Some(None);
        }
        p.second = match digits(&r[1..3]) {
            Some(n) => n,
            None => return Some(None),
        };
        r = &r[3..];
        if r.starts_with('.') {
            r = &r[1..];
            let n = r.bytes().take_while(u8::is_ascii_digit).count();
            if n == 0 {
                return Some(None);
            }
            let frac = &r[..n.min(3)];
            p.ms = digits(frac).unwrap() * 10_u32.pow((3 - frac.len()) as u32);
            r = &r[n..];
        }
    }
    let offset = if r.is_empty() {
        None
    } else if r == "Z" || r == "z" {
        Some(0)
    } else if (r.len() == 6 || r.len() == 5)
        && (r.starts_with('+') || r.starts_with('-'))
        && (r.len() == 5 || &r[3..4] == ":")
    {
        let h = match digits(&r[1..3]) {
            Some(n) => n,
            None => return Some(None),
        };
        let m = match digits(&r[r.len() - 2..]) {
            Some(n) => n,
            None => return Some(None),
        };
        if h > 23 || m > 59 {
            return Some(None);
        }
        Some((h as i32 * 60 + m as i32) * if r.starts_with('-') { -1 } else { 1 })
    } else {
        return Some(None);
    };
    Some(finish(p, offset))
}

fn legacy(s: &str) -> Option<i64> {
    if !s.is_ascii() {
        return None;
    }
    let s = if let Some(rest) = s.strip_prefix("-000000-") {
        rest
    } else {
        s
    };
    let lower = s.to_ascii_lowercase();
    let mut text = lower.as_str();
    let mut offset = None;
    // Common RFC-2822 zones. Other abbreviations and V8's permissive comments
    // are intentionally outside this bounded parser.
    for (suffix, minutes) in [
        (" gmt", 0),
        (" utc", 0),
        (" ut", 0),
        (" est", -300),
        (" edt", -240),
        (" cst", -360),
        (" cdt", -300),
        (" mst", -420),
        (" mdt", -360),
        (" pst", -480),
        (" pdt", -420),
    ] {
        if let Some(prefix) = text.strip_suffix(suffix) {
            text = prefix;
            offset = Some(minutes);
            break;
        }
    }
    if offset.is_none() && text.len() >= 5 {
        let tail = &text[text.len() - 5..];
        if (tail.starts_with('+') || tail.starts_with('-'))
            && tail[1..].bytes().all(|b| b.is_ascii_digit())
        {
            let h = digits(&tail[1..3])?;
            let m = digits(&tail[3..])?;
            if h > 23 || m > 59 {
                return None;
            }
            offset = Some((h as i32 * 60 + m as i32) * if tail.starts_with('-') { -1 } else { 1 });
            text = text[..text.len() - 5].trim_end();
        }
    }
    let mut p = Parts {
        year: 0,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        ms: 0,
    };
    let mut fields = Vec::new();
    let mut month = None;
    for token in text.split(|c: char| c.is_ascii_whitespace() || c == ',' || c == '/' || c == '-') {
        if token.is_empty() {
            continue;
        }
        if token.contains(':') {
            let (clock, fraction) = token.split_once('.').unwrap_or((token, ""));
            let components: Vec<_> = clock.split(':').collect();
            if !(2..=3).contains(&components.len()) {
                return None;
            }
            p.hour = digits(components[0])?;
            p.minute = digits(components[1])?;
            if components.len() == 3 {
                p.second = digits(components[2])?;
            }
            if !fraction.is_empty() {
                let f = &fraction[..fraction.len().min(3)];
                p.ms = digits(f)? * 10_u32.pow((3 - f.len()) as u32);
            }
        } else if token.as_bytes()[0].is_ascii_alphabetic() {
            let three = token.get(..3)?;
            if let Some(i) = [
                "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
            ]
            .iter()
            .position(|m| *m == three)
            {
                if month.replace(i as u32 + 1).is_some() {
                    return None;
                }
            } else if !["sun", "mon", "tue", "wed", "thu", "fri", "sat"].contains(&three) {
                return None;
            }
        } else {
            fields.push((digits(token)?, token.len()));
        }
    }
    if let Some(m) = month {
        if fields.len() != 2 {
            return None;
        }
        p.month = m;
        p.day = fields[0].0;
        p.year = short_year(fields[1].0, fields[1].1)?;
    } else if fields.len() == 1 {
        let (n, len) = fields[0];
        if len <= 2 && n <= 12 {
            p.year = if n == 0 { 2000 } else { 2001 };
            p.month = n.max(1);
        } else if len <= 2 && n < 50 {
            if n < 32 {
                return None;
            }
            p.year = 2000 + n as i32;
        } else {
            p.year = short_year(n, len)?;
        }
    } else if fields.len() == 2 {
        p.month = fields[0].0;
        p.day = fields[1].0;
        p.year = 2001;
    } else if fields.len() == 3 {
        if fields[0].0 > 31 {
            p.year = short_year(fields[0].0, fields[0].1)?;
            p.month = fields[1].0;
            p.day = fields[2].0;
        } else {
            p.month = fields[0].0;
            p.day = fields[1].0;
            p.year = short_year(fields[2].0, fields[2].1)?;
        }
    } else {
        return None;
    }
    finish(p, offset)
}
fn short_year(year: u32, _len: usize) -> Option<i32> {
    if year <= 99 {
        Some(if year <= 49 {
            2000 + year as i32
        } else {
            1900 + year as i32
        })
    } else {
        i32::try_from(year).ok()
    }
}
