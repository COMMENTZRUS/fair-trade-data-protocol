# FTDP Ecosystem Integration Examples

These examples show how independent Layer 1 and Layer 2 apps plug into the open-source **Fair Trade Data Protocol (FTDP)** strictly over the public `@ftdp/sdk` and HTTP gateway boundary—without sharing internal app code or private contract stacks.

## Included Examples

1. **[`client-website-demo.html`](./client-website-demo.html)** — Zero-dependency client website using DNS TXT domain ownership + the `<head>` auto-capture snippet (`ftdp-snippet.js`) with automatic PII/anon splitting and hard password/CVV/auth-cookie blocking.
2. **[`../scripts/test-examples.js`](../scripts/test-examples.js)** — Runnable end-to-end integration exercising all 4 ecosystem archetypes against `ftdp-node`:
   - **Panorama (Layer 1 Flagship Deployment)**: Connects strictly as an external registered Deployment via `FtdpClient` (`@ftdp/sdk`) with per-deployment AES-256-GCM PII vault isolation.
   - **Streamy (Layer 1 Video & Ad Network)**: Streams consented `streamy://<cid>` view receipts and Fair Trade Data Ad preferences while keeping video media blobs on CDN/IPFS.
   - **Top News (Layer 2 on Comment Protocol)**: Publishes `news://` discussions, headline votes, and reader karma via `CommentProtocolClient`.
   - **RateMyVideo (Layer 2 on Comment Protocol)**: Publishes star ratings & reviews cross-linked directly to Streamy video CIDs (`streamy://<cid>`), accumulating portable cross-app karma into a shared Data Union.

## Run All Integration Examples

```bash
npm run test:examples
```
