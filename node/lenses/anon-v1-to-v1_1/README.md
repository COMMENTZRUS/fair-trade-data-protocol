# LensVM Transform: FTDP `FtdpAnonRecord` 1.0.0 ↔ 1.1.0

Enables cross-Deployment schema evolution across Data Unions (e.g., Panorama emitting `1.1.0` with indexed `unionCategory` while Top News still emits `1.0.0`), without rewriting historical Merkle-CRDT commits.

## Build WASM Module

```bash
rustup target add wasm32-unknown-unknown
cargo test
cargo build --target wasm32-unknown-unknown --release
```

Output binary:
`target/wasm32-unknown-unknown/release/ftdp_lens_anon_v1_to_v1_1.wasm`

Register the compiled `.wasm` module alongside `../../defradb/schemas/ftdp-v1_1.graphql` using your pinned `defradb.rs` lens migration command (`defradb client lens --help`).
