//! Small JSON parser and writer (meta files, `claude agents --json`).
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

const MAX_DEPTH: usize = 32;

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(kv) => kv.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        if let Value::Str(s) = self { Some(s) } else { None }
    }
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Num(n) if n.fract() == 0.0 && n.abs() < 9e15 => Some(*n as i64),
            _ => None,
        }
    }
    pub fn as_arr(&self) -> Option<&[Value]> {
        if let Value::Arr(a) = self { Some(a) } else { None }
    }
    pub fn str(s: &str) -> Value {
        Value::Str(s.to_string())
    }
    pub fn num(n: impl Into<f64>) -> Value {
        Value::Num(n.into())
    }
}

pub fn parse(s: &str) -> Result<Value, String> {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i != p.b.len() {
        return Err(format!("trailing data at {}", p.i));
    }
    Ok(v)
}

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

impl P<'_> {
    fn ws(&mut self) {
        while matches!(self.b.get(self.i), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn eat(&mut self, c: u8) -> Result<(), String> {
        if self.b.get(self.i) == Some(&c) {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at {}", c as char, self.i))
        }
    }
    fn lit(&mut self, word: &str, v: Value) -> Result<Value, String> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(format!("bad literal at {}", self.i))
        }
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > MAX_DEPTH {
            return Err("nested too deep".into());
        }
        self.ws();
        match self.b.get(self.i) {
            None => Err("unexpected end".into()),
            Some(b'n') => self.lit("null", Value::Null),
            Some(b't') => self.lit("true", Value::Bool(true)),
            Some(b'f') => self.lit("false", Value::Bool(false)),
            Some(b'"') => self.string().map(Value::Str),
            Some(b'[') => {
                self.i += 1;
                let mut a = vec![];
                self.ws();
                if self.b.get(self.i) == Some(&b']') {
                    self.i += 1;
                    return Ok(Value::Arr(a));
                }
                loop {
                    a.push(self.value(depth + 1)?);
                    self.ws();
                    match self.b.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Value::Arr(a));
                        }
                        _ => return Err(format!("bad array at {}", self.i)),
                    }
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut o = vec![];
                self.ws();
                if self.b.get(self.i) == Some(&b'}') {
                    self.i += 1;
                    return Ok(Value::Obj(o));
                }
                loop {
                    self.ws();
                    let k = self.string()?;
                    self.ws();
                    self.eat(b':')?;
                    o.push((k, self.value(depth + 1)?));
                    self.ws();
                    match self.b.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Value::Obj(o));
                        }
                        _ => return Err(format!("bad object at {}", self.i)),
                    }
                }
            }
            Some(_) => {
                let st = self.i;
                while matches!(self.b.get(self.i), Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')) {
                    self.i += 1;
                }
                let t = std::str::from_utf8(&self.b[st..self.i]).map_err(|e| e.to_string())?;
                t.parse::<f64>().map(Value::Num).map_err(|_| format!("bad value at {st}"))
            }
        }
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let h = self.b.get(self.i..self.i + 4).ok_or("short \\u escape")?;
        let s = std::str::from_utf8(h).map_err(|_| "bad \\u escape")?;
        self.i += 4;
        u32::from_str_radix(s, 16).map_err(|_| "bad \\u escape".to_string())
    }
    fn string(&mut self) -> Result<String, String> {
        self.eat(b'"')?;
        let mut out: Vec<u8> = vec![];
        loop {
            let c = *self.b.get(self.i).ok_or("unterminated string")?;
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(out).map_err(|_| "bad utf-8".to_string()),
                0..=0x1f => return Err("control character in string".into()),
                b'\\' => {
                    let e = *self.b.get(self.i).ok_or("unterminated escape")?;
                    self.i += 1;
                    let ch = match e {
                        b'"' => '"',
                        b'\\' => '\\',
                        b'/' => '/',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'n' => '\n',
                        b'r' => '\r',
                        b't' => '\t',
                        b'u' => {
                            let mut cp = self.hex4()?;
                            if (0xd800..0xdc00).contains(&cp) {
                                if self.b.get(self.i..self.i + 2) != Some(b"\\u") {
                                    return Err("lone surrogate".into());
                                }
                                self.i += 2;
                                let lo = self.hex4()?;
                                if !(0xdc00..0xe000).contains(&lo) {
                                    return Err("bad surrogate pair".into());
                                }
                                cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                            }
                            char::from_u32(cp).ok_or("bad code point")?
                        }
                        _ => return Err("bad escape".into()),
                    };
                    let mut tmp = [0u8; 4];
                    out.extend_from_slice(ch.encode_utf8(&mut tmp).as_bytes());
                }
                _ => out.push(c),
            }
        }
    }
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Value::Null => f.write_str("null"),
            Value::Bool(b) => write!(f, "{b}"),
            Value::Num(n) if n.fract() == 0.0 && n.abs() < 9e15 => write!(f, "{}", *n as i64),
            Value::Num(n) if n.is_finite() => write!(f, "{n}"),
            Value::Num(_) => f.write_str("null"),
            Value::Str(s) => write_str(f, s),
            Value::Arr(a) => {
                f.write_str("[")?;
                for (i, v) in a.iter().enumerate() {
                    if i > 0 {
                        f.write_str(",")?;
                    }
                    write!(f, "{v}")?;
                }
                f.write_str("]")
            }
            Value::Obj(o) => {
                f.write_str("{")?;
                for (i, (k, v)) in o.iter().enumerate() {
                    if i > 0 {
                        f.write_str(",")?;
                    }
                    write_str(f, k)?;
                    write!(f, ":{v}")?;
                }
                f.write_str("}")
            }
        }
    }
}

