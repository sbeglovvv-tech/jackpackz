// The single source of truth for packs, assets, rarities and odds.
// Kept intentionally in sync with the front-end index.html so a drop on the
// backend always matches what the site advertises.

export type Rarity = 'leg' | 'epic' | 'rare' | 'com';

// Relative weight of each rarity tier. Higher = more likely to be pulled.
// These reproduce the published odds: Legendary ≈1%, Epic ≈5%, Rare ≈14%, Common ≈80%.
export const TIER_WEIGHT: Record<Rarity, number> = {
  leg: 1,
  epic: 5,
  rare: 14,
  com: 80,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  leg: 'Legendary',
  epic: 'Epic',
  rare: 'Rare',
  com: 'Common',
};

export type Asset = {
  sym: string;
  name: string;
  kind: 'stock' | 'meme';
  rarity: Rarity;
};

// Every asset that can drop, with its display name and rarity tier.
export const ASSETS: Record<string, Asset> = {
  // ---- stocks ----
  NVDA: { sym: 'NVDA', name: 'NVIDIA', kind: 'stock', rarity: 'leg' },
  SPCX: { sym: 'SPCX', name: 'SpaceX', kind: 'stock', rarity: 'leg' },
  AMD: { sym: 'AMD', name: 'AMD', kind: 'stock', rarity: 'epic' },
  TSLA: { sym: 'TSLA', name: 'Tesla', kind: 'stock', rarity: 'epic' },
  MSFT: { sym: 'MSFT', name: 'Microsoft', kind: 'stock', rarity: 'epic' },
  META: { sym: 'META', name: 'Meta', kind: 'stock', rarity: 'epic' },
  AAPL: { sym: 'AAPL', name: 'Apple', kind: 'stock', rarity: 'rare' },
  GOOGL: { sym: 'GOOGL', name: 'Alphabet', kind: 'stock', rarity: 'rare' },
  COIN: { sym: 'COIN', name: 'Coinbase', kind: 'stock', rarity: 'rare' },
  SPY: { sym: 'SPY', name: 'S&P 500 ETF', kind: 'stock', rarity: 'rare' },
  QQQ: { sym: 'QQQ', name: 'Nasdaq 100', kind: 'stock', rarity: 'rare' },
  AMZN: { sym: 'AMZN', name: 'Amazon', kind: 'stock', rarity: 'com' },
  MU: { sym: 'MU', name: 'Micron', kind: 'stock', rarity: 'com' },
  INTC: { sym: 'INTC', name: 'Intel', kind: 'stock', rarity: 'com' },
  KO: { sym: 'KO', name: 'Coca-Cola', kind: 'stock', rarity: 'com' },
  PG: { sym: 'PG', name: 'Procter & Gamble', kind: 'stock', rarity: 'com' },
  JNJ: { sym: 'JNJ', name: 'Johnson & Johnson', kind: 'stock', rarity: 'com' },
  PEP: { sym: 'PEP', name: 'PepsiCo', kind: 'stock', rarity: 'com' },
  // ---- memes ----
  VLAD: { sym: 'VLAD', name: 'Robinhood Man', kind: 'meme', rarity: 'leg' },
  WSB: { sym: 'WSB', name: 'wallstreetbets', kind: 'meme', rarity: 'epic' },
  ROCKET: { sym: 'ROCKET', name: 'Robinhood Raccoon', kind: 'meme', rarity: 'rare' },
  CASHCAT: { sym: 'CASHCAT', name: 'Cash Cat', kind: 'meme', rarity: 'com' },
  WOJAK: { sym: 'WOJAK', name: 'Wojak', kind: 'meme', rarity: 'com' },
  TENDIES: { sym: 'TENDIES', name: 'Tendies', kind: 'meme', rarity: 'com' },
  HYP: { sym: 'HYP', name: 'Hyperium', kind: 'meme', rarity: 'com' },
  RWA: { sym: 'RWA', name: 'Real World Asset', kind: 'meme', rarity: 'com' },
  STONKS: { sym: 'STONKS', name: 'Stonks', kind: 'meme', rarity: 'com' },
  FOX: { sym: 'FOX', name: 'Robin Hood', kind: 'meme', rarity: 'com' },
  HOODRAT: { sym: 'HOODRAT', name: 'Hoodrat', kind: 'meme', rarity: 'com' },
};

export type Pack = {
  id: string;
  name: string;
  price: number; // USD, informational for the demo
  blurb: string;
  assets: string[]; // asset symbols this pack can drop
  count: string; // human label, e.g. "3 assets inside"
  soon?: boolean; // not yet openable
};

// Packs mirror the front-end PACKS array (same names, prices, asset pools).
export const PACKS: Pack[] = [
  {
    id: 'ai',
    name: 'AI Pack',
    price: 9.99,
    blurb: 'The chips & agents building machine intelligence.',
    assets: ['NVDA', 'AMD', 'HYP'],
    count: '3 assets inside',
  },
  {
    id: 'mag7',
    name: 'Magnificent 7',
    price: 14.99,
    blurb: 'The seven giants that move the whole market.',
    assets: ['AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'GOOGL', 'NVDA', 'AMD', 'COIN', 'SPCX'],
    count: '10 stocks inside',
  },
  {
    id: 'meme',
    name: 'Meme Moonshot',
    price: 12.99,
    blurb: 'Pure degen. Robinhood-chain memes, max variance.',
    assets: ['WSB', 'VLAD', 'ROCKET', 'CASHCAT', 'WOJAK'],
    count: '5 memes inside',
  },
  {
    id: 'index',
    name: 'Index Pack',
    price: 9.99,
    blurb: 'Own the whole tape: S&P 500 + Nasdaq 100.',
    assets: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'NVDA'],
    count: '7 stocks inside',
  },
  {
    id: 'dividend',
    name: 'Dividend Kings',
    price: 7.99,
    blurb: 'Generations of shareholder returns.',
    assets: ['KO', 'PG', 'JNJ', 'PEP'],
    count: '4 stocks inside',
    soon: true, // underlying assets not tokenized yet
  },
  {
    id: 'future',
    name: 'Future Tech',
    price: 11.99,
    blurb: 'Semiconductors, space & next-gen growth.',
    assets: ['NVDA', 'AMD', 'SPCX', 'MU', 'TSLA', 'INTC', 'COIN', 'META', 'GOOGL', 'QQQ'],
    count: '10 assets inside',
  },
];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

// Collections a player can complete (used for profile progress).
export type Collection = {
  id: string;
  name: string;
  set: string[];
  bonus: string;
};

export const COLLECTIONS: Collection[] = [
  { id: 'ai', name: 'AI Collection', set: ['NVDA', 'AMD', 'INTC', 'MU'], bonus: '+$5 & 1 free pack' },
  {
    id: 'mag7',
    name: 'Magnificent Seven',
    set: ['AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'GOOGL', 'NVDA'],
    bonus: '+$10 & 2 free packs',
  },
  {
    id: 'memes',
    name: 'Meme Legends',
    set: ['WSB', 'VLAD', 'ROCKET', 'CASHCAT', 'WOJAK'],
    bonus: '+$6',
  },
];
