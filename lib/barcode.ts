// Contrôle des codes-barres alimentaires (EAN-13, EAN-8, UPC-A, UPC-E) :
// la clé de contrôle évite d'interroger la base avec un code mal lu.

function gtinCheckOk(code: string) {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Poids 3,1,3,1… en partant du chiffre juste avant la clé.
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

// UPC-E (8 chiffres) → UPC-A (12 chiffres), pour vérifier sa clé.
export function upcEToUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0], d = code.slice(1, 7), check = code[7];
  const last = d[5];
  let body: string;
  if ("012".includes(last)) body = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === "3") body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === "4") body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`;
  return `${ns}${body}${check}`;
}

export function isValidFoodBarcode(raw: string): boolean {
  const code = raw.replace(/\D/g, "");
  if (code.length === 13 || code.length === 12) return gtinCheckOk(code);
  if (code.length === 8) {
    if (gtinCheckOk(code)) return true;
    const upcA = upcEToUpcA(code);
    return !!upcA && gtinCheckOk(upcA);
  }
  return false;
}
