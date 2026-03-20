'use strict';

const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');

if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    console.log('Второй процесс остановлен');
    process.exit(0);
}

// ─────────────────────────────────────────────
//  ФАЙЛЫ
// ─────────────────────────────────────────────
const PROMO_FILE  = path.join(__dirname, 'promocodes.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const USERS_FILE  = path.join(__dirname, 'users.json');

function loadJSON(file) {
    if (!fs.existsSync(file)) return file === USERS_FILE ? {} : [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return file === USERS_FILE ? {} : []; }
}
const saveJSON   = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const loadOrders = ()     => loadJSON(ORDERS_FILE);
const saveOrders = d      => saveJSON(ORDERS_FILE, d);
const loadPromos = ()     => loadJSON(PROMO_FILE);
const savePromos = d      => saveJSON(PROMO_FILE, d);
const loadUsers  = ()     => loadJSON(USERS_FILE);
const saveUsers  = d      => saveJSON(USERS_FILE, d);

// ─────────────────────────────────────────────
//  БОТ
// ─────────────────────────────────────────────
const token     = '8333995700:AAGd30lumgSxFwuts-EQY4guQOX-gjqjRJI';
const bot       = new TelegramBot(token, { polling: true });
const ADMIN_IDS = [8183121320, 8042412556];
const temp      = {};

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION:', err));
process.on('uncaughtException',  err => console.error('UNCAUGHT EXCEPTION:', err));

// ─────────────────────────────────────────────
//  КЛАВИАТУРЫ
// ─────────────────────────────────────────────
const KB_MAIN = { keyboard: [
    ['🛍 Сделать заказ', '📦 Мои заказы'],
    ['💰 Рассчитать стоимость товара', '💴 Текущий курс юаня'],
    ['📌 FAQ'], ['🛠 Поддержка']
], resize_keyboard: true };

const KB_ADMIN = { keyboard: [
    ['🖋️ Зарегистрировать заказ'], ['📄 База заказов'],
    ['📊 Статистика'], ['🎁 Промокоды'], ['📢 Акции'], ['Поддержка']
], resize_keyboard: true };

const KB_ORDERS = { keyboard: [
    ['Все заказы'], ['Фильтры'], ['Главное меню']
], resize_keyboard: true };

const KB_FILTERS = { keyboard: [
    ['По статусу заказа'], ['По никнейму'],
    ['По цене'], ['По номеру трека'], ['Назад']
], resize_keyboard: true };

const KB_FILTER_STATUS = { keyboard: [
    ['В обработке'], ['На складе в Китае'],
    ['На складе в Сочи'], ['Готов к получению'],
    ['Завершен'], ['Назад']
], resize_keyboard: true };

const KB_FILTER_PRICE = { keyboard: [
    ['0 – 5 000 ₽'], ['5 000 – 10 000 ₽'],
    ['10 000 – 15 000 ₽'], ['15 000 – 20 000 ₽'],
    ['20 000+ ₽'], ['Назад']
], resize_keyboard: true };

const KB_AFTER_NICKNAME = { keyboard: [['Другой никнейм'], ['Назад']], resize_keyboard: true };
const KB_AFTER_TRACK    = { keyboard: [['Другой номер трека'], ['Назад']], resize_keyboard: true };
const KB_BACK_ONLY      = { keyboard: [['Назад']], resize_keyboard: true };

const KB_PROMOS     = { keyboard: [['➕ Создать промокод'], ['📄 Все промокоды'], ['Главное меню']], resize_keyboard: true };
const KB_PROMO_LIST = { keyboard: [['Активные промокоды'], ['Завершенные промокоды'], ['Назад']], resize_keyboard: true };
const KB_PROMO_DETAIL = { keyboard: [['Главное меню']], resize_keyboard: true };

const ALL_STATUSES = ['В обработке', 'На складе в Китае', 'На складе в Сочи', 'Готов к получению', 'Завершен'];

const KB_FAQ = { keyboard: [
    ['🚚 Доставка'], ['↩️ Возврат'],
    ['📦 Как отследить заказ?'], ['✅ Оригинал или нет?'],
    ['🕒 Время работы Менеджеров'], ['⬅️ Назад']
], resize_keyboard: true };

const KB_FAQ_BACK = { keyboard: [['Назад в FAQ'], ['Главное меню']], resize_keyboard: true };

// Inline-кнопки для ошибок промокода в калькуляторе
function calcPromoErrorKB() {
    return { inline_keyboard: [
        [{ text: 'Другой промокод',       callback_data: 'calc_retry_promo' }],
        [{ text: 'Без промокода ❌',       callback_data: 'calc_skip_promo'  }],
        [{ text: 'Связаться с менеджером', url: 'https://t.me/adrlogisticsmanager' }]
    ]};
}

// ─────────────────────────────────────────────
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────────
const mainMenu  = id => bot.sendMessage(id, 'Главное меню', { reply_markup: KB_MAIN });
const adminMenu = id => bot.sendMessage(id, 'Главное меню', { reply_markup: KB_ADMIN });

function normalizeStatus(s) { return (s || '').trim().toLowerCase(); }

function generateTrack(existing) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const blk   = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    let t;
    do { t = blk()+' '+blk(); } while (existing.some(o => o.track === t));
    return t;
}

function promoExpired(p) {
    if (!p.expires) return false;
    const [d,m,y] = p.expires.split('.');
    return new Date(+y, +m-1, +d) < new Date();
}

function promoFinished(p) {
    if (p.limit !== null && p.used >= p.limit) return true;
    return promoExpired(p);
}

// ФИX: полные названия категорий (Часы/украшения не обрезается)
const PROMO_CATEGORIES = {
    'pcat_Обувь':   'Обувь',
    'pcat_Одежда':  'Одежда',
    'pcat_Часы':    'Часы/украшения',   // сохраняем полное название
    'pcat_Техника': 'Техника',
    'pcat_Другое':  'Другое',
};

function promoShort(p) {
    const status = promoFinished(p) ? 'Завершен 🔴' : 'Активен 🟢';
    const disc   = p.discountType === '%' ? `${p.discountValue}%` : `${p.discountValue} ₽`;
    const rem    = p.limit === null ? '∞' : Math.max(0, p.limit - p.used);
    return `🎁 Промокод <code>${p.code}</code>\n${status}\nРазмер скидки: ${disc}\nОсталось применений: ${rem}`;
}

function promoFull(p) {
    const status = promoFinished(p) ? 'Завершен 🔴' : 'Активен 🟢';
    const disc   = p.discountType === '%' ? `${p.discountValue}%` : `${p.discountValue} ₽`;
    const rem    = p.limit === null ? '∞' : Math.max(0, p.limit - p.used);
    let msg =
`🎁 Промокод <code>${p.code}</code>
${status}

Всего применений: ${p.limit === null ? '∞' : p.limit}
Осталось применений: ${rem}
Действует на: ${p.category}
Срок действия: ${p.expires || 'Бессрочно'}
Минимальная сумма: ${p.minSum !== null && p.minSum > 0 ? p.minSum+' ₽' : 'Без лимита'}
Размер скидки: ${disc}`;
    if (p.discountType === '%') {
        msg += `\nМаксимальная скидка: ${p.maxDiscount !== null ? p.maxDiscount+' ₽' : 'Без лимита'}`;
    }
    return msg;
}

function calcDiscount(total, promo) {
    if (promo.discountType === '%') {
        let d = Math.round(total * promo.discountValue / 100);
        if (promo.maxDiscount !== null) d = Math.min(d, promo.maxDiscount);
        return d;
    }
    return Math.min(promo.discountValue, total);
}

// Название категории из callback_data
function categoryFromData(data) {
    return PROMO_CATEGORIES[data] || data.replace('pcat_', '');
}

