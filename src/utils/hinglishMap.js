/**
 * Hinglish → English keyword mappings
 * Used by NLP parser to normalise user inputs
 */
const hinglishMap = {
  // Actions
  'jodo': 'add',
  'add karo': 'add',
  'daalo': 'add',
  'hatao': 'remove',
  'nikalo': 'remove',
  'delete karo': 'delete',
  'becho': 'sell',
  'becha': 'sold',
  'bikaa': 'sold',
  'update karo': 'update',
  'dikhao': 'show',
  'dekho': 'show',
  'cancel karo': 'cancel',

  // Inventory terms
  'saman': 'product',
  'maal': 'product',
  'cheez': 'product',
  'stock': 'stock',
  'dukaan': 'shop',
  'matra': 'quantity',
  'kitna': 'quantity',
  'kitne': 'quantity',
  'tukda': 'piece',
  'tukde': 'pieces',
  'packet': 'packet',
  'packets': 'packets',
  'peti': 'box',
  'dabba': 'box',

  // Expiry
  'khatam': 'expiry',
  'expire': 'expiry',
  'expiry': 'expiry',
  'band ho jaega': 'expiry',
  'tak chalega': 'valid till',
  'tak chalta hai': 'valid till',

  // Time
  'aaj': 'today',
  'kal': 'tomorrow',
  'parso': 'day after tomorrow',
  'is mahine': 'this month',
  'agle mahine': 'next month',
  'is saal': 'this year',
  'agle saal': 'next year',

  // Confirmation
  'haan': 'yes',
  'ha': 'yes',
  'bilkul': 'yes',
  'theek hai': 'yes',
  'ok': 'yes',
  'nahi': 'no',
  'na': 'no',
  'mat karo': 'no',
  'cancel': 'no',

  // Numbers (Hindi)
  'ek': '1',
  'do': '2',
  'teen': '3',
  'char': '4',
  'paanch': '5',
  'cheh': '6',
  'saat': '7',
  'aath': '8',
  'nau': '9',
  'das': '10',
  'bis': '20',
  'tees': '30',
  'pachaas': '50',
  'sau': '100',

  // Month names Hindi
  'january': 'january', 'jan': 'january',
  'february': 'february', 'feb': 'february',
  'march': 'march', 'mar': 'march',
  'april': 'april', 'apr': 'april',
  'may': 'may',
  'june': 'june', 'jun': 'june',
  'july': 'july', 'jul': 'july',
  'august': 'august', 'aug': 'august',
  'september': 'september', 'sep': 'september', 'sept': 'september',
  'october': 'october', 'oct': 'october',
  'november': 'november', 'nov': 'november',
  'december': 'december', 'dec': 'december'
};

module.exports = hinglishMap;
