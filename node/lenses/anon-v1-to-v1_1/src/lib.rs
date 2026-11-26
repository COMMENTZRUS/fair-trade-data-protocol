use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// FTDP v1.0.0 FtdpAnonRecord representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnonRecordV1 {
    pub record_id: String,
    pub deployment_id: String,
    pub uid_hash: String,
    pub data_id: Option<String>,
    pub schema_version: String,
    pub timestamp: i64,
    pub source: Option<String>,
    pub flags: String,
    pub anon_json: String,
}

/// FTDP v1.1.0 FtdpAnonRecord representation adding indexed `unionCategory`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnonRecordV1_1 {
    pub record_id: String,
    pub deployment_id: String,
    pub uid_hash: String,
    pub data_id: Option<String>,
    pub schema_version: String,
    pub timestamp: i64,
    pub source: Option<String>,
    pub flags: String,
    pub union_category: String,
    pub anon_json: String,
}

/// Forward LensVM transform: 1.0.0 -> 1.1.0
/// Extracts `topic` / `category` from `anonJson` into the top-level indexed `unionCategory` field
/// so Panorama (v1.1) and Top News (v1.0) records query seamlessly inside one Data Union.
pub fn transform_forward(v1: AnonRecordV1) -> AnonRecordV1_1 {
    let union_category = serde_json::from_str::<Value>(&v1.anon_json)
        .ok()
        .and_then(|val| {
            val.get("category")
                .or_else(|| val.get("topic"))
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "general".to_string());

    AnonRecordV1_1 {
        record_id: v1.record_id,
        deployment_id: v1.deployment_id,
        uid_hash: v1.uid_hash,
        data_id: v1.data_id,
        schema_version: "1.1.0".to_string(),
        timestamp: v1.timestamp,
        source: v1.source,
        flags: v1.flags,
        union_category,
        anon_json: v1.anon_json,
    }
}

/// Reverse LensVM transform: 1.1.0 -> 1.0.0
/// Preserves `unionCategory` inside `anonJson.category` if not already present so v1.0 readers stay lossless.
pub fn transform_inverse(v1_1: AnonRecordV1_1) -> AnonRecordV1 {
    let mut map = serde_json::from_str::<Map<String, Value>>(&v1_1.anon_json).unwrap_or_default();
    if !map.contains_key("category") && !map.contains_key("topic") && v1_1.union_category != "general" {
        map.insert("category".to_string(), Value::String(v1_1.union_category));
    }
    let anon_json = serde_json::to_string(&map).unwrap_or(v1_1.anon_json);

    AnonRecordV1 {
        record_id: v1_1.record_id,
        deployment_id: v1_1.deployment_id,
        uid_hash: v1_1.uid_hash,
        data_id: v1_1.data_id,
        schema_version: "1.0.0".to_string(),
        timestamp: v1_1.timestamp,
        source: v1_1.source,
        flags: v1_1.flags,
        anon_json,
    }
}

/// WASM-exported C-ABI helpers for LensVM host invocation (`next` / `inverse`)
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

pub fn next_json(input_json: &str) -> Result<String, serde_json::Error> {
    let v1: AnonRecordV1 = serde_json::from_str(input_json)?;
    serde_json::to_string(&transform_forward(v1))
}

pub fn inverse_json(input_json: &str) -> Result<String, serde_json::Error> {
    let v1_1: AnonRecordV1_1 = serde_json::from_str(input_json)?;
    serde_json::to_string(&transform_inverse(v1_1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_v1_to_v1_1() {
        let v1 = AnonRecordV1 {
            record_id: "rec-1".into(),
            deployment_id: "0x1111".into(),
            uid_hash: "0x2222".into(),
            data_id: None,
            schema_version: "1.0.0".into(),
            timestamp: 1700000000,
            source: Some("webSdk".into()),
            flags: "6".into(),
            anon_json: r#"{"event":"curate","topic":"ai-news"}"#.into(),
        };

        let upgraded = transform_forward(v1.clone());
        assert_eq!(upgraded.schema_version, "1.1.0");
        assert_eq!(upgraded.union_category, "ai-news");

        let downgraded = transform_inverse(upgraded);
        assert_eq!(downgraded.schema_version, "1.0.0");
        assert_eq!(downgraded.record_id, v1.record_id);
    }
}
