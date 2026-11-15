use serde::Serialize;
use serde_json::{
    ser::{CompactFormatter, Formatter, PrettyFormatter},
    Value,
};
use std::io::{self, Write};

/// Parse finite JSON numbers as ECMAScript Numbers, including rounding integers
/// beyond 2^53, and enumerate integer-index properties as JSON.parse objects do.
/// Overflowed numbers and unpaired UTF-16 surrogates remain explicit gaps.
pub fn parse_js_json(source: &[u8]) -> Result<Value, serde_json::Error> {
    let mut value = serde_json::from_slice(source)?;
    normalize_numbers(&mut value);
    crate::javascript_json_order(&mut value);
    Ok(value)
}

fn normalize_numbers(value: &mut Value) {
    match value {
        Value::Number(number) => {
            if let Some(double) = number.as_f64() {
                *number = serde_json::Number::from_f64(double).expect("JSON numbers are finite");
            }
        }
        Value::Array(items) => items.iter_mut().for_each(normalize_numbers),
        Value::Object(object) => object.values_mut().for_each(normalize_numbers),
        _ => {}
    }
}

struct JsFormatter<F>(F);
fn number<W: ?Sized + Write>(writer: &mut W, value: f64) -> io::Result<()> {
    if !value.is_finite() {
        return writer.write_all(b"null");
    }
    let mut buffer = ryu_js::Buffer::new();
    writer.write_all(buffer.format_finite(value).as_bytes())
}
macro_rules! delegate {
    ($name:ident $(, $arg:ident : $type:ty)*) => {
        fn $name<W: ?Sized + Write>(&mut self, writer: &mut W, $($arg: $type),*) -> io::Result<()> {
            self.0.$name(writer, $($arg),*)
        }
    };
}
impl<F: Formatter> Formatter for JsFormatter<F> {
    fn write_f64<W: ?Sized + Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        number(writer, value)
    }
    fn write_i64<W: ?Sized + Write>(&mut self, writer: &mut W, value: i64) -> io::Result<()> {
        number(writer, value as f64)
    }
    fn write_u64<W: ?Sized + Write>(&mut self, writer: &mut W, value: u64) -> io::Result<()> {
        number(writer, value as f64)
    }
    delegate!(begin_array);
    delegate!(end_array);
    delegate!(begin_array_value, first: bool);
    delegate!(end_array_value);
    delegate!(begin_object);
    delegate!(end_object);
    delegate!(begin_object_key, first: bool);
    delegate!(end_object_key);
    delegate!(begin_object_value);
    delegate!(end_object_value);
}

/// Serialize values with JavaScript number spelling. The caller controls object
/// property order; the bounded wire writer orders the response before this call.
pub fn write_js_json(
    writer: impl Write,
    value: &Value,
    pretty: bool,
) -> Result<(), serde_json::Error> {
    if pretty {
        value.serialize(&mut serde_json::Serializer::with_formatter(
            writer,
            JsFormatter(PrettyFormatter::new()),
        ))
    } else {
        value.serialize(&mut serde_json::Serializer::with_formatter(
            writer,
            JsFormatter(CompactFormatter),
        ))
    }
}

/// JSON.stringify-compatible enumeration and finite numeric formatting, including
/// the two-space indentation used for desktop tool arguments. Not a general JS
/// value serializer: JSON's undefined and invalid-Unicode limits still apply.
pub fn to_js_string(value: &Value, pretty: bool) -> Result<String, serde_json::Error> {
    let mut value = value.clone();
    crate::javascript_json_order(&mut value);
    let mut bytes = Vec::new();
    write_js_json(&mut bytes, &value, pretty)?;
    Ok(String::from_utf8(bytes).expect("JSON writer produces UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_numbers_use_javascript_rounding_and_spelling() {
        let value = parse_js_json(br#"[9007199254740993,-0,1e-7,1e20,1e21,0.000001]"#).unwrap();
        assert_eq!(
            to_js_string(&value, false).unwrap(),
            "[9007199254740992,0,1e-7,100000000000000000000,1e+21,0.000001]"
        );
    }
    #[test]
    fn pretty_format_keeps_source_keys_and_sorts_array_indexes() {
        let value = parse_js_json(br#"{"z":1.0,"2":-0,"1":1e21,"a":[0.000001,1e-7]}"#).unwrap();
        assert_eq!(to_js_string(&value, true).unwrap(), "{\n  \"1\": 1e+21,\n  \"2\": 0,\n  \"z\": 1,\n  \"a\": [\n    0.000001,\n    1e-7\n  ]\n}");
    }
}