// Соответствие категории промокода типу товара в калькуляторе
// calcType: 'clothes' | 'shoes'
// promo.category: 'Обувь', 'Одежда', 'Часы/украшения', 'Техника', 'Другое', или кастом
function promoMatchesCalcType(promo, calcType) {
    const cat = (promo.category || '').toLowerCase();
    if (calcType === 'shoes'   && cat === 'обувь')   return true;
    if (calcType === 'clothes' && cat === 'одежда')  return true;
    // Если промокод на "Другое" — подходит для всех
    if (cat === 'другое') return true;
    // Если категория не связана с текущим товаром — не подходит
    return false;
}

function sendOrderCards(chatId, orders) {
    orders.forEach(o => {
        bot.sendMessage(chatId,
`📦 Заказ <code>${o.track}</code>  @${o.nickname}\n\n💰 Сумма: ${o.total||0} ₽\n📌 Статус: ${o.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
                { text: 'Подробнее', callback_data: `details_${o.id}` }
            ]]}});
    });
}

function sendClientOrders(chatId) {
    const list = loadOrders()
        .filter(o => String(o.userId) === String(chatId))
        .sort((a,b) => b.createdAt - a.createdAt);
    if (!list.length) return bot.sendMessage(chatId, 'У вас пока нет заказов.');
    list.forEach(o => bot.sendMessage(chatId,
`📦 Заказ <code>${o.track}</code>\n\n💰 Сумма: ${o.total||0} ₽\n📌 Статус: ${o.status}`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
            { text: 'Подробнее', callback_data: `client_details_${o.id}` }
        ]]}})
    );
}

function askPromoCategory(chatId) {
    return bot.sendMessage(chatId, 'На какую категорию действует промокод:', { reply_markup: { inline_keyboard: [
        [{ text: 'Обувь',          callback_data: 'pcat_Обувь'   }],
        [{ text: 'Одежда',         callback_data: 'pcat_Одежда'  }],
        [{ text: 'Часы/украшения', callback_data: 'pcat_Часы'    }],
        [{ text: 'Техника',        callback_data: 'pcat_Техника' }],
        [{ text: 'Другое',         callback_data: 'pcat_Другое'  }],
        [{ text: 'Свой вариант',   callback_data: 'pcat_custom'  }]
    ]}});
}

function sendAudienceMenu(chatId) {
    return bot.sendMessage(chatId, '👥 Кому отправить:', { reply_markup: { inline_keyboard: [
        [{ text: 'Всем',                   callback_data: 'mail_all' }],
        [{ text: 'Кто ожидает заказ',      callback_data: 'mail_waiting' }],
        [{ text: 'Кто только включил бот', callback_data: 'mail_new' }],
        [{ text: 'Кто забрал заказ',       callback_data: 'mail_completed' }],
        [{ text: 'Кто давно не заказывал', callback_data: 'mail_inactive' }],
        [{ text: 'Назад к изображению',    callback_data: 'mail_back_to_image' }],
        [{ text: 'Отменить рассылку',      callback_data: 'mail_cancel' }]
    ]}});
}

function finishPromo(chatId) {
    const d = temp[chatId];
    const promos = loadPromos();
    const p = {
        code: d.code, limit: d.limit, used: 0,
        category: d.category, expires: d.expires || null,
        comment: d.comment || null, createdAt: Date.now(),
        minSum: d.minSum ?? 0,
        discountType: d.discountType,
        discountValue: d.discountValue,
        maxDiscount: d.maxDiscount ?? null
    };
    promos.push(p);
    savePromos(promos);
    temp[chatId] = {};

    const disc    = p.discountType === '%' ? `${p.discountValue}%` : `${p.discountValue} ₽`;
    const maxLine = p.discountType === '%'
        ? `\nМаксимальная скидка: ${p.maxDiscount !== null ? p.maxDiscount+' ₽' : 'Без лимита'}`
        : '';

    return bot.sendMessage(chatId,
`✅ Промокод <code>${p.code}</code> успешно создан

Всего применений: ${p.limit === null ? '∞' : p.limit}
Осталось применений: ${p.limit === null ? '∞' : p.limit}
Действует на: ${p.category}
Срок действия: ${p.expires || 'Бессрочно'}
Минимальная сумма: ${p.minSum > 0 ? p.minSum+' ₽' : 'Без лимита'}
Размер скидки: ${disc}${maxLine}`,
        { parse_mode: 'HTML', reply_markup: KB_ADMIN });
}

function finishOrder(chatId) {
    const d      = temp[chatId];
    const orders = loadOrders();
    const users  = loadUsers();

    const clientId = users[d.nickname.toLowerCase()];
    if (!clientId) {
        bot.sendMessage(chatId, '❌ Клиент не найден. Убедитесь, что он запустил бот.', { reply_markup: KB_ADMIN });
        temp[chatId] = {};
        return;
    }

    let total    = d.items.reduce((s,i) => s + Number(i.price), 0);
    let discount = 0;
    let usedCode = null;

    if (d.appliedPromo) {
        const promos = loadPromos();
        const promo  = promos.find(p => p.code === d.appliedPromo);
        if (promo && !promoFinished(promo)) {
            discount = calcDiscount(total, promo);
            total    = total - discount;
            usedCode = promo.code;
            promo.used = (promo.used || 0) + 1;
            savePromos(promos);
        }
    }

    const track    = generateTrack(orders);
    const newOrder = {
        id: Date.now(), userId: clientId, nickname: d.nickname,
        items: d.items, delivery: d.delivery, address: d.address || null,
        status: 'В обработке', track, total, discount, promoCode: usedCode,
        createdAt: Date.now()
    };
    orders.push(newOrder);
    saveOrders(orders);

    let itemsText = '';
    newOrder.items.forEach((item, i) => {
        itemsText += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'не указан'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`;
    });
    const discLine  = discount ? `\n🏷 Скидка: -${discount} ₽` : '';
    const promoLine = usedCode ? `\n🎁 Промокод: ${usedCode}` : '';

    bot.sendMessage(chatId,
`📦 <b>Заказ <code>${newOrder.track}</code></b>
@${newOrder.nickname}

🛍 <b>Товаров:</b> ${newOrder.items.length}

${itemsText}
🚚 <b>Доставка:</b> ${newOrder.delivery}
📍 <b>Адрес:</b> ${newOrder.address||'Самовывоз'}${promoLine}${discLine}

💰 <b>Итого:</b> ${newOrder.total} ₽
📦 <b>Статус:</b> ${newOrder.status}`,
        { parse_mode: 'HTML', reply_markup: KB_ADMIN });

    bot.sendMessage(clientId,
`Ваш заказ <code>${newOrder.track}</code> Зарегистрирован 👨🏼‍🔧
Статус: <b>В обработке</b>

<i>Вы можете отслеживать статус в разделе "Мои заказы"</i>`,
        { parse_mode: 'HTML' });

    temp[chatId] = {};
}

// Показать итог калькулятора (без промокода)
function sendCalcResult(chatId, total) {
    return bot.sendMessage(chatId,
`🚚 Расчёт стоимости:

*${total} ₽* — с доставкой до Сочи

Дополнительная доставка СДЭК/Почта России — за счёт клиента.
Доставка по Адлеру — бесплатная.
Самовывоз по предварительной записи!`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }],
            [{ text: '⬅️ Назад',           callback_data: 'back_main' }]
        ]}});
}

// Показать итог калькулятора со скидкой
function sendCalcResultWithDiscount(chatId, total, discount, code) {
    const newTotal = total - discount;
    return bot.sendMessage(chatId,
`🚚 Расчёт стоимости:

<s>${total} ₽</s>
<b>${newTotal} ₽</b> — с доставкой до Сочи (промокод <code>${code}</code>, скидка ${discount} ₽)

Дополнительная доставка СДЭК/Почта России — за счёт клиента.
Доставка по Адлеру — бесплатная.
Самовывоз по предварительной записи!`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
            [{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }],
            [{ text: '⬅️ Назад',           callback_data: 'back_main' }]
        ]}});
}

