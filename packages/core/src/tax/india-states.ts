// Indian GST state codes (the 2-digit prefix of a GSTIN) and helpers to resolve
// the "place of supply" from a free-form delivery address, so an invoice can
// decide between intra-state (CGST + SGST) and inter-state (IGST) tax.

/** State name -> GST state code (2-digit, zero-padded). */
export const STATE_CODE_BY_NAME: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'uttaranchal': '05',
  'haryana': '06',
  'delhi': '07',
  'new delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'orissa': '21',
  'chhattisgarh': '22',
  'chhatisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'daman and diu': '25',
  'dadra and nagar haveli and daman and diu': '26',
  'dadra and nagar haveli': '26',
  'maharashtra': '27',
  'andhra pradesh': '28',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33',
  'tamilnadu': '33',
  'puducherry': '34',
  'pondicherry': '34',
  'andaman and nicobar islands': '35',
  'andaman and nicobar': '35',
  'telangana': '36',
  'ladakh': '38',
  'other territory': '97',
};

/** Reverse map: state code -> canonical state name. */
export const STATE_NAME_BY_CODE: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The 2-digit state code embedded in a GSTIN (its first two characters). */
export function stateCodeFromGstin(gstin?: string | null): string | undefined {
  if (!gstin) return undefined;
  const code = gstin.trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : undefined;
}

/** Resolve a state code from a free-form state value (a name or a 2-digit code). */
export function resolveStateCode(state?: string | null): string | undefined {
  if (!state) return undefined;
  const raw = String(state).trim();
  if (/^\d{1,2}$/.test(raw)) {
    const padded = raw.padStart(2, '0');
    return STATE_NAME_BY_CODE[padded] ? padded : undefined;
  }
  return STATE_CODE_BY_NAME[norm(raw)];
}

/** Best-effort canonical state name for a code or free-form value. */
export function stateName(value?: string | null): string | undefined {
  if (!value) return undefined;
  const code = resolveStateCode(value);
  if (code && STATE_NAME_BY_CODE[code]) return STATE_NAME_BY_CODE[code];
  return String(value).trim() || undefined;
}

/** A rough GSTIN format check (15 chars: 2-digit state + 10-char PAN + 3). */
export function isLikelyGstin(gstin?: string | null): boolean {
  if (!gstin) return false;
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i.test(gstin.trim());
}
