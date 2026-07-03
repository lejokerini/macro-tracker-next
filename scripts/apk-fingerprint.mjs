// Extrait l'empreinte SHA-256 du certificat de signature d'un APK.
// Usage : node scripts/apk-fingerprint.mjs <chemin-vers.apk>
// Lit le bloc de signature APK (schéma v2/v3) sans dépendance externe.
import fs from "node:fs";
import crypto from "node:crypto";

const file = process.argv[2];
if (!file) {
  console.error("Usage : node scripts/apk-fingerprint.mjs <chemin-vers.apk>");
  process.exit(1);
}
const buf = fs.readFileSync(file);

// 1) Trouver l'End Of Central Directory (signature 0x06054b50) en partant de la fin.
function findEOCD(b) {
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}
const eocd = findEOCD(buf);
if (eocd < 0) { console.error("EOCD ZIP introuvable — ce n'est pas un APK valide ?"); process.exit(1); }
const cdOffset = buf.readUInt32LE(eocd + 16);

// 2) Le bloc de signature APK est juste avant le répertoire central.
const magic = buf.slice(cdOffset - 16, cdOffset).toString("latin1");
if (magic !== "APK Sig Block 42") {
  console.error("Bloc de signature APK introuvable (l'APK n'est peut-être pas signé v2/v3).");
  process.exit(1);
}
const sizeOfBlock = Number(buf.readBigUInt64LE(cdOffset - 24));
const blockStart = cdOffset - sizeOfBlock - 8;
const pairsEnd = cdOffset - 24;

const V2 = 0x7109871a, V3 = 0xf05368c0, V31 = 0x1b93ad61;

function extractFirstCert(b, start) {
  let o = start;
  o += 4;                       // longueur de la séquence de signataires
  o += 4;                       // longueur du 1er signataire
  o += 4;                       // longueur du signed data -> on entre dedans
  const digestsLen = b.readUInt32LE(o); o += 4 + digestsLen; // on saute les digests
  o += 4;                       // longueur de la séquence de certificats
  const certLen = b.readUInt32LE(o); o += 4; // 1er certificat (DER)
  return b.slice(o, o + certLen);
}

let certDer = null;
let p = blockStart + 8;
while (p < pairsEnd) {
  const len = Number(buf.readBigUInt64LE(p)); p += 8;
  const id = buf.readUInt32LE(p);
  const valStart = p + 4;
  if (id === V3 || id === V2 || id === V31) {
    try { certDer = extractFirstCert(buf, valStart); if (certDer && certDer.length > 0) break; } catch { /* essaie le bloc suivant */ }
  }
  p += len;
}
if (!certDer) { console.error("Certificat introuvable dans le bloc de signature."); process.exit(1); }

const sha256 = crypto.createHash("sha256").update(certDer).digest("hex").toUpperCase().match(/../g).join(":");
console.log("\nSHA-256 du certificat de signature :\n");
console.log(sha256);
console.log("");