fn write_str(f: &mut std::fmt::Formatter<'_>, s: &str) -> std::fmt::Result {
    f.write_str("\"")?;
    for c in s.chars() {
        match c {
            '"' => f.write_str("\\\"")?,
            '\\' => f.write_str("\\\\")?,
            '\n' => f.write_str("\\n")?,
            '\r' => f.write_str("\\r")?,
            '\t' => f.write_str("\\t")?,
            c if (c as u32) < 0x20 => write!(f, "\\u{:04x}", c as u32)?,
            c => write!(f, "{c}")?,
        }
    }
    f.write_str("\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_and_escapes() {
        let v = parse(r#" {"a":[1,-2.5,true,null,"x\n\u00e9\ud83d\ude00"],"b":{"c":""}} "#).unwrap();
        assert_eq!(v.get("a").unwrap().as_arr().unwrap().len(), 5);
        assert_eq!(v.get("a").unwrap().as_arr().unwrap()[4].as_str(), Some("x\n\u{e9}\u{1F600}"));
        assert_eq!(v.get("b").unwrap().get("c").unwrap().as_str(), Some(""));
    }

    #[test]
    fn rejects_bad_input() {
        for bad in ["", "{", "[1,]", "{\"a\"}", "\"x", "[1] x", "\"\\ud800\"", "tru", "\"a\nb\""] {
            assert!(parse(bad).is_err(), "{bad:?}");
        }
        assert!(parse(&"[".repeat(100)).is_err());
    }

    #[test]
    fn write_then_parse_is_identity() {
        let v = Value::Obj(vec![
            ("s".into(), Value::str("q\"\\\n\u{1}é")),
            ("n".into(), Value::num(1_700_000_000_123_456_f64)),
            ("a".into(), Value::Arr(vec![Value::Null, Value::Bool(false), Value::num(-7)])),
        ]);
        assert_eq!(parse(&v.to_string()).unwrap(), v);
        assert_eq!(Value::num(3).as_i64(), Some(3));
        assert_eq!(Value::num(3.5).as_i64(), None);
    }
}
