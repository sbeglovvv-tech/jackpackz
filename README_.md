# UniPackz — $JACKZ

Provably-fair booster packs on **Robinhood Chain** (chainId 4663): рипаешь пак — в кошелёк падает реальный токенизированный актив (акция или мем). Гибрид «карты + казино», нарратив под Robinhood Chain.

Лендинг — статический, без сборки. Один самодостаточный `index.html` (hero-картинка вшита как data-URI, шрифты с Google Fonts CDN), плюс `assets/` для OG/социалок.

## Ссылки

- Сайт: https://unipackz.xyz
- X (Twitter): https://x.com/unipackz
- GitHub: https://github.com/sbeglovvv-tech/unipackz

## Структура

```
unipackz/
├── index.html            # весь лендинг (HTML+CSS+JS в одном файле)
├── assets/
│   ├── hero.jpg          # исходник hero, уже вшит в index.html
│   └── og.jpg            # картинка для соцсетей (og:image / twitter:card)
├── config.example.js     # шаблон конфига (адреса контрактов, RPC)
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
cd unipackz
vercel            # preview-деплой
vercel --prod     # прод-деплой
```

## Env / секреты

RPC у Robinhood Chain публичный, приватных ключей в коде нет.
Секреты (операторский ключ выдачи, адреса) задаются переменными окружения на бэкенде (Railway),
никогда не хардкодятся в коде. **Никогда не хардкодим приватные ключи и адреса контрактов в коде.**

## Что заполнить под свой бренд (re-brand checklist)

- `assets/hero.jpg` — hero-арт.
- `assets/og.jpg` — соц-превью.
- Соцсети в футере и в `config.example.js` → реальные ссылки X / Telegram.
- `$JACKZ` контракт — подставить адрес после минта.
- favicon — уже вшит в `index.html`.

---
*UniPackz — independent app on Robinhood Chain (4663). Not affiliated with Robinhood Markets, Inc.*