// ─────────────────────────────────────────────
//  /start
// ─────────────────────────────────────────────
bot.onText(/\/start/, msg => {
    const { id: chatId } = msg.chat;
    if (ADMIN_IDS.includes(chatId)) return adminMenu(chatId);
    if (!msg.from.username) {
        return bot.sendMessage(chatId, '⚠️ Установите username в Telegram, затем нажмите /start снова.');
    }
    const users = loadUsers();
    users[msg.from.username.toLowerCase()] = chatId;
    saveUsers(users);
    return mainMenu(chatId);
});

// ─────────────────────────────────────────────
//  СООБЩЕНИЯ
// ─────────────────────────────────────────────
bot.on('message', msg => {
    const chatId  = msg.chat.id;
    const text    = msg.text || msg.caption;
    if (!text && !msg.photo) return;

    const isAdmin = ADMIN_IDS.includes(chatId);
    const S       = temp[chatId] || {};

    // ══════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════
    if (isAdmin) {

        if (text === 'Главное меню') return adminMenu(chatId);
        if (text === 'Поддержка')    return bot.sendMessage(chatId, '📞 Поддержка: @Savelisb');

        if (text === '📊 Статистика') {
            const users  = loadUsers();
            const orders = loadOrders();
            const promos = loadPromos();
            return bot.sendMessage(chatId,
`📊 Статистика

Пользователей: ${Object.keys(users).length}
Активные заказы: ${orders.filter(o => o.status !== 'Завершен').length}
Завершённые заказы: ${orders.filter(o => o.status === 'Завершен').length}

Активных промокодов: ${promos.filter(p => !promoFinished(p)).length}
Завершённых промокодов: ${promos.filter(p => promoFinished(p)).length}`);
        }

        if (text === '📢 Акции') {
            temp[chatId] = { mailingStep: 'write_text' };
            return bot.sendMessage(chatId,
`✍️ Напишите текст рассылки
Поддерживаются эмоджи и форматирование

Поддерживаемое форматирование:

<code>&lt;b&gt;Жирный текст&lt;/b&gt;</code>
→ <b>Жирный текст</b>

<code>&lt;i&gt;Курсив&lt;/i&gt;</code>
→ <i>Курсив</i>

<code>&lt;u&gt;Подчёркнутый&lt;/u&gt;</code>
→ <u>Подчёркнутый</u>

<code>&lt;s&gt;Зачёркнутый&lt;/s&gt;</code>
→ <s>Зачёркнутый</s>

<code>&lt;code&gt;Моноширинный&lt;/code&gt;</code>
→ <code>Моноширинный</code>

<code>&lt;blockquote&gt;Цитата&lt;/blockquote&gt;</code>
→ <blockquote>Цитата</blockquote>

<code>&lt;tg-spoiler&gt;Скрытый текст&lt;/tg-spoiler&gt;</code>
→ <tg-spoiler>Скрытый текст</tg-spoiler>

<code>&lt;a href="https://site.ru"&gt;Ссылка&lt;/a&gt;</code>
→ <a href="https://site.ru">Ссылка</a>

❗ Все теги должны быть закрыты`,
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅ Назад', callback_data: 'admin_back_main' }]] }});
        }

        if (text === '🎁 Промокоды') {
            temp[chatId] = {};
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: KB_PROMOS });
        }

        if (text === '➕ Создать промокод') {
            temp[chatId] = { promoStep: 'enter_name' };
            return bot.sendMessage(chatId,
                'Введите код промокода:\nНапример: СКИДКА20\n\nТолько большие буквы и цифры',
                { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'promo_back_to_menu' }]] }});
        }

        if (text === '📄 Все промокоды') {
            return bot.sendMessage(chatId, 'Выберите раздел:', { reply_markup: KB_PROMO_LIST });
        }

        if (text === 'Активные промокоды') {
            const list = loadPromos().filter(p => !promoFinished(p));
            if (!list.length) return bot.sendMessage(chatId, 'Активных промокодов нет.', { reply_markup: KB_PROMO_LIST });
            list.forEach(p => bot.sendMessage(chatId, promoShort(p), { parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '🔍 Подробнее', callback_data: `pd_${p.code}` }]] }}));
            return bot.sendMessage(chatId, `Активных: ${list.length}`, { reply_markup: KB_PROMO_LIST });
        }

        if (text === 'Завершенные промокоды') {
            const list = loadPromos().filter(p => promoFinished(p));
            if (!list.length) return bot.sendMessage(chatId, 'Завершённых промокодов нет.', { reply_markup: KB_PROMO_LIST });
            list.forEach(p => bot.sendMessage(chatId, promoShort(p), { parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '🔍 Подробнее', callback_data: `pd_${p.code}` }]] }}));
            return bot.sendMessage(chatId, `Завершённых: ${list.length}`, { reply_markup: KB_PROMO_LIST });
        }

        if (text === '🖋️ Зарегистрировать заказ') {
            temp[chatId] = { step: 'nickname', items: [] };
            return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример: @client_username',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Прекратить регистрацию', callback_data: 'cancel_reg' }]] }});
        }

        if (text === '📄 База заказов') {
            temp[chatId] = {};
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: KB_ORDERS });
        }
        if (text === 'Все заказы') {
            temp[chatId] = {};
            const all = loadOrders();
            if (!all.length) return bot.sendMessage(chatId, 'Заказов нет.', { reply_markup: KB_ORDERS });
            sendOrderCards(chatId, all);
            return bot.sendMessage(chatId, `Всего заказов: ${all.length}`, { reply_markup: KB_ORDERS });
        }

        if (text === 'Фильтры') {
            temp[chatId] = { inFilters: true };
            return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS });
        }

        if (S.inFilters) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: KB_ORDERS }); }
            if (text === 'По статусу заказа') { temp[chatId] = { filterStatus: true }; return bot.sendMessage(chatId, 'Выберите статус заказа:', { reply_markup: KB_FILTER_STATUS }); }
            if (text === 'По никнейму')       { temp[chatId] = { filterNick: true };   return bot.sendMessage(chatId, 'Введите юзернейм (@никнейм):', { reply_markup: KB_BACK_ONLY }); }
            if (text === 'По цене')           { temp[chatId] = { filterPrice: true };  return bot.sendMessage(chatId, 'Выберите диапазон цены:', { reply_markup: KB_FILTER_PRICE }); }
            if (text === 'По номеру трека')   { temp[chatId] = { filterTrack: true };  return bot.sendMessage(chatId, 'Введите номер трека\n\nПример: ABCD EFGH', { reply_markup: KB_BACK_ONLY }); }
        }

        if (S.filterStatus) {
            if (text === 'Назад') { temp[chatId] = { inFilters: true }; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS }); }
            const validStatuses = ['В обработке','На складе в Китае','На складе в Сочи','Готов к получению','Завершен'];
            if (!validStatuses.includes(text)) return;
            const found = loadOrders().filter(o => o.status === text).sort((a,b) => a.createdAt - b.createdAt);
            if (!found.length) return bot.sendMessage(chatId, `В этом статусе заказов нет`, { reply_markup: KB_FILTER_STATUS });
            sendOrderCards(chatId, found);
            return bot.sendMessage(chatId, `Найдено: ${found.length}`, { reply_markup: KB_FILTER_STATUS });
        }

        if (S.filterNick) {
            if (text === 'Назад') { temp[chatId] = { inFilters: true }; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS }); }
            if (text === 'Другой никнейм') return bot.sendMessage(chatId, 'Введите юзернейм (@никнейм):', { reply_markup: KB_BACK_ONLY });
            const nick  = text.replace('@','').toLowerCase().trim();
            const found = loadOrders().filter(o => o.nickname && o.nickname.trim().toLowerCase() === nick);
            if (!found.length) return bot.sendMessage(chatId, 'У пользователя с таким юзернеймом нет заказов', { reply_markup: KB_AFTER_NICKNAME });
            sendOrderCards(chatId, found);
            return bot.sendMessage(chatId, `Найдено: ${found.length}`, { reply_markup: KB_AFTER_NICKNAME });
        }

        if (S.filterPrice) {
            if (text === 'Назад') { temp[chatId] = { inFilters: true }; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS }); }
            if (text === 'Другой диапазон') return bot.sendMessage(chatId, 'Выберите диапазон цены:', { reply_markup: KB_FILTER_PRICE });
            const ranges = {
                '0 – 5 000 ₽':       o => (o.total||0) <= 5000,
                '5 000 – 10 000 ₽':  o => (o.total||0) > 5000  && (o.total||0) <= 10000,
                '10 000 – 15 000 ₽': o => (o.total||0) > 10000 && (o.total||0) <= 15000,
                '15 000 – 20 000 ₽': o => (o.total||0) > 15000 && (o.total||0) <= 20000,
                '20 000+ ₽':          o => (o.total||0) > 20000
            };
            const fn = ranges[text];
            if (!fn) return;
            const found = loadOrders().filter(fn);
            if (!found.length) return bot.sendMessage(chatId, 'В этом диапазоне цен заказов нет', { reply_markup: { keyboard: [['Другой диапазон'],['Назад']], resize_keyboard: true }});
            sendOrderCards(chatId, found);
            return bot.sendMessage(chatId, `Найдено: ${found.length}`, { reply_markup: { keyboard: [['Другой диапазон'],['Назад']], resize_keyboard: true }});
        }

        if (S.filterTrack) {
            if (text === 'Назад') { temp[chatId] = { inFilters: true }; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS }); }
            if (text === 'Другой номер трека') return bot.sendMessage(chatId, 'Введите номер трека\n\nПример: ABCD EFGH', { reply_markup: KB_BACK_ONLY });
            const track = text.trim().toUpperCase();
            const found = loadOrders().filter(o => o.track === track);
            if (!found.length) return bot.sendMessage(chatId, 'С таким номером трека заказ не найден', { reply_markup: KB_AFTER_TRACK });
            sendOrderCards(chatId, found);
            return bot.sendMessage(chatId, 'Заказ найден', { reply_markup: KB_AFTER_TRACK });
        }

        // ── Регистрация заказа FSM ──
        if (S.step === 'nickname') {
            temp[chatId].nickname = text.replace('@','');
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, '🛍 Товары клиента', { reply_markup: { inline_keyboard: [
                [{ text: '➕ Добавить товар', callback_data: 'add_product' }],
                [{ text: '⬅ Шаг назад',       callback_data: 'reg_back_to_nickname' }]
            ]}});
        }
        if (S.step === 'item_article') {
            temp[chatId].currentItem.article = text;
            temp[chatId].step = 'item_type';
            return bot.sendMessage(chatId, 'Тип товара (Обувь / Одежда / Другое):', { reply_markup: { inline_keyboard: [
                [{ text: '⬅ Шаг назад', callback_data: 'reg_back_to_products' }]
            ]}});
        }
        if (S.step === 'item_type') {
            temp[chatId].currentItem.type = text;
            temp[chatId].step = 'item_size';
            return bot.sendMessage(chatId, 'Размер:', { reply_markup: { inline_keyboard: [
                [{ text: '⬅ Шаг назад', callback_data: 'reg_back_to_article' }]
            ]}});
        }
        if (S.step === 'item_size') {
            temp[chatId].currentItem.size = text;
            temp[chatId].step = 'item_price';
            return bot.sendMessage(chatId, 'Стоимость (₽):', { reply_markup: { inline_keyboard: [
                [{ text: '⬅ Шаг назад', callback_data: 'reg_back_to_type' }]
            ]}});
        }
        if (S.step === 'item_price') {
            const price = Number(text);
            if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Введите корректное число');
            temp[chatId].currentItem.price = price;
            temp[chatId].items.push(temp[chatId].currentItem);
            temp[chatId].currentItem = null;
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, `✅ Товар добавлен. Товаров: ${temp[chatId].items.length}`, { reply_markup: { inline_keyboard: [
                [{ text: '➕ Добавить ещё товар',      callback_data: 'add_product' }],
                [{ text: '✏️ Изменить последний товар', callback_data: 'edit_last_item' }],
                [{ text: '➡️ Продолжить',              callback_data: 'continue_reg' }],
                [{ text: '⬅ Шаг назад',                callback_data: 'reg_back_to_size' }]
            ]}});
        }
        if (S.step === 'enter_promo') {
            const code   = text.trim().toUpperCase();
            const promos = loadPromos();
            const promo  = promos.find(p => p.code === code);

            if (!promo) {
                return bot.sendMessage(chatId, '❌ Промокод не найден', { reply_markup: { inline_keyboard: [
                    [{ text: 'Попробовать другой', callback_data: 'try_another_promo' }],
                    [{ text: 'Без промокода',       callback_data: 'skip_promo' }]
                ]}});
            }
            if (promoExpired(promo)) {
                return bot.sendMessage(chatId, '❌ Срок действия промокода истёк', { reply_markup: { inline_keyboard: [
                    [{ text: 'Попробовать другой', callback_data: 'try_another_promo' }],
                    [{ text: 'Без промокода',       callback_data: 'skip_promo' }]
                ]}});
            }
            if (promo.limit !== null && promo.used >= promo.limit) {
                return bot.sendMessage(chatId, '❌ У промокода закончились применения', { reply_markup: { inline_keyboard: [
                    [{ text: 'Попробовать другой', callback_data: 'try_another_promo' }],
                    [{ text: 'Без промокода',       callback_data: 'skip_promo' }]
                ]}});
            }
            const total = temp[chatId].items.reduce((s,i) => s + Number(i.price), 0);
            if (promo.minSum && total < promo.minSum) {
                return bot.sendMessage(chatId,
                    `❌ Промокод действует от ${promo.minSum} ₽\nСумма заказа: ${total} ₽`, { reply_markup: { inline_keyboard: [
                    [{ text: 'Попробовать другой', callback_data: 'try_another_promo' }],
                    [{ text: 'Без промокода',       callback_data: 'skip_promo' }]
                ]}});
            }
            const disc     = calcDiscount(total, promo);
            const newTotal = total - disc;
            temp[chatId].appliedPromo = code;
            temp[chatId].step = 'promo_shown';
            return bot.sendMessage(chatId,
`Промокод <code>${code}</code> успешно применён

Размер скидки: ${disc} ₽
Итоговая стоимость: ${newTotal} ₽`,
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                    [{ text: '✅ Продолжить регистрацию', callback_data: 'skip_promo' }],
                    [{ text: '✏️ Изменить промокод',       callback_data: 'try_another_promo' }],
                    [{ text: '🚫 Отменить промокод',        callback_data: 'cancel_promo' }]
                ]}});
        }
        if (S.step === 'enter_address') {
            temp[chatId].address = text;
            return finishOrder(chatId);
        }

        // ── Промокоды: FSM создания ──
        if (S.promoStep === 'enter_name') {
            const code = text.trim().toUpperCase();
            if (!/^[A-ZА-ЯЁ0-9]+$/u.test(code)) return bot.sendMessage(chatId, '❌ Только большие буквы и цифры');
            temp[chatId].code = code;
            temp[chatId].promoStep = 'enter_limit';
            return bot.sendMessage(chatId, 'Количество применений:', { reply_markup: { inline_keyboard: [
                [{ text: '♾️ Безлимит', callback_data: 'promo_unlimited' }],
                [{ text: '⬅ Шаг назад', callback_data: 'promo_back_name' }]
            ]}});
        }
        if (S.promoStep === 'enter_limit') {
            const lim = Number(text);
            if (isNaN(lim) || lim <= 0) return bot.sendMessage(chatId, '❌ Введите корректное число');
            temp[chatId].limit = lim;
            temp[chatId].promoStep = 'choose_category';
            return askPromoCategory(chatId);
        }
        if (S.promoStep === 'custom_category') {
            temp[chatId].category = text;
            temp[chatId].promoStep = 'enter_date';
            return bot.sendMessage(chatId, 'До какой даты действует?\nФормат: 20.02.2027', { reply_markup: { inline_keyboard: [
                [{ text: 'Бессрочно',   callback_data: 'promo_no_date' }],
                [{ text: '⬅ Шаг назад', callback_data: 'promo_back_category' }]
            ]}});
        }
        if (S.promoStep === 'enter_date') {
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text.trim())) {
                return bot.sendMessage(chatId, '❌ Формат: ДД.ММ.ГГГГ  Пример: 20.02.2027', { reply_markup: { inline_keyboard: [
                    [{ text: 'Бессрочно', callback_data: 'promo_no_date' }]
                ]}});
            }
            temp[chatId].expires = text.trim();
            temp[chatId].promoStep = 'enter_min_sum';
            return bot.sendMessage(chatId, 'Минимальная сумма заказа\nПример: 1000', { reply_markup: { inline_keyboard: [
                [{ text: '♾️ Без лимита (от 0 ₽)', callback_data: 'promo_no_min_sum' }],
                [{ text: '⬅ Шаг назад',             callback_data: 'promo_back_date' }]
            ]}});
        }
        if (S.promoStep === 'enter_min_sum') {
            const ms = Number(text);
            if (isNaN(ms) || ms < 0) return bot.sendMessage(chatId, '❌ Введите число ≥ 0');
            temp[chatId].minSum = ms;
            temp[chatId].promoStep = 'choose_disc_type';
            return bot.sendMessage(chatId, 'Формат скидки:', { reply_markup: { inline_keyboard: [
                [{ text: '% Процент',     callback_data: 'disc_pct' }],
                [{ text: '₽ Фиксированно', callback_data: 'disc_fix' }],
                [{ text: '⬅ Шаг назад',   callback_data: 'promo_back_min_sum' }]
            ]}});
        }
        if (S.promoStep === 'enter_disc_value') {
            const raw = text.trim().replace(/[%₽\s]/g,'');
            const val = Number(raw);
            if (isNaN(val) || val <= 0) return bot.sendMessage(chatId, '❌ Введите число > 0');
            temp[chatId].discountValue = val;
            if (temp[chatId].discountType === '%') {
                temp[chatId].promoStep = 'enter_max_disc';
                return bot.sendMessage(chatId, 'Максимальная скидка (₽):\nПример: 2000', { reply_markup: { inline_keyboard: [
                    [{ text: '♾️ Без лимита', callback_data: 'promo_no_max_disc' }],
                    [{ text: '⬅ Шаг назад',   callback_data: 'promo_back_disc_value' }]
                ]}});
            } else {
                temp[chatId].maxDiscount = null;
                temp[chatId].promoStep = 'enter_comment';
                return bot.sendMessage(chatId, 'Комментарий (необязательно):', { reply_markup: { inline_keyboard: [
                    [{ text: 'Без комментария', callback_data: 'promo_no_comment' }],
                    [{ text: '⬅ Шаг назад',     callback_data: 'promo_back_disc_value' }]
                ]}});
            }
        }
        if (S.promoStep === 'enter_max_disc') {
            const raw = text.trim().replace(/[₽\s]/g,'');
            const val = Number(raw);
            if (isNaN(val) || val <= 0) return bot.sendMessage(chatId, '❌ Введите число > 0');
            temp[chatId].maxDiscount = val;
            temp[chatId].promoStep = 'enter_comment';
            return bot.sendMessage(chatId, 'Комментарий (необязательно):', { reply_markup: { inline_keyboard: [
                [{ text: 'Без комментария', callback_data: 'promo_no_comment' }],
                [{ text: '⬅ Шаг назад',     callback_data: 'promo_back_max_disc' }]
            ]}});
        }
        if (S.promoStep === 'enter_comment') {
            temp[chatId].comment = text;
            return finishPromo(chatId);
        }

        if (S.promoCheck) {
            const promo = loadPromos().find(p => p.code === text.trim().toUpperCase());
            temp[chatId] = {};
            if (!promo) return bot.sendMessage(chatId, '❌ Промокод не найден', { reply_markup: { inline_keyboard: [
                [{ text: 'Проверить другой', callback_data: 'check_promo' }],
                [{ text: 'Главное меню',     callback_data: 'admin_back_main' }]
            ]}});
            return bot.sendMessage(chatId, promoFull(promo), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                [{ text: 'Проверить другой', callback_data: 'check_promo' }],
                [{ text: 'Главное меню',     callback_data: 'admin_back_main' }]
            ]}});
        }

        if (S.mailingStep === 'write_text') {
            temp[chatId].text = text;
            temp[chatId].mailingStep = 'wait_image';
            return bot.sendMessage(chatId, '🖼 Отправьте изображение:', { reply_markup: { inline_keyboard: [
                [{ text: 'Без изображения',  callback_data: 'mail_no_image' }],
                [{ text: 'Переписать текст', callback_data: 'mail_rewrite_text' }]
            ]}});
        }
        if (S.mailingStep === 'wait_image' && msg.photo) {
            temp[chatId].photo = msg.photo[msg.photo.length-1].file_id;
            temp[chatId].mailingStep = 'choose_audience';
            return sendAudienceMenu(chatId);
        }

        if (S.changingStatus) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'База заказов:', { reply_markup: KB_ORDERS }); }
            const orders = loadOrders();
            const order  = orders.find(o => o.id === S.selectedOrder);
            if (!order) return;
            order.status = text;
            saveOrders(orders);
            temp[chatId] = {};
            bot.sendMessage(chatId, '✅ Статус обновлён', { reply_markup: KB_ORDERS });
            if (order.userId) {
                if (normalizeStatus(text) === 'завершен') {
                    bot.sendMessage(order.userId,
`📦 Заказ <code>${order.track}</code> Завершён ✅

<b>Спасибо за доверие к нашей компании, будем рады видеть вас снова!</b>`,
                        { parse_mode: 'HTML' }).catch(() => {});
                } else {
                    bot.sendMessage(order.userId,
                        `🚚 Статус вашего заказа <code>${order.track}</code> обновлён:\n\n<b>${order.status}</b>`,
                        { parse_mode: 'HTML' }).catch(() => {});
                }
            }
            return;
        }

        if (S.editingField) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'База заказов:', { reply_markup: KB_ORDERS }); }
            temp[chatId].field = text;
            temp[chatId].editingField = false;
            temp[chatId].awaitingValue = true;
            const hints = { 'Никнейм': 'Новый никнейм:', 'Тип': 'Новый тип:', 'Цена': 'Новая цена (₽):', 'Артикул/ссылка': 'Новый артикул / ссылка:' };
            return bot.sendMessage(chatId, hints[text] || 'Введите новое значение:');
        }
        if (S.awaitingValue) {
            const orders = loadOrders();
            const order  = orders.find(o => o.id === S.selectedOrder);
            if (!order) return;
            if (S.field === 'Никнейм')        order.nickname = text.replace('@','');
            if (S.field === 'Тип')            order.items[0].type = text;
            if (S.field === 'Цена')           { order.items[0].price = Number(text); order.total = order.items.reduce((s,i)=>s+Number(i.price),0); }
            if (S.field === 'Артикул/ссылка') order.items[0].article = text;
            saveOrders(orders);
            temp[chatId] = {};
            return bot.sendMessage(chatId,
`✅ Данные обновлены

Трек: <code>${order.track}</code>
@${order.nickname}
Тип: ${order.items[0].type||'—'}
Артикул: ${order.items[0].article||'—'}
Сумма: ${order.total} ₽
Статус: ${order.status}`,
                { parse_mode: 'HTML', reply_markup: KB_ORDERS });
        }

        return;
    }

    // ══════════════════════════════════════════
    //  CLIENT
    // ══════════════════════════════════════════
    if (text === 'Главное меню') return mainMenu(chatId);

    if (text === '🛍 Сделать заказ') return bot.sendMessage(chatId,
`🛍 Сделать заказ

Заказ поможет оформить наш менеджер!

Отправьте ему ссылку / скриншот / модель товара, размер и стоимость.`,
        { reply_markup: { inline_keyboard: [[{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }]] }});

    // ── Калькулятор ──
    if (text === '💰 Рассчитать стоимость товара') {
        temp[chatId] = { calcStep: 'chooseType' };
        return bot.sendMessage(chatId, '💰 Выберите тип товара:', { reply_markup: { keyboard: [
            ['Одежда'], ['Обувь'],
            ['Часы/украшения'], ['Техника'], ['Другое'],
            ['⬅️ Назад']
        ], resize_keyboard: true }});
    }
    if (text === '⬅️ Назад') { temp[chatId] = {}; return mainMenu(chatId); }

    if (text === '💴 Текущий курс юаня') return bot.sendMessage(chatId,
        '💴 Текущий курс равен *12.5₽ = 1¥*\n\n_стоимость товара × курс юаня_',
        { parse_mode: 'Markdown' });

    if (text === '🛠 Поддержка') return bot.sendMessage(chatId,
        '🛠 Поддержка\n\nОтправьте менеджеру номер заказа и опишите проблему.',
        { reply_markup: { inline_keyboard: [[{ text: 'Решить проблему', url: 'https://t.me/adrlogisticsmanager' }]] }});

    if (text === '📦 Мои заказы') return bot.sendMessage(chatId, 'Какие заказы?', { reply_markup: { keyboard: [
        ['📦 Активные'], ['✅ Завершённые'], ['⬅️ Назад']
    ], resize_keyboard: true }});

    if (text === '📦 Активные') {
        const list = loadOrders().filter(o => String(o.userId)===String(chatId) && normalizeStatus(o.status)!=='завершен');
        if (!list.length) return bot.sendMessage(chatId, 'Активных заказов нет.');
        list.forEach(o => bot.sendMessage(chatId,
            `📦 Заказ <code>${o.track}</code>\n\n💰 Сумма: ${o.total||0} ₽\n📌 Статус: ${o.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `client_details_${o.id}` }]] }}));
        return;
    }
    if (text === '✅ Завершённые') {
        const list = loadOrders().filter(o => String(o.userId)===String(chatId) && normalizeStatus(o.status)==='завершен');
        if (!list.length) return bot.sendMessage(chatId, 'Завершённых заказов нет.');
        list.forEach(o => bot.sendMessage(chatId,
            `📦 Заказ <code>${o.track}</code>\n\n💰 Сумма: ${o.total||0} ₽\n📌 Статус: ${o.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `client_details_${o.id}` }]] }}));
        return;
    }

    if (S.calcStep === 'chooseType') {
        if (['Часы/украшения','Техника','Другое'].includes(text)) {
            temp[chatId] = {};
            bot.sendMessage(chatId, 'Эта категория обсуждается лично с менеджером.', { reply_markup: { inline_keyboard: [[{ text: 'Связаться', url: 'https://t.me/adrlogisticsmanager' }]] }});
            return mainMenu(chatId);
        }
        if (text === 'Одежда' || text === 'Обувь') {
            temp[chatId] = { calcStep: 'waitPrice', calcType: text === 'Одежда' ? 'clothes' : 'shoes', calcCategory: text };
            return bot.sendMessage(chatId, 'Введите стоимость товара в юанях:', { reply_markup: { remove_keyboard: true }});
        }
        return;
    }
    if (S.calcStep === 'waitPrice') {
        const p = Number(text);
        if (isNaN(p) || p <= 0) return bot.sendMessage(chatId, '❌ Введите корректную сумму');
        const total = S.calcType === 'clothes' ? p*12+1500 : p*12+2500;
        // Сохраняем total, переходим к шагу промокода
        temp[chatId].calcTotal = total;
        temp[chatId].calcStep  = 'waitPromo';
        return bot.sendMessage(chatId, 'Введите промокод:', { reply_markup: { inline_keyboard: [
            [{ text: 'Без промокода ❌', callback_data: 'calc_skip_promo' }]
        ]}});
    }

    // ── Ввод промокода в калькуляторе ──
    if (S.calcStep === 'waitPromo') {
        const code   = text.trim().toUpperCase();
        const promos = loadPromos();
        const promo  = promos.find(p => p.code === code);
        const total  = S.calcTotal;

        if (!promo) {
            return bot.sendMessage(chatId, '❌ Промокод не найден!', { reply_markup: calcPromoErrorKB() });
        }
        if (promoExpired(promo)) {
            return bot.sendMessage(chatId, 'У промокода закончился срок действия!', { reply_markup: calcPromoErrorKB() });
        }
        if (promo.limit !== null && promo.used >= promo.limit) {
            return bot.sendMessage(chatId, 'Этот промокод больше недоступен!', { reply_markup: calcPromoErrorKB() });
        }
        // Проверка категории
        if (!promoMatchesCalcType(promo, S.calcType)) {
            return bot.sendMessage(chatId,
                `Промокод действует только на категорию ${promo.category}!`,
                { reply_markup: calcPromoErrorKB() });
        }
        // Проверка минимальной суммы
        if (promo.minSum && total < promo.minSum) {
            return bot.sendMessage(chatId,
                `Промокод действует от ${promo.minSum} ₽!`,
                { reply_markup: calcPromoErrorKB() });
        }

        const discount = calcDiscount(total, promo);
        temp[chatId] = {};
        return sendCalcResultWithDiscount(chatId, total, discount, code);
    }

    // FAQ
    if (text === '📌 FAQ' || text === 'Назад в FAQ') {
        return bot.sendMessage(chatId, '📌 FAQ\n\nВыберите раздел:', { reply_markup: KB_FAQ });
    }
    const faqAnswers = {
        '🚚 Доставка': '🚚 *Доставка*\n\nВсе товары сначала попадают на склад в Адлере.\n\nСпособы получения:\n— Отправка СДЭК/Почта России _(доставку оплачивает клиент)_\n— Бесплатная доставка по Адлеру\n— Самовывоз со склада',
        '↩️ Возврат': '↩️ *Возврат*\n\n*Возврат не осуществляется!*\n\nТовар проходит тщательную проверку. Если он бракованный — заменим.',
        '📦 Как отследить заказ?': '📦 *Отслеживание*\n\n*Раздел "Мои заказы"* — там все ваши заказы.\n\nОб изменении статуса бот уведомит автоматически.',
        '✅ Оригинал или нет?': '✅ *Оригинал?*\n\n*Товар исключительно оригинальный.*\n\nПроверяем подлинность на складе в Китае.',
        '🕒 Время работы Менеджеров': '🕒 *Время работы*\n\nМенеджеры без выходных:\n*с 10:00 до 22:00*'
    };
    if (faqAnswers[text]) {
        return bot.sendMessage(chatId, faqAnswers[text], { parse_mode: 'Markdown', reply_markup: KB_FAQ_BACK });
    }
});

