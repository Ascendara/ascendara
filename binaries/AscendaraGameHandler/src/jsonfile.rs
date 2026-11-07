use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

use crate::{error, pypath};

pub fn read(path: &str) -> Result<Value> {
    let text = fs::read_to_string(path).with_context(|| format!("No such file or directory: '{path}'"))?;
    Ok(serde_json::from_str(&text)?)
}

/// Serialize like Python's json.dump(data, f, indent=4).
fn to_pretty(data: &Value) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut ser = serde_json::Serializer::with_formatter(&mut out, formatter);
    serde::Serialize::serialize(data, &mut ser)?;
    Ok(out)
}

/// Write to a temp file in the same directory, fsync, then rename over the target
/// so a crash or power loss never leaves a half-written JSON file behind.
pub fn atomic_write(path: &str, data: &Value) -> Result<()> {
    let result = (|| -> Result<()> {
        let dir = match pypath::dirname(path) {
            d if d.is_empty() => ".".to_string(),
            d => d,
        };
        let bytes = to_pretty(data)?;
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let (temp, mut file) = loop {
            let name = format!(
                ".tmp_{}_{}_{}.json",
                std::process::id(),
                chrono::Local::now().timestamp_nanos_opt().unwrap_or(0),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            let temp = Path::new(&dir).join(name);
            match OpenOptions::new().write(true).create_new(true).open(&temp) {
                Ok(file) => break (temp, file),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            }
        };
        let written = file.write_all(&bytes).and_then(|_| file.sync_all());
        drop(file);
        // fs::rename replaces an existing target on every platform
        if let Err(e) = written.and_then(|_| fs::rename(&temp, path)) {
            let _ = fs::remove_file(&temp);
            bail!(e);
        }
        Ok(())
    })();
    if let Err(e) = &result {
        error!("Failed to atomically write JSON to {path}: {e}");
    }
    result
}

/// Python truthiness for a JSON value.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|n| n != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

/// `obj[key] = obj.get(key, 0) + delta`, keeping integers as integers.
pub fn add_number(obj: &mut Value, key: &str, delta: i64, floor_zero: bool) -> Result<()> {
    let Some(map) = obj.as_object_mut() else { bail!("JSON root is not an object") };
    let current = map.get(key).cloned().unwrap_or(Value::from(0));
    let updated = if let Some(n) = current.as_i64() {
        let n = n + delta;
        Value::from(if floor_zero { n.max(0) } else { n })
    } else if let Some(n) = current.as_f64() {
        let n = n + delta as f64;
        Value::from(if floor_zero { n.max(0.0) } else { n })
    } else {
        bail!("unsupported operand type for +=: '{current}' and 'int'");
    };
    map.insert(key.to_string(), updated);
    Ok(())
}

/// Python str() of a JSON value used as a command-line argument.
pub fn as_arg(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(true) => "True".into(),
        Value::Bool(false) => "False".into(),
        Value::Null => "None".into(),
        other => other.to_string(),
    }
}
