# JackPackz — $JACKZ

Provably-fair booster packs on **Robinhood Chain** (chainId 4663): рипаешь пак — в кошелёк падает реальный токенизированный актив (акция или мем). Гибрид «карты + казино», нарратив под Robinhood Chain.

Лендинг **Фазы 1** — статический, без сборки. Один самодостаточный `index.html` (hero-картинка вшита как data-URI, шрифты с Google Fonts CDN), плюс `assets/` для OG/социалок.

## Структура

```
jackpackz/
├── index.html            # весь лендинг (HTML+CSS+JS в одном файле)
├── assets/
│   ├── hero.jpg          # исходник hero (Robin Hood), уже вшит в index.html
│   └── og.jpg            # картинка для соцсетей (og:image / twitter:card)
├── config.example.js     # шаблон конфига для Фазы 2/3 (адреса контрактов, RPC)
├── vercel.json           # статический деплой + кэш ассетов
├── .gitignore
└── README.md
```

## Локальный запуск

```bash
# любой статический сервер, например:
npx serve .
# или
python3 -m http.server 5173
# открой http://localhost:5173
```

## Деплой на Vercel

Вариант A — через дашборд:
1. Залей папку в GitHub-репозиторий.
2. На vercel.com → New Project → Import репозиторий.
3. Framework Preset: **Other** (это статика, сборка не нужна).
4. Deploy. Готово.

Вариант B — через CLI:
```bash
npm i -g vercel
cd jackpackz
vercel            # preview-деплой
vercel --prod     # прод-деплой
```

## Env / секреты

На этом этапе секретов нет: RPC у Robinhood Chain публичный, приватных ключей в коде нет.
Когда пойдём в Фазу 2/3 (свопы, контракты, $JACKZ-gate) — копируй `config.example.js` → `config.js`
и подключай через переменные окружения Vercel (Project → Settings → Environment Variables).
**Никогда не хардкодим приватные ключи и адреса контрактов в коде.**

## Что заполнить под свой бренд (re-brand checklist)

- `assets/hero.jpg` — hero-арт (сейчас Robin Hood).
- `assets/og.jpg` — соц-превью.
- Соцсети в футере (`data-social="x|tg|gh"`) и в `config.example.js` → реальные ссылки X / Telegram.
- `$JACKZ` контракт — сейчас `soon`, подставить после минта.
- favicon (добавить `favicon.ico` в корень).

## Дальше по roadmap

- **Фаза 2:** Supabase backend (auth по кошельку, live-лента openings, leaderboard, collections).
- **Фаза 3:** реальный своп пака через Uniswap v4 на Robinhood Chain.
- **Фаза 4:** on-chain VRF reveal + non-custodial jackpot vault.

---
*JackPackz — independent app on Robinhood Chain (4663). Not affiliated with Robinhood Markets, Inc.*