// ─────────────────────────────────────────────
//  CALLBACK
// ─────────────────────────────────────────────
bot.on('callback_query', async query => {
    const chatId = query.message.chat.id;
    const data   = query.data;
    const S      = temp[chatId] || {};
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (data === 'back_main' || data === 'admin_back_main') {
        temp[chatId] = {};
        return ADMIN_IDS.includes(chatId) ? adminMenu(chatId) : mainMenu(chatId);
    }
    if (data === 'back_to_orders') { temp[chatId] = {}; return bot.sendMessage(chatId, 'База заказов:', { reply_markup: KB_ORDERS }); }
    if (data === 'back_to_filters') { temp[chatId] = { inFilters: true }; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: KB_FILTERS }); }
    if (data === 'all_orders') { temp[chatId] = {}; return bot.sendMessage(chatId, 'База заказов:', { reply_markup: KB_ORDERS }); }

    // ── Калькулятор: промокод ──
    if (data === 'calc_skip_promo') {
        const total = S.calcTotal;
        temp[chatId] = {};
        return sendCalcResult(chatId, total);
    }
    if (data === 'calc_retry_promo') {
        // Остаёмся на шаге ввода промокода
        return bot.sendMessage(chatId, 'Введите промокод:', { reply_markup: { inline_keyboard: [
            [{ text: 'Без промокода ❌', callback_data: 'calc_skip_promo' }]
        ]}});
    }

    // ── Регистрация заказа ──
    if (data === 'cancel_reg') { temp[chatId] = {}; return bot.sendMessage(chatId, '❌ Регистрация отменена', { reply_markup: KB_ADMIN }); }
    if (data === 'reg_back_to_nickname') {
        temp[chatId].step = 'nickname';
        return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример: @client_username', { reply_markup: { inline_keyboard: [[{ text: '❌ Прекратить', callback_data: 'cancel_reg' }]] }});
    }
    if (data === 'reg_back_to_products') {
        temp[chatId].step = 'products_menu';
        return bot.sendMessage(chatId, '🛍 Товары клиента', { reply_markup: { inline_keyboard: [
            [{ text: '➕ Добавить товар', callback_data: 'add_product' }],
            [{ text: '⬅ Шаг назад',       callback_data: 'reg_back_to_nickname' }]
        ]}});
    }
    if (data === 'reg_back_to_article') { temp[chatId].step = 'item_article'; return bot.sendMessage(chatId, 'Артикул / ссылка на товар:'); }
    if (data === 'reg_back_to_type')    { temp[chatId].step = 'item_type';    return bot.sendMessage(chatId, 'Тип товара (Обувь / Одежда / Другое):'); }
    if (data === 'reg_back_to_size')    { temp[chatId].step = 'item_size';    return bot.sendMessage(chatId, 'Размер:'); }

    if (data === 'add_product') {
        temp[chatId].currentItem = {};
        temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, 'Артикул / ссылка на товар:', { reply_markup: { inline_keyboard: [
            [{ text: '⬅ Шаг назад', callback_data: 'reg_back_to_products' }]
        ]}});
    }
    if (data === 'edit_last_item') {
        if (!temp[chatId].items || !temp[chatId].items.length) return bot.sendMessage(chatId, '❌ Нет товаров');
        temp[chatId].currentItem = temp[chatId].items.pop();
        temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, `Артикул (сейчас: ${temp[chatId].currentItem.article}):`);
    }
    if (data === 'continue_reg') {
        temp[chatId].step = 'enter_promo';
        delete temp[chatId].appliedPromo;
        return bot.sendMessage(chatId, '🎁 Введите промокод:', { reply_markup: { inline_keyboard: [
            [{ text: 'Без промокода', callback_data: 'skip_promo' }],
            [{ text: '⬅ Шаг назад',   callback_data: 'reg_back_to_products' }]
        ]}});
    }
    if (data === 'try_another_promo') {
        temp[chatId].step = 'enter_promo';
        delete temp[chatId].appliedPromo;
        return bot.sendMessage(chatId, '🎁 Введите промокод:', { reply_markup: { inline_keyboard: [
            [{ text: 'Без промокода', callback_data: 'skip_promo' }]
        ]}});
    }
    if (data === 'cancel_promo') {
        delete temp[chatId].appliedPromo;
        temp[chatId].step = 'choose_delivery';
        return bot.sendMessage(chatId, '🚚 Способ доставки:', { reply_markup: { inline_keyboard: [
            [{ text: 'Доставка по Адлеру', callback_data: 'delivery_adler' }],
            [{ text: 'Самовывоз',           callback_data: 'delivery_pickup' }],
            [{ text: 'СДЭК / Почта России', callback_data: 'delivery_post' }],
            [{ text: '⬅ Шаг назад',         callback_data: 'continue_reg' }]
        ]}});
    }
    if (data === 'skip_promo') {
        temp[chatId].step = 'choose_delivery';
        return bot.sendMessage(chatId, '🚚 Способ доставки:', { reply_markup: { inline_keyboard: [
            [{ text: 'Доставка по Адлеру', callback_data: 'delivery_adler' }],
            [{ text: 'Самовывоз',           callback_data: 'delivery_pickup' }],
            [{ text: 'СДЭК / Почта России', callback_data: 'delivery_post' }],
            [{ text: '⬅ Шаг назад',         callback_data: 'continue_reg' }]
        ]}});
    }
    if (data === 'delivery_adler')  { temp[chatId].delivery = 'Доставка по Адлеру'; temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📍 Адрес получателя:'); }
    if (data === 'delivery_post')   { temp[chatId].delivery = 'СДЭК / Почта России'; temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📬 Индекс / адрес:'); }
    if (data === 'delivery_pickup') { temp[chatId].delivery = 'Самовывоз'; return finishOrder(chatId); }

    // ── Промокоды: создание ──
    if (data === 'promo_back_to_menu') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: KB_PROMOS }); }
    if (data === 'promo_back_name')    { temp[chatId] = { promoStep: 'enter_name' }; return bot.sendMessage(chatId, 'Введите код промокода'); }
    if (data === 'promo_unlimited')    { temp[chatId].limit = null; temp[chatId].promoStep = 'choose_category'; return askPromoCategory(chatId); }
    if (data === 'promo_back_category') { temp[chatId].promoStep = 'choose_category'; return askPromoCategory(chatId); }
    if (data === 'promo_no_date') {
        temp[chatId].expires = null;
        temp[chatId].promoStep = 'enter_min_sum';
        return bot.sendMessage(chatId, 'Минимальная сумма заказа\nПример: 1000', { reply_markup: { inline_keyboard: [
            [{ text: '♾️ Без лимита', callback_data: 'promo_no_min_sum' }],
            [{ text: '⬅ Шаг назад',   callback_data: 'promo_back_category' }]
        ]}});
    }
    if (data === 'promo_back_date')    { temp[chatId].promoStep = 'enter_date'; return bot.sendMessage(chatId, 'До какой даты?\nФормат: 20.02.2027'); }
    if (data === 'promo_no_min_sum')   {
        temp[chatId].minSum = 0;
        temp[chatId].promoStep = 'choose_disc_type';
        return bot.sendMessage(chatId, 'Формат скидки:', { reply_markup: { inline_keyboard: [
            [{ text: '% Процент',      callback_data: 'disc_pct' }],
            [{ text: '₽ Фиксированно', callback_data: 'disc_fix' }]
        ]}});
    }
    if (data === 'promo_back_min_sum') { temp[chatId].promoStep = 'enter_min_sum'; return bot.sendMessage(chatId, 'Минимальная сумма заказа'); }
    if (data === 'disc_pct') { temp[chatId].discountType = '%';  temp[chatId].promoStep = 'enter_disc_value'; return bot.sendMessage(chatId, 'Размер скидки (%)\nПример: 20'); }
    if (data === 'disc_fix') { temp[chatId].discountType = '₽';  temp[chatId].promoStep = 'enter_disc_value'; return bot.sendMessage(chatId, 'Размер скидки (₽)\nПример: 2000'); }
    if (data === 'promo_no_max_disc')  { temp[chatId].maxDiscount = null; temp[chatId].promoStep = 'enter_comment'; return bot.sendMessage(chatId, 'Комментарий:', { reply_markup: { inline_keyboard: [[{ text: 'Без комментария', callback_data: 'promo_no_comment' }]] }}); }
    if (data === 'promo_back_disc_value') { temp[chatId].promoStep = 'enter_disc_value'; return bot.sendMessage(chatId, 'Размер скидки:'); }
    if (data === 'promo_back_max_disc')   { temp[chatId].promoStep = 'enter_max_disc'; return bot.sendMessage(chatId, 'Максимальная скидка (₽):'); }
    if (data === 'promo_no_comment')  { temp[chatId].comment = null; return finishPromo(chatId); }

    if (data.startsWith('pcat_')) {
        if (data === 'pcat_custom') { temp[chatId].promoStep = 'custom_category'; return bot.sendMessage(chatId, 'Введите свою категорию:'); }
        // ФИX: используем полное название категории из маппинга
        temp[chatId].category = categoryFromData(data);
        temp[chatId].promoStep = 'enter_date';
        return bot.sendMessage(chatId, 'До какой даты действует?\nФормат: 20.02.2027', { reply_markup: { inline_keyboard: [
            [{ text: 'Бессрочно',   callback_data: 'promo_no_date' }],
            [{ text: '⬅ Шаг назад', callback_data: 'promo_back_category' }]
        ]}});
    }

    if (data === 'check_promo') { temp[chatId] = { promoCheck: true }; return bot.sendMessage(chatId, '🔍 Введите промокод:'); }

    if (data.startsWith('pd_')) {
        const code  = data.slice(3);
        const promo = loadPromos().find(p => p.code === code);
        if (!promo) return;
        return bot.sendMessage(chatId, promoFull(promo), { parse_mode: 'HTML', reply_markup: KB_PROMO_DETAIL });
    }

    if (data.startsWith('details_')) {
        const id = Number(data.replace('details_',''));
        const o  = loadOrders().find(x => x.id === id);
        if (!o) return;
        let it = '';
        o.items.forEach((item,i) => { it += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'—'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`; });
        const discLine  = o.discount ? `\n🏷 Скидка: -${o.discount} ₽` : '';
        const promoLine = o.promoCode ? `\n🎁 Промокод: ${o.promoCode}` : '';
        return bot.sendMessage(chatId,
`📦 <b>Заказ <code>${o.track}</code></b>
@${o.nickname}

🛍 <b>Товаров:</b> ${o.items.length}

${it}
🚚 <b>Доставка:</b> ${o.delivery}
📍 <b>Адрес:</b> ${o.address||'Самовывоз'}${promoLine}${discLine}

💰 <b>Итого:</b> ${o.total} ₽
📦 <b>Статус:</b> ${o.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                [{ text: '🔄 Изменить статус', callback_data: `status_${o.id}` }],
                [{ text: '✏️ Изменить данные', callback_data: `edit_${o.id}` }],
                [{ text: '⬅ Назад',            callback_data: 'all_orders' }]
            ]}});
    }

    if (data.startsWith('client_details_')) {
        const id = Number(data.replace('client_details_',''));
        const o  = loadOrders().find(x => x.id === id);
        if (!o || String(o.userId) !== String(chatId)) return;
        let it = '';
        o.items.forEach((item,i) => { it += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'—'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`; });
        const discLine  = o.discount ? `\n🏷 Скидка: -${o.discount} ₽` : '';
        const promoLine = o.promoCode ? `\n🎁 Промокод: ${o.promoCode}` : '';
        return bot.sendMessage(chatId,
`📦 Заказ <code>${o.track}</code>

${it}
🚚 Доставка: ${o.delivery}
📍 Адрес: ${o.address||'Самовывоз'}${promoLine}${discLine}

💰 Итого: ${o.total} ₽
📦 Статус: ${o.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅ Назад', callback_data: 'back_client_orders' }]] }});
    }
    if (data === 'back_client_orders') return sendClientOrders(chatId);

    if (data.startsWith('status_')) {
        const id = Number(data.replace('status_',''));
        const o  = loadOrders().find(x => x.id === id);
        if (!o) return;
        temp[chatId] = { selectedOrder: id, changingStatus: true };
        return bot.sendMessage(chatId, 'Выберите новый статус:', { reply_markup: { keyboard: [
            ...ALL_STATUSES.filter(s => s !== o.status).map(s => [s]),
            ['Назад']
        ], resize_keyboard: true }});
    }

    if (data.startsWith('edit_')) {
        const id = Number(data.replace('edit_',''));
        if (!loadOrders().find(x => x.id === id)) return;
        temp[chatId] = { selectedOrder: id, editingField: true };
        return bot.sendMessage(chatId, 'Что изменить?', { reply_markup: { keyboard: [
            ['Никнейм'], ['Тип'], ['Цена'], ['Артикул/ссылка'], ['Назад']
        ], resize_keyboard: true }});
    }

    // ── Рассылка ──
    if (data === 'mail_cancel')          { temp[chatId] = {}; return adminMenu(chatId); }
    if (data === 'mail_rewrite_text')    { temp[chatId].mailingStep = 'write_text'; return bot.sendMessage(chatId, '✍️ Введите новый текст:'); }
    if (data === 'mail_back_to_image')   { temp[chatId].photo = null; temp[chatId].mailingStep = 'wait_image'; return bot.sendMessage(chatId, '🖼 Отправьте изображение:', { reply_markup: { inline_keyboard: [[{ text: 'Без изображения', callback_data: 'mail_no_image' }]] }}); }
    if (data === 'mail_change_audience') { temp[chatId].mailingStep = 'choose_audience'; return sendAudienceMenu(chatId); }
    if (data === 'mail_no_image')        { temp[chatId].photo = null; temp[chatId].mailingStep = 'choose_audience'; return sendAudienceMenu(chatId); }

    const AUD = ['mail_all','mail_waiting','mail_new','mail_completed','mail_inactive'];
    if (AUD.includes(data) && S.mailingStep === 'choose_audience') {
        temp[chatId].audience    = data;
        temp[chatId].mailingStep = 'confirm';
        if (S.photo) await bot.sendPhoto(chatId, S.photo, { caption: S.text, parse_mode: 'HTML' });
        else await bot.sendMessage(chatId, S.text, { parse_mode: 'HTML' });
        return bot.sendMessage(chatId, '📨 Так сообщение увидит клиент. Отправить?', { reply_markup: { inline_keyboard: [
            [{ text: '✅ Отправить',         callback_data: 'mail_send' }],
            [{ text: 'Изменить изображение', callback_data: 'mail_back_to_image' }],
            [{ text: 'Изменить текст',       callback_data: 'mail_rewrite_text' }],
            [{ text: 'Изменить аудиторию',   callback_data: 'mail_change_audience' }],
            [{ text: 'Отменить',             callback_data: 'mail_cancel' }]
        ]}});
    }

    if (data === 'mail_send') {
        const orders = loadOrders(); const users = loadUsers(); const now = Date.now();
        const allIds = Object.values(users);
        let recip = [];
        switch (S.audience) {
            case 'mail_all':       recip = allIds; break;
            case 'mail_waiting':   recip = [...new Set(orders.filter(o=>o.status!=='Завершен').map(o=>o.userId))]; break;
            case 'mail_completed': recip = [...new Set(orders.filter(o=>o.status==='Завершен').map(o=>o.userId))]; break;
            case 'mail_new':       recip = allIds.filter(id=>!orders.some(o=>String(o.userId)===String(id))); break;
            case 'mail_inactive':  recip = allIds.filter(id=>{ const uo=orders.filter(o=>String(o.userId)===String(id)); if(!uo.length) return false; return (now-Math.max(...uo.map(o=>o.createdAt)))>60*24*60*60*1000; }); break;
        }
        recip = [...new Set(recip)].filter(Boolean);
        let ok = 0, fail = 0;
        for (const id of recip) {
            try {
                if (S.photo) await bot.sendPhoto(id, S.photo, { caption: S.text, parse_mode: 'HTML' });
                else await bot.sendMessage(id, S.text, { parse_mode: 'HTML' });
                ok++;
                await new Promise(r => setTimeout(r, 50));
            } catch { fail++; }
        }
        temp[chatId] = {};
        return bot.sendMessage(chatId,
            `📊 Рассылка завершена\n\n👥 Получателей: ${recip.length}\n✅ Успешно: ${ok}\n❌ Ошибки: ${fail}`);
    }
});

console.log('✅ Бот запущен');
