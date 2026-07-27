// config.example.js — скопируй в config.js и заполни на этапе Фазы 2/3.
// Пока лендинг статический и секретов не требует. Ничего приватного НЕ хардкодим.
window.JACKPACKZ_CONFIG = {
  CHAIN_ID: 4663,
  CHAIN_HEX: "0x1237",
  RPC_URL: "https://rpc.mainnet.chain.robinhood.com",   // публичный RPC Robinhood Chain
  EXPLORER: "https://robinhoodchain.blockscout.com",
  // Заполняются после деплоя контрактов / токена:
  JACKZ_TOKEN: "soon",          // адрес $JACKZ
  PACK_CONTRACT: "soon",        // контракт паков
  JACKPOT_VAULT: "soon",        // non-custodial vault
  USDG: "soon",                 // стейбл Robinhood Chain
  // Соцсети (плейсхолдеры):
  SOCIALS: { x: "https://x.com/jackpackz", tg: "https://t.me/jackpackz", gh: "" }
};
