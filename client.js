 JS
Copy

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    console.log('Второй процесс остановлен');
    process.exit(0);
}

const PROMO_FILE  = path.join(__dirname, 'promocodes.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const USERS_FILE  = path.join(__dirname, 'users.json');

function loadJSON(file) {
    if (!fs.existsSync(file)) return file === USERS_FILE ? {} : [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return file === USERS_FILE ? {} : []; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function loadOrders()  { return loadJSON(ORDERS_FILE); }
function saveOrders(d) { saveJSON(ORDERS_FILE, d); }
function loadPromos()  { return loadJSON(PROMO_FILE); }
function savePromos(d) { saveJSON(PROMO_FILE, d); }
function loadUsers()   { return loadJSON(USERS_FILE); }
function saveUsers(d)  { saveJSON(USERS_FILE, d); }
function normalizeStatus(s) { return (s || '').trim().toLowerCase(); }

function generateTrackNumber(existingOrders) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const block = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    let track;
    do { track = block() + ' ' + block(); } while (existingOrders.some(o => o.track === track));
    return track;
}

const token = '8333995700:AAGd30lumgSxFwuts-EQY4guQOX-gjqjRJI';
const bot   = new TelegramBot(token, { polling: true });
const ADMIN_IDS = [8183121320, 8042412556];
const temp = {};

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION:', err));
process.on('uncaughtException',  err => console.error('UNCAUGHT EXCEPTION:', err));

// ===== KEYBOARDS =====
const STATUS_KEYBOARD = {
    keyboard: [
        ['В обработке'],
        ['Отправлен на склад в Китае'],
        ['Отправлен на склад в Сочи'],
        ['Готов к получению'],
        ['Завершен'],
        ['⬅ Назад']
    ],
    resize_keyboard: true
};

const PRICE_KEYBOARD = {
    keyboard: [
        ['0 - 5 000 ₽'],
        ['5 000 - 10 000 ₽'],
        ['10 000 - 15 000 ₽'],
        ['15 000 - 20 000 ₽'],
        ['+ 20 000 ₽'],
        ['⬅ Назад']
    ],
    resize_keyboard: true
};

const FILTERS_KEYBOARD = {
    keyboard: [
        ['По статусу заказа'],
        ['По никнейму'],
        ['По цене'],
        ['По трек номеру'],
        ['⬅ Назад']
    ],
    resize_keyboard: true
};

const ORDERS_BASE_KEYBOARD = {
    keyboard: [['Все заказы'], ['Фильтры'], ['Главное меню']],
    resize_keyboard: true
};

const PROMO_MAIN_KEYBOARD = {
    keyboard: [
        ['➕ Создать промокод'],
        ['🔎 Посмотреть промокод'],
        ['📋 Все промокоды'],
        ['Главное меню']
    ],
    resize_keyboard: true
};

const PROMO_LIST_KEYBOARD = {
    keyboard: [
        ['🟢 Активные промокоды'],
        ['🔴 Завершённые промокоды'],
        ['📋 Показать все'],
        ['⬅ Назад к промокодам']
    ],
    resize_keyboard: true
};

// ===== MENUS =====
function mainMenu(chatId) {
    return bot.sendMessage(chatId, 'Главное меню', { reply_markup: { keyboard: [
        ['🛍 Сделать заказ', '📦 Мои заказы'],
        ['💰 Рассчитать стоимость товара', '💴 Текущий курс юаня'],
        ['📌 FAQ'], ['🛠 Поддержка']
    ], resize_keyboard: true }});
}
function adminMenu(chatId) {
    return bot.sendMessage(chatId, 'Главное меню', { reply_markup: { keyboard: [
        ['🖋️ Зарегистрировать заказ'], ['📄 База заказов'],
        ['📊 Статистика'], ['🎁 Промокоды'], ['📢 Акции'], ['Поддержка']
    ], resize_keyboard: true }});
}

// ===== HELPERS =====
function sendPromoCategory(chatId) {
    return bot.sendMessage(chatId, 'Выберите на что действует промокод:', { reply_markup: { inline_keyboard: [
        [{ text: 'Обувь',          callback_data: 'promo_cat_Обувь' }],
        [{ text: 'Одежда',         callback_data: 'promo_cat_Одежда' }],
        [{ text: 'Часы/украшения', callback_data: 'promo_cat_Часы' }],
        [{ text: 'Техника',        callback_data: 'promo_cat_Техника' }],
        [{ text: 'Другое',         callback_data: 'promo_cat_Другое' }],
        [{ text: 'Свой вариант',   callback_data: 'promo_cat_custom' }]
    ]}});
}

function sendOrdersWithButtons(chatId, orders) {
    if (!orders.length) return bot.sendMessage(chatId, 'Заказов не найдено');
    orders.forEach(order => {
        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>  @${order.nickname}\n\n💰 Сумма: ${order.total||0} ₽\n📌 Статус: ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `details_${order.id}` }]] }});
    });
}

function sendClientOrders(chatId) {
    const orders = loadOrders().filter(o => String(o.userId) === String(chatId)).sort((a,b) => b.createdAt - a.createdAt);
    if (!orders.length) return bot.sendMessage(chatId, 'У вас пока нет заказов.');
    orders.forEach(order => {
        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>  @${order.nickname}\n\n💰 Сумма: ${order.total||0} ₽\n📌 Статус: ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]] }});
    });
}

function sendAudienceMenu(chatId) {
    return bot.sendMessage(chatId, '👥 Кому хотите отправить сообщение?', { reply_markup: { inline_keyboard: [
        [{ text: 'Всем',                    callback_data: 'mail_all' }],
        [{ text: 'Кто ожидает заказ',       callback_data: 'mail_waiting' }],
        [{ text: 'Кто только включил бот',  callback_data: 'mail_new' }],
        [{ text: 'Кто забрал заказ',        callback_data: 'mail_completed' }],
        [{ text: 'Кто давно не заказывал',  callback_data: 'mail_inactive' }],
        [{ text: 'Назад к изображению',     callback_data: 'mail_back_to_image' }],
        [{ text: 'Отменить рассылку',       callback_data: 'mail_cancel' }]
    ]}});
}

// ===== PROMO FORMAT HELPERS =====
function formatDiscount(promo) {
    if (promo.discountType === 'percent') return `${promo.discountValue}%`;
    return `${promo.discountValue}₽`;
}
function formatMaxDiscount(promo) {
    if (promo.discountType === 'percent') {
        return promo.maxDiscount === null ? 'Безлимит' : `${promo.maxDiscount}₽`;
    }
    return null;
}
function formatMinSum(promo) {
    return promo.minSum === null ? '0₽ (Безлимит)' : `${promo.minSum}₽`;
}
function promoShortText(promo) {
    const status = promo.expired ? 'Завершён🔴' : 'Активен🟢';
    const remaining = promo.limit === null ? '∞' : (promo.limit - promo.used);
    return `Промокод <code>${promo.code}</code>\n${status}\nРазмер скидки: ${formatDiscount(promo)}\nОсталось применить: ${remaining}`;
}
function promoFullText(promo) {
    const status = promo.expired ? 'Завершён🔴' : 'Активен🟢';
    const total = promo.limit === null ? '∞' : promo.limit;
    const remaining = promo.limit === null ? '∞' : (promo.limit - promo.used);
    let text = `Промокод <code>${promo.code}</code>\n${status}\n\nВсего применений: ${total}\nОсталось применений: ${remaining}\nДействует на: ${promo.category}\nСрок действия: ${promo.expires||'Бессрочно'}\nНачальная сумма действия: ${formatMinSum(promo)}\nРазмер скидки: ${formatDiscount(promo)}`;
    if (promo.discountType === 'percent' && promo.maxDiscount !== undefined) {
        text += `\nМаксимальная скидка: ${formatMaxDiscount(promo)}`;
    }
    if (promo.comment) text += `\nКомментарий: ${promo.comment}`;
    return text;
}

function saveAndSendPromo(chatId) {
    const promos = loadPromos();
    const d = temp[chatId];
    const total = d.limit === null ? '∞' : d.limit;
    const discountStr = d.discountType === 'percent' ? `${d.discountValue}%` : `${d.discountValue}₽`;
    const maxDiscStr = (d.discountType === 'percent') ? (d.maxDiscount === null ? 'Безлимит' : `${d.maxDiscount}₽`) : '';
    const minSumStr = d.minSum === null ? '0₽ (Безлимит)' : `${d.minSum}₽`;
    promos.push({
        code: d.code, limit: d.limit, used: 0, category: d.category,
        expires: d.expires || null, comment: d.comment || null,
        discountType: d.discountType, discountValue: d.discountValue,
        maxDiscount: d.maxDiscount !== undefined ? d.maxDiscount : null,
        minSum: d.minSum !== undefined ? d.minSum : null,
        expired: false, createdAt: Date.now()
    });
    savePromos(promos);
    const code = d.code;
    temp[chatId] = {};
    let msg = `Промокод <code>${code}</code>\n✅ Успешно создан\n\nВсего применений: ${total}\nОсталось применений: ${total}\nДействует на: ${d.category}\nСрок действия: ${d.expires||'Бессрочно'}\nНачальная сумма действия: ${minSumStr}\nРазмер скидки: ${discountStr}`;
    if (d.discountType === 'percent') msg += `\nМаксимальная скидка: ${maxDiscStr}`;
    return bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: PROMO_MAIN_KEYBOARD });
}

function finishOrder(chatId) {
    const data = temp[chatId];
    const orders = loadOrders();
    const users = loadUsers();
    const clientId = users[data.nickname.toLowerCase()];
    if (!clientId) {
        bot.sendMessage(chatId, '❌ Клиент не найден. Убедитесь, что он запустил бот.');
        temp[chatId] = {};
        return;
    }
    const track = generateTrackNumber(orders);
    const total = data.items.reduce((s, i) => s + Number(i.price), 0);
    const newOrder = {
        id: Date.now(), userId: clientId, nickname: data.nickname, items: data.items,
        delivery: data.delivery, address: data.address || null,
        status: 'В обработке', track, total, createdAt: Date.now()
    };
    orders.push(newOrder);
    saveOrders(orders);

    let itemsText = '';
    newOrder.items.forEach((item, i) => {
        itemsText += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'не указан'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`;
    });

    bot.sendMessage(chatId,
`📦 <b>Заказ <code>${newOrder.track}</code></b>\n@${newOrder.nickname}\n\n🛍 <b>Товаров:</b> ${newOrder.items.length}\n\n${itemsText}\n🚚 <b>Доставка:</b> ${newOrder.delivery}\n📍 <b>Адрес:</b> ${newOrder.address||'Самовывоз'}\n\n💰 <b>Итого:</b> ${newOrder.total} ₽\n📦 <b>Статус:</b> ${newOrder.status}`,
        { parse_mode: 'HTML', reply_markup: ORDERS_BASE_KEYBOARD });

    bot.sendMessage(clientId,
`Ваш заказ <code>${newOrder.track}</code> Зарегистрирован ✅\nСтатус: В обработке\n<i>Вы можете отследить статус вашего заказа в разделе Мои заказы</i>`,
        { parse_mode: 'HTML' });

    temp[chatId] = {};
}

// ===== /start =====
bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    if (ADMIN_IDS.includes(chatId)) return adminMenu(chatId);
    if (!username) return bot.sendMessage(chatId, '⚠️ Установите username в Telegram, затем нажмите /start снова.');
    const users = loadUsers();
    users[username.toLowerCase()] = chatId;
    saveUsers(users);
    return mainMenu(chatId);
});

// ===== MESSAGES =====
bot.on('message', msg => {
    const chatId = msg.chat.id;
    const text = msg.text || msg.caption;
    if (!text && !msg.photo) return;
    const isAdmin = ADMIN_IDS.includes(chatId);
    const state = temp[chatId] || {};

    if (isAdmin) {
        if (text === 'Главное меню') { temp[chatId] = {}; return adminMenu(chatId); }
        if (text === 'Поддержка') return bot.sendMessage(chatId, '📞 Поддержка: @Savelisb');

        // ===== ФИЛЬТР — ПО СТАТУСУ =====
        if (state.filterStatus) {
            const statuses = ['В обработке','Отправлен на склад в Китае','Отправлен на склад в Сочи','Готов к получению','Завершен'];
            if (text === '⬅ Назад') {
                temp[chatId] = { inFilters: true };
                return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: FILTERS_KEYBOARD });
            }
            if (statuses.includes(text)) {
                const filtered = loadOrders().filter(o => o.status === text).sort((a,b) => a.createdAt - b.createdAt);
                if (!filtered.length) {
                    return bot.sendMessage(chatId, `📭 Заказов в этом статусе нет\n\nВыберите другой статус:`, { reply_markup: STATUS_KEYBOARD });
                }
                sendOrdersWithButtons(chatId, filtered);
                return bot.sendMessage(chatId, `✅ Найдено заказов: ${filtered.length}\n\nВыберите другой статус или вернитесь назад:`, { reply_markup: STATUS_KEYBOARD });
            }
            return;
        }

        // ===== ФИЛЬТР — ПО ЦЕНЕ =====
        if (state.filterPrice) {
            const priceMap = {
                '0 - 5 000 ₽':       o => (o.total||0) <= 5000,
                '5 000 - 10 000 ₽':  o => (o.total||0) > 5000  && (o.total||0) <= 10000,
                '10 000 - 15 000 ₽': o => (o.total||0) > 10000 && (o.total||0) <= 15000,
                '15 000 - 20 000 ₽': o => (o.total||0) > 15000 && (o.total||0) <= 20000,
                '+ 20 000 ₽':        o => (o.total||0) > 20000
            };
            if (text === '⬅ Назад') {
                temp[chatId] = { inFilters: true };
                return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: FILTERS_KEYBOARD });
            }
            if (priceMap[text]) {
                const filtered = loadOrders().filter(priceMap[text]);
                if (!filtered.length) {
                    return bot.sendMessage(chatId, `📭 В диапазоне "${text}" заказов нет\n\nВыберите другой диапазон:`, { reply_markup: PRICE_KEYBOARD });
                }
                sendOrdersWithButtons(chatId, filtered);
                return bot.sendMessage(chatId, `✅ Найдено заказов: ${filtered.length}\n\nВыберите другой диапазон или вернитесь назад:`, { reply_markup: PRICE_KEYBOARD });
            }
            return;
        }

        // ===== ФИЛЬТР — ПО НИКНЕЙМУ =====
        if (state.filterNickname) {
            if (text === '⬅ Назад') {
                temp[chatId] = { inFilters: true };
                return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: FILTERS_KEYBOARD });
            }
            if (text === '🔁 Другой никнейм') {
                return bot.sendMessage(chatId, '👤 Введите юзернейм (@никнейм):', { reply_markup: { keyboard: [['⬅ Назад']], resize_keyboard: true }});
            }
            const nickname = text.replace('@','').toLowerCase().trim();
            const filtered = loadOrders().filter(o => o.nickname && o.nickname.trim().toLowerCase() === nickname);
            if (!filtered.length) {
                return bot.sendMessage(chatId, '❌ У пользователя с данным юзернеймом нет заказов', {
                    reply_markup: { keyboard: [['🔁 Другой никнейм'], ['⬅ Назад']], resize_keyboard: true }
                });
            }
            sendOrdersWithButtons(chatId, filtered);
            return bot.sendMessage(chatId, `✅ Найдено заказов: ${filtered.length}`, {
                reply_markup: { keyboard: [['🔁 Другой никнейм'], ['⬅ Назад']], resize_keyboard: true }
            });
        }

        // ===== ФИЛЬТР — ПО ТРЕКУ =====
        if (state.filterTrack) {
            if (text === '⬅ Назад') {
                temp[chatId] = { inFilters: true };
                return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: FILTERS_KEYBOARD });
            }
            if (text === '🔁 Другой номер трека') {
                return bot.sendMessage(chatId, '🔍 Введите номер трека (например: ABCD EFGH):', { reply_markup: { keyboard: [['⬅ Назад']], resize_keyboard: true }});
            }
            const track = text.trim().toUpperCase();
            const filtered = loadOrders().filter(o => o.track === track);
            if (!filtered.length) {
                return bot.sendMessage(chatId, '❌ С этим номером трека заказа нет', {
                    reply_markup: { keyboard: [['🔁 Другой номер трека'], ['⬅ Назад']], resize_keyboard: true }
                });
            }
            sendOrdersWithButtons(chatId, filtered);
            return bot.sendMessage(chatId, '✅ Заказ найден', {
                reply_markup: { keyboard: [['🔁 Другой номер трека'], ['⬅ Назад']], resize_keyboard: true }
            });
        }

        // ===== МЕНЮ ФИЛЬТРОВ =====
        if (state.inFilters) {
            if (text === '⬅ Назад') {
                temp[chatId] = {};
                return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: ORDERS_BASE_KEYBOARD });
            }
            if (text === 'По статусу заказа') {
                temp[chatId] = { filterStatus: true };
                return bot.sendMessage(chatId, 'Выберите статус заказа:', { reply_markup: STATUS_KEYBOARD });
            }
            if (text === 'По никнейму') {
                temp[chatId] = { filterNickname: true };
                return bot.sendMessage(chatId, '👤 Введите юзернейм (@никнейм):', { reply_markup: { keyboard: [['⬅ Назад']], resize_keyboard: true }});
            }
            if (text === 'По цене') {
                temp[chatId] = { filterPrice: true };
                return bot.sendMessage(chatId, 'Выберите диапазон цены:', { reply_markup: PRICE_KEYBOARD });
            }
            if (text === 'По трек номеру') {
                temp[chatId] = { filterTrack: true };
                return bot.sendMessage(chatId, '🔍 Введите номер трека (например: ABCD EFGH):', { reply_markup: { keyboard: [['⬅ Назад']], resize_keyboard: true }});
            }
            return;
        }

        if (text === '📊 Статистика') {
            const users = loadUsers(); const orders = loadOrders(); const promos = loadPromos();
            return bot.sendMessage(chatId,
`📊 Статистика\n\nПользователей всего: ${Object.keys(users).length}\nАктивные заказы: ${orders.filter(o=>o.status!=='Завершен').length}\nЗавершенные заказы: ${orders.filter(o=>o.status==='Завершен').length}\nРассылок: ${promos.reduce((s,p)=>s+(p.mailingCount||0),0)}\n\nАктивных промокодов: ${promos.filter(p=>!p.expired).length}\nИспользованных: ${promos.filter(p=>p.used>0).length}`);
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

<code>&lt;u&gt;Подчеркнутый&lt;/u&gt;</code>
→ <u>Подчеркнутый</u>

<code>&lt;s&gt;Зачеркнутый&lt;/s&gt;</code>
→ <s>Зачеркнутый</s>

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
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: PROMO_MAIN_KEYBOARD });
        }

        // ===== ПРОМОКОДЫ МЕНЮ =====
        if (text === '➕ Создать промокод') {
            temp[chatId] = { promoStep: 'enter_name' };
            return bot.sendMessage(chatId, 'Введите промокод:\nНапример: "СКИДКА20"\n\nТолько большие буквы и цифры', { reply_markup: { remove_keyboard: true }});
        }
        if (text === '🔎 Посмотреть промокод') {
            temp[chatId] = { promoCheck: true };
            return bot.sendMessage(chatId, '🔍 Введите промокод для проверки:', { reply_markup: { remove_keyboard: true }});
        }
        if (text === '📋 Все промокоды') {
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: PROMO_LIST_KEYBOARD });
        }
        if (text === '⬅ Назад к промокодам') {
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: PROMO_MAIN_KEYBOARD });
        }
        if (text === '📋 Показать все') {
            const promos = loadPromos();
            if (!promos.length) return bot.sendMessage(chatId, 'Промокодов нет.', { reply_markup: PROMO_LIST_KEYBOARD });
            for (const promo of promos) {
                bot.sendMessage(chatId, promoShortText(promo), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `promo_detail_${promo.code}` }]] }});
            }
            return;
        }
        if (text === '🟢 Активные промокоды') {
            const promos = loadPromos().filter(p => !p.expired);
            if (!promos.length) return bot.sendMessage(chatId, 'Активных промокодов нет.', { reply_markup: PROMO_LIST_KEYBOARD });
            for (const promo of promos) {
                bot.sendMessage(chatId, promoShortText(promo), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `promo_detail_${promo.code}` }]] }});
            }
            return;
        }
        if (text === '🔴 Завершённые промокоды') {
            const promos = loadPromos().filter(p => p.expired);
            if (!promos.length) return bot.sendMessage(chatId, 'Завершённых промокодов нет.', { reply_markup: PROMO_LIST_KEYBOARD });
            for (const promo of promos) {
                bot.sendMessage(chatId, promoShortText(promo), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `promo_detail_${promo.code}` }]] }});
            }
            return;
        }

        if (text === '🖋️ Зарегистрировать заказ') {
            temp[chatId] = { step: 'nickname', items: [] };
            return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример:\n@client_username',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Прекратить регистрацию', callback_data: 'cancel_registration' }]] }});
        }

        if (text === '📄 База заказов') {
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: ORDERS_BASE_KEYBOARD });
        }

        if (text === 'Все заказы') { temp[chatId] = {}; return sendOrdersWithButtons(chatId, loadOrders()); }

        if (text === 'Фильтры') {
            temp[chatId] = { inFilters: true };
            return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: FILTERS_KEYBOARD });
        }

        // Order registration steps
        if (state.step === 'nickname') {
            temp[chatId].nickname = text.replace('@', '');
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, 'Товары', { reply_markup: { inline_keyboard: [
                [{ text: '➕ Добавить товар', callback_data: 'add_product' }],
                [{ text: '⬅ Шаг назад',       callback_data: 'step_back_to_nickname' }]
            ]}});
        }
        if (state.step === 'item_article') {
            temp[chatId].currentItem.article = text;
            temp[chatId].step = 'item_type';
            return bot.sendMessage(chatId, 'Тип товара (Обувь / Одежда / Другое):', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_article' }]] }});
        }
        if (state.step === 'item_type') {
            temp[chatId].currentItem.type = text;
            temp[chatId].step = 'item_size';
            return bot.sendMessage(chatId, 'Размер:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_type' }]] }});
        }
        if (state.step === 'item_size') {
            temp[chatId].currentItem.size = text;
            temp[chatId].step = 'item_price';
            return bot.sendMessage(chatId, 'Стоимость (в рублях):', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_size' }]] }});
        }
        if (state.step === 'item_price') {
            const price = Number(text);
            if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Введите корректную стоимость числом');
            temp[chatId].currentItem.price = price;
            temp[chatId].items.push(temp[chatId].currentItem);
            temp[chatId].currentItem = null;
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, '✅ Товар добавлен', { reply_markup: { inline_keyboard: [
                [{ text: '➕ Добавить товар',          callback_data: 'add_product' }],
                [{ text: '✏ Изменить последний товар',  callback_data: 'edit_last_item' }],
                [{ text: '➡ Продолжить регистрацию',  callback_data: 'continue_registration' }],
                [{ text: '⬅ Шаг назад',               callback_data: 'step_back_to_nickname' }]
            ]}});
        }
        if (state.step === 'enter_address') {
            temp[chatId].address = text;
            return finishOrder(chatId);
        }

        // Promo steps
        if (state.promoStep === 'enter_name') {
            const code = text.trim().toUpperCase();
            if (!/^[A-ZА-ЯЁ0-9]+$/u.test(code)) return bot.sendMessage(chatId, '❌ Только большие буквы и цифры');
            temp[chatId].code = code; temp[chatId].promoStep = 'enter_limit';
            return bot.sendMessage(chatId, 'Количество применений:', { reply_markup: { inline_keyboard: [[{ text: '♾ Бесконечно', callback_data: 'promo_unlimited' }]] }});
        }
        if (state.promoStep === 'enter_limit') {
            const limit = Number(text);
            if (isNaN(limit) || limit <= 0) return bot.sendMessage(chatId, '❌ Введите корректное число');
            temp[chatId].limit = limit; temp[chatId].promoStep = 'enter_min_sum';
            return bot.sendMessage(chatId, 'От какой суммы действует скидка:', { reply_markup: { inline_keyboard: [[{ text: 'Безлимит', callback_data: 'promo_min_sum_unlimited' }]] }});
        }
        if (state.promoStep === 'enter_min_sum') {
            const minSum = Number(text.replace('₽','').trim());
            if (isNaN(minSum) || minSum < 0) return bot.sendMessage(chatId, '❌ Введите корректную сумму');
            temp[chatId].minSum = minSum; temp[chatId].promoStep = 'choose_discount_format';
            return bot.sendMessage(chatId, 'Выберите формат скидки:', { reply_markup: { inline_keyboard: [
                [{ text: 'В %', callback_data: 'promo_discount_percent' }],
                [{ text: 'В ₽', callback_data: 'promo_discount_rub' }]
            ]}});
        }
        if (state.promoStep === 'enter_discount_percent') {
            const num = Number(text.trim().replace('%',''));
            if (isNaN(num) || num <= 0 || num > 100) return bot.sendMessage(chatId, '❌ Введите корректный процент (например: 20)');
            temp[chatId].discountValue = num; temp[chatId].promoStep = 'enter_max_discount';
            return bot.sendMessage(chatId, 'Максимальная сумма скидки (например: 2000₽):', { reply_markup: { inline_keyboard: [[{ text: 'Безлимит', callback_data: 'promo_max_unlimited' }]] }});
        }
        if (state.promoStep === 'enter_discount_rub') {
            const num = Number(text.trim().replace('₽',''));
            if (isNaN(num) || num <= 0) return bot.sendMessage(chatId, '❌ Введите корректную сумму (например: 2000)');
            temp[chatId].discountValue = num; temp[chatId].promoStep = 'choose_category';
            return sendPromoCategory(chatId);
        }
        if (state.promoStep === 'enter_max_discount') {
            const num = Number(text.trim().replace('₽',''));
            if (isNaN(num) || num <= 0) return bot.sendMessage(chatId, '❌ Введите корректную сумму');
            temp[chatId].maxDiscount = num; temp[chatId].promoStep = 'choose_category';
            return sendPromoCategory(chatId);
        }
        if (state.promoStep === 'enter_date') {
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text.trim())) {
                return bot.sendMessage(chatId, '❌ Формат: "20.02.2027"', { reply_markup: { inline_keyboard: [[{ text: 'Бессрочно', callback_data: 'promo_no_date' }]] }});
            }
            temp[chatId].expires = text.trim(); temp[chatId].promoStep = 'enter_comment';
            return bot.sendMessage(chatId, 'Комментарий к промокоду:', { reply_markup: { inline_keyboard: [[{ text: 'Без комментария', callback_data: 'promo_no_comment' }]] }});
        }
        if (state.promoStep === 'enter_comment') { temp[chatId].comment = text; return saveAndSendPromo(chatId); }
        if (state.promoStep === 'custom_category') {
            temp[chatId].category = text; temp[chatId].promoStep = 'enter_date';
            return bot.sendMessage(chatId, 'До какого числа действует промокод?\nФормат: "20.02.2027"',
                { reply_markup: { inline_keyboard: [[{ text: 'Бессрочно', callback_data: 'promo_no_date' }]] }});
        }
        if (state.promoCheck) {
            const promo = loadPromos().find(p => p.code === text.trim().toUpperCase());
            temp[chatId] = {};
            if (!promo) return bot.sendMessage(chatId, '❌ Промокод не найден', { reply_markup: PROMO_MAIN_KEYBOARD });
            return bot.sendMessage(chatId, promoFullText(promo), { parse_mode: 'HTML', reply_markup: PROMO_MAIN_KEYBOARD });
        }

        // Mailing
        if (state.mailingStep === 'write_text') {
            temp[chatId].text = text; temp[chatId].mailingStep = 'wait_image';
            return bot.sendMessage(chatId, '🖼 Отправьте изображение для рассылки:', { reply_markup: { inline_keyboard: [
                [{ text: 'Без изображения',  callback_data: 'mail_no_image' }],
                [{ text: 'Переписать текст', callback_data: 'mail_rewrite_text' }]
            ]}});
        }
        if (state.mailingStep === 'wait_image' && msg.photo) {
            temp[chatId].photo = msg.photo[msg.photo.length-1].file_id;
            temp[chatId].mailingStep = 'choose_audience';
            return sendAudienceMenu(chatId);
        }

        if (state.changingStatus) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: ORDERS_BASE_KEYBOARD }); }
            const orders = loadOrders();
            const order = orders.find(o => o.id === state.selectedOrder);
            if (!order) return;
            const newStatus = text;
            order.status = newStatus; saveOrders(orders); temp[chatId] = {};
            bot.sendMessage(chatId, '✅ Статус обновлен', { reply_markup: ORDERS_BASE_KEYBOARD });
            if (order.userId) {
                if (newStatus === 'Завершен') {
                    bot.sendMessage(order.userId,
`<b>${order.track} Завершен ✅\nСпасибо за доверие к нашей компании, мы ждем вас снова!</b>`,
                        { parse_mode: 'HTML' }).catch(()=>{});
                } else {
                    bot.sendMessage(order.userId, `🚚 Ваш заказ обновлён!\n\nСтатус: <b>${newStatus}</b>`, { parse_mode: 'HTML' }).catch(()=>{});
                }
            }
            return;
        }

        if (state.editingField) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: ORDERS_BASE_KEYBOARD }); }
            temp[chatId].field = text; temp[chatId].editingField = false; temp[chatId].waitingNewValue = true;
            const prompts = { 'Никнейм':'Введите новый никнейм:', 'Тип':'Введите новый тип:', 'Цена':'Введите новую цену:', 'Модель/артикул/ссылку':'Введите новую модель / артикул / ссылку:' };
            return bot.sendMessage(chatId, prompts[text] || 'Введите новое значение:');
        }

        if (state.waitingNewValue) {
            const orders = loadOrders();
            const order = orders.find(o => o.id === state.selectedOrder);
            if (!order) return;
            if (state.field === 'Никнейм') order.nickname = text.replace('@','');
            if (state.field === 'Тип') order.items[0].type = text;
            if (state.field === 'Цена') { order.items[0].price = Number(text); order.total = order.items.reduce((s,i)=>s+Number(i.price),0); }
            if (state.field === 'Модель/артикул/ссылку') order.items[0].article = text;
            saveOrders(orders); temp[chatId] = {};
            return bot.sendMessage(chatId,
`✅ Данные обновлены\n\n@${order.nickname}\nТип: ${order.items[0].type||'не указан'}\nСумма: ${order.total} ₽\nАртикул: ${order.items[0].article||'нет'}\nСтатус: ${order.status}\nТрек: <code>${order.track}</code>`,
                { parse_mode: 'HTML', reply_markup: ORDERS_BASE_KEYBOARD });
        }

        return; // end admin
    }

    // ===== CLIENT =====
    if (text === 'Главное меню') return mainMenu(chatId);
    if (text === '🛍 Сделать заказ') return bot.sendMessage(chatId,
`🛍 Сделать заказ\n\nЗаказ вам поможет оформить наш менеджер!\n\nОн оформит вам заказ, предложит удобные варианты доставки и оплаты, расскажет как отследить покупку до её прибытия к вам.\n\nОтправьте ему ссылку / скриншот / модель товара, размер и стоимость.`,
        { reply_markup: { inline_keyboard: [[{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }]] }});

    if (text === '💰 Рассчитать стоимость товара') {
        temp[chatId] = { calcStep: 'chooseType' };
        return bot.sendMessage(chatId, '💰 Выберите тип товара:', { reply_markup: { keyboard: [
            ['Одежда'],['Обувь'],['Часы/украшения'],['Техника'],['Другое'],['⬅️ Назад']
        ], resize_keyboard: true }});
    }
    if (text === '⬅️ Назад') { temp[chatId] = {}; return mainMenu(chatId); }
    if (text === '💴 Текущий курс юаня') return bot.sendMessage(chatId, '💴 Текущий курс равен *12.5₽ = 1¥*\n\n_Расчет цены делается исходя из цены товара умноженной на курс юаня_', { parse_mode: 'Markdown' });
    if (text === '🛠 Поддержка') return bot.sendMessage(chatId, '🛠 Поддержка\n\nОтправьте менеджеру номер заказа и опишите вашу проблему.', { reply_markup: { inline_keyboard: [[{ text: 'Решить проблему', url: 'https://t.me/adrlogisticsmanager' }]] }});
    if (text === '📦 Мои заказы') return bot.sendMessage(chatId, 'Какие заказы хотите посмотреть?', { reply_markup: { keyboard: [['📦 Активные'],['✅ Завершенные'],['⬅️ Назад']], resize_keyboard: true }});

    if (text === '📦 Активные') {
        const orders = loadOrders().filter(o => String(o.userId)===String(chatId) && normalizeStatus(o.status)!=='завершен');
        if (!orders.length) return bot.sendMessage(chatId, 'У вас нет активных заказов.');
        orders.forEach(order => bot.sendMessage(chatId,
            `📦 Заказ <code>${order.track}</code>  @${order.nickname}\n\n💰 Сумма: ${order.total||0} ₽\n📌 Статус: ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]] }}));
        return;
    }
    if (text === '✅ Завершенные') {
        const orders = loadOrders().filter(o => String(o.userId)===String(chatId) && normalizeStatus(o.status)==='завершен');
        if (!orders.length) return bot.sendMessage(chatId, 'У вас нет завершенных заказов.');
        orders.forEach(order => bot.sendMessage(chatId,
            `📦 Заказ <code>${order.track}</code>  @${order.nickname}\n\n💰 Сумма: ${order.total||0} ₽\n📌 Статус: ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]] }}));
        return;
    }

    if (state.calcStep === 'chooseType') {
        if (['Часы/украшения','Техника','Другое'].includes(text)) {
            temp[chatId] = {};
            bot.sendMessage(chatId, 'Эта категория обсуждается лично с менеджером!', { reply_markup: { inline_keyboard: [[{ text: 'Связаться с менеджером', url: 'https://t.me/adrlogisticsmanager' }]] }});
            return mainMenu(chatId);
        }
        if (text === 'Одежда' || text === 'Обувь') {
            temp[chatId] = { calcStep: 'waitPrice', type: text === 'Одежда' ? 'clothes' : 'shoes' };
            return bot.sendMessage(chatId, 'Напишите стоимость товара в юанях:', { reply_markup: { remove_keyboard: true } });
        }
        return;
    }
    if (state.calcStep === 'waitPrice') {
        const price = Number(text);
        if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Введите корректную сумму в юанях');
        const total = state.type === 'clothes' ? price*12+500+1000 : price*12+1500+1000;
        temp[chatId] = {};
        return bot.sendMessage(chatId,
`🚚 Расчет стоимости:\n\n*${total} ₽* (Доставка до Сочи)\n\nЭто цена с доставкой до Сочи. Дополнительная доставка СДЕК / Почта России — за счёт клиента.\n\nДоставка по Адлерскому району — бесплатно.\nСамовывоз по предварительной записи!`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                [{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }],
                [{ text: '⬅️ Назад', callback_data: 'back_main' }]
            ]}});
    }

    const faqKeyboard = { keyboard: [
        ['🚚 Доставка'],['↩️ Возврат'],
        ['📦 Как отследить заказ?'],['✅ Оригинал или нет?'],
        ['🕒 Время работы Менеджеров'],['⬅️ Назад']
    ], resize_keyboard: true };

    if (text === '📌 FAQ') return bot.sendMessage(chatId, '📌 FAQ\n\nВыберите интересующий раздел.', { reply_markup: faqKeyboard });
    if (text === 'Назад в FAQ') return bot.sendMessage(chatId, '📌 FAQ\n\nВыберите интересующий раздел.', { reply_markup: faqKeyboard });

    const faqAnswers = {
        '🚚 Доставка': '🚚 Доставка\n\nВсе товары попадают на склад в Адлере.\n\nСпособы получения:\n- Отправка СДЕК / ПОЧТА РОССИИ _(доставку оплачивает клиент)_\n- Бесплатная доставка по Адлерскому району\n- Самовывоз со склада _(будни с 12:00 до 19:00)_',
        '↩️ Возврат': '↩️ Возврат\n\n*Возврат не осуществляется!*\n\nТовар проходит тщательную проверку на нашем складе в Китае. Если товар бракованный — мы его заменим.',
        '📦 Как отследить заказ?': '📦 Как отследить заказ?\n\n*Отслеживайте в разделе "Мои заказы".*\n\nОб изменении статуса бот уведомит вас автоматически.',
        '✅ Оригинал или нет?': '✅ Оригинал или нет?\n\n*Товар исключительно оригинальный.*\n\nМы проводим тщательную проверку на подлинность на складе в Китае.',
        '🕒 Время работы Менеджеров': '🕒 Время работы\n\nМенеджеры работают без выходных:\n*с 10:00 до 22:00*'
    };

    const faqBackKeyboard = { keyboard: [['Назад в FAQ'],['Главное меню']], resize_keyboard: true };
    if (faqAnswers[text]) return bot.sendMessage(chatId, faqAnswers[text], { parse_mode: 'Markdown', reply_markup: faqBackKeyboard });
});

// ===== CALLBACK QUERIES =====
bot.on('callback_query', async query => {
    const chatId = query.message.chat.id;
    const data   = query.data;
    const state  = temp[chatId] || {};
    bot.answerCallbackQuery(query.id).catch(()=>{});

    if (data === 'back_main' || data === 'admin_back_main') { temp[chatId] = {}; return ADMIN_IDS.includes(chatId) ? adminMenu(chatId) : mainMenu(chatId); }
    if (data === 'all_orders') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: ORDERS_BASE_KEYBOARD }); }

    if (data === 'cancel_registration') { temp[chatId] = {}; return bot.sendMessage(chatId, '❌ Регистрация отменена', { reply_markup: ORDERS_BASE_KEYBOARD }); }

    if (data === 'add_product') {
        temp[chatId].currentItem = {};
        temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, 'Артикул / ссылка на товар:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_to_products' }]] }});
    }
    if (data === 'edit_last_item') {
        if (!temp[chatId].items || !temp[chatId].items.length) return bot.sendMessage(chatId, '❌ Нет товаров для редактирования');
        temp[chatId].currentItem = temp[chatId].items.pop(); temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, `Артикул / ссылка (сейчас: ${temp[chatId].currentItem.article}):`, { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_to_products' }]] }});
    }

    if (data === 'step_back_to_nickname') {
        temp[chatId].step = 'nickname'; temp[chatId].items = [];
        return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример:\n@client_username',
            { reply_markup: { inline_keyboard: [[{ text: '❌ Прекратить регистрацию', callback_data: 'cancel_registration' }]] }});
    }
    if (data === 'step_back_to_products') {
        temp[chatId].currentItem = null; temp[chatId].step = 'products_menu';
        return bot.sendMessage(chatId, 'Товары', { reply_markup: { inline_keyboard: [
            [{ text: '➕ Добавить товар', callback_data: 'add_product' }],
            [{ text: '⬅ Шаг назад',       callback_data: 'step_back_to_nickname' }]
        ]}});
    }
    if (data === 'step_back_article') {
        temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, 'Артикул / ссылка на товар:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_to_products' }]] }});
    }
    if (data === 'step_back_type') {
        temp[chatId].step = 'item_type';
        return bot.sendMessage(chatId, 'Тип товара (Обувь / Одежда / Другое):', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_article' }]] }});
    }
    if (data === 'step_back_size') {
        temp[chatId].step = 'item_size';
        return bot.sendMessage(chatId, 'Размер:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'step_back_type' }]] }});
    }

    if (data === 'continue_registration') {
        temp[chatId].step = 'choose_delivery';
        return bot.sendMessage(chatId, 'Способ доставки до получателя:', { reply_markup: { inline_keyboard: [
            [{ text: 'Доставка до двери в пределах Адлера', callback_data: 'delivery_adler' }],
            [{ text: 'Самовывоз из офиса',                  callback_data: 'delivery_pickup' }],
            [{ text: 'Доставка СДЕК/Почта России',          callback_data: 'delivery_post' }],
            [{ text: '⬅ Шаг назад',                         callback_data: 'step_back_to_products' }]
        ]}});
    }
    if (data === 'delivery_adler')  { temp[chatId].delivery = 'Адлер';      temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📍 Адрес получателя:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'continue_registration' }]] }}); }
    if (data === 'delivery_post')   { temp[chatId].delivery = 'Почта/СДЕК'; temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📬 Индекс / адрес доставки:', { reply_markup: { inline_keyboard: [[{ text: '⬅ Шаг назад', callback_data: 'continue_registration' }]] }}); }
    if (data === 'delivery_pickup') { temp[chatId].delivery = 'Самовывоз'; return finishOrder(chatId); }

    if (data.startsWith('details_')) {
        const id = Number(data.slice(8));
        const order = loadOrders().find(o => o.id === id);
        if (!order) return;
        let itemsText = '';
        order.items.forEach((item,i) => { itemsText += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'не указан'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`; });
        return bot.sendMessage(chatId,
`📦 <b>Заказ <code>${order.track}</code></b>\n@${order.nickname}\n\n🛍 <b>Товаров:</b> ${order.items.length}\n\n${itemsText}\n🚚 <b>Доставка:</b> ${order.delivery}\n📍 <b>Адрес:</b> ${order.address||'Самовывоз'}\n\n💰 <b>Итого:</b> ${order.total} ₽\n📦 <b>Статус:</b> ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                [{ text: 'Изменить статус', callback_data: `status_${order.id}` }],
                [{ text: 'Изменить данные', callback_data: `edit_${order.id}` }],
                [{ text: '⬅ Назад',          callback_data: 'all_orders' }]
            ]}});
    }

    if (data.startsWith('client_details_')) {
        const id = Number(data.slice(15));
        const order = loadOrders().find(o => o.id === id);
        if (!order || String(order.userId) !== String(chatId)) return;
        let itemsText = '';
        order.items.forEach((item,i) => { itemsText += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'не указан'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`; });
        return bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>\n@${order.nickname}\n\n${itemsText}\n🚚 Доставка: ${order.delivery}\n📍 Адрес: ${order.address||'Самовывоз'}\n\n💰 Итого: ${order.total} ₽\n📦 Статус: ${order.status}`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅ Назад к заказам', callback_data: 'back_client_orders' }]] }});
    }

    if (data === 'back_client_orders') return sendClientOrders(chatId);

    if (data.startsWith('status_')) {
        const id = Number(data.slice(7));
        const order = loadOrders().find(o => o.id === id);
        if (!order) return;
        temp[chatId] = { selectedOrder: id, changingStatus: true };
        const allStatuses = ['В обработке','Отправлен на склад в Китае','Отправлен на склад в Сочи','Готов к получению','Завершен'];
        return bot.sendMessage(chatId, 'Выберите новый статус:', { reply_markup: { keyboard: [
            ...allStatuses.filter(s => s !== order.status).map(s => [s]),
            ['Назад']
        ], resize_keyboard: true }});
    }

    if (data.startsWith('edit_')) {
        const id = Number(data.slice(5));
        if (!loadOrders().find(o => o.id === id)) return;
        temp[chatId] = { selectedOrder: id, editingField: true };
        return bot.sendMessage(chatId, 'Какие данные изменить?', { reply_markup: { keyboard: [
            ['Никнейм'],['Тип'],['Цена'],['Модель/артикул/ссылку'],['Назад']
        ], resize_keyboard: true }});
    }

    // ===== PROMO CALLBACKS =====
    if (data === 'promo_unlimited') {
        temp[chatId].limit = null; temp[chatId].promoStep = 'enter_min_sum';
        return bot.sendMessage(chatId, 'От какой суммы действует скидка:', { reply_markup: { inline_keyboard: [[{ text: 'Безлимит', callback_data: 'promo_min_sum_unlimited' }]] }});
    }
    if (data === 'promo_min_sum_unlimited') {
        temp[chatId].minSum = null; temp[chatId].promoStep = 'choose_discount_format';
        return bot.sendMessage(chatId, 'Выберите формат скидки:', { reply_markup: { inline_keyboard: [
            [{ text: 'В %', callback_data: 'promo_discount_percent' }],
            [{ text: 'В ₽', callback_data: 'promo_discount_rub' }]
        ]}});
    }
    if (data === 'promo_discount_percent') {
        temp[chatId].discountType = 'percent'; temp[chatId].promoStep = 'enter_discount_percent';
        return bot.sendMessage(chatId, 'Выберите размер скидки:\nПример: 20%\n(Можно написать без знака %)');
    }
    if (data === 'promo_discount_rub') {
        temp[chatId].discountType = 'rub'; temp[chatId].promoStep = 'enter_discount_rub';
        return bot.sendMessage(chatId, 'Выберите размер скидки:\nПример: 2000₽\n(Можно написать без знака ₽)');
    }
    if (data === 'promo_max_unlimited') {
        temp[chatId].maxDiscount = null; temp[chatId].promoStep = 'choose_category';
        return sendPromoCategory(chatId);
    }
    if (data === 'promo_no_date') {
        temp[chatId].expires = null; temp[chatId].promoStep = 'enter_comment';
        return bot.sendMessage(chatId, 'Комментарий к промокоду:', { reply_markup: { inline_keyboard: [[{ text: 'Без комментария', callback_data: 'promo_no_comment' }]] }});
    }
    if (data === 'promo_no_comment') { temp[chatId].comment = null; return saveAndSendPromo(chatId); }
    if (data.startsWith('promo_cat_')) {
        if (data === 'promo_cat_custom') { temp[chatId].promoStep = 'custom_category'; return bot.sendMessage(chatId, 'Введите свой вариант категории:'); }
        temp[chatId].category = data.replace('promo_cat_',''); temp[chatId].promoStep = 'enter_date';
        return bot.sendMessage(chatId, 'До какого числа действует промокод?\nФормат: "20.02.2027"', { reply_markup: { inline_keyboard: [[{ text: 'Бессрочно', callback_data: 'promo_no_date' }]] }});
    }
    if (data.startsWith('promo_detail_')) {
        const code = data.replace('promo_detail_', '');
        const promo = loadPromos().find(p => p.code === code);
        if (!promo) return bot.sendMessage(chatId, '❌ Промокод не найден');
        return bot.sendMessage(chatId, promoFullText(promo), { parse_mode: 'HTML', reply_markup: PROMO_LIST_KEYBOARD });
    }

    // ===== MAILING =====
    if (data === 'mail_cancel')        { temp[chatId] = {}; return adminMenu(chatId); }
    if (data === 'mail_rewrite_text')  { temp[chatId].mailingStep = 'write_text'; return bot.sendMessage(chatId, '✍️ Напишите новый текст рассылки:'); }
    if (data === 'mail_back_to_image') { temp[chatId].photo = null; temp[chatId].mailingStep = 'wait_image'; return bot.sendMessage(chatId, '🖼 Отправьте новое изображение:', { reply_markup: { inline_keyboard: [[{ text: 'Без изображения', callback_data: 'mail_no_image' }]] }}); }
    if (data === 'mail_change_audience') { temp[chatId].mailingStep = 'choose_audience'; return sendAudienceMenu(chatId); }
    if (data === 'mail_no_image')      { temp[chatId].photo = null; temp[chatId].mailingStep = 'choose_audience'; return sendAudienceMenu(chatId); }

    const audienceOptions = ['mail_all','mail_waiting','mail_new','mail_completed','mail_inactive'];
    if (audienceOptions.includes(data) && state.mailingStep === 'choose_audience') {
        temp[chatId].audience = data; temp[chatId].mailingStep = 'confirm';
        if (state.photo) await bot.sendPhoto(chatId, state.photo, { caption: state.text, parse_mode: 'HTML' });
        else await bot.sendMessage(chatId, state.text, { parse_mode: 'HTML' });
        return bot.sendMessage(chatId, '📨 Так сообщение увидит клиент. Отправить?', { reply_markup: { inline_keyboard: [
            [{ text: '✅ Отправить',         callback_data: 'mail_send' }],
            [{ text: 'Изменить изображение', callback_data: 'mail_back_to_image' }],
            [{ text: 'Изменить текст',       callback_data: 'mail_rewrite_text' }],
            [{ text: 'Изменить получателей', callback_data: 'mail_change_audience' }],
            [{ text: 'Отменить рассылку',    callback_data: 'mail_cancel' }]
        ]}});
    }

    if (data === 'mail_send') {
        const orders = loadOrders(); const users = loadUsers(); const now = Date.now();
        const allUserIds = Object.values(users);
        let recipients = [];
        switch (state.audience) {
            case 'mail_all':       recipients = allUserIds; break;
            case 'mail_waiting':   recipients = [...new Set(orders.filter(o=>o.status!=='Завершен').map(o=>o.userId))]; break;
            case 'mail_completed': recipients = [...new Set(orders.filter(o=>o.status==='Завершен').map(o=>o.userId))]; break;
            case 'mail_new':       recipients = allUserIds.filter(id=>!orders.some(o=>String(o.userId)===String(id))); break;
            case 'mail_inactive':  recipients = allUserIds.filter(id=>{ const uo=orders.filter(o=>String(o.userId)===String(id)); if(!uo.length) return false; return (now-Math.max(...uo.map(o=>o.createdAt)))>60*24*60*60*1000; }); break;
        }
        recipients = [...new Set(recipients)].filter(Boolean);
        let success=0, failed=0;
        for (const id of recipients) {
            try {
                if (state.photo) await bot.sendPhoto(id, state.photo, { caption: state.text, parse_mode: 'HTML' });
                else await bot.sendMessage(id, state.text, { parse_mode: 'HTML' });
                success++;
                await new Promise(r=>setTimeout(r,50));
            } catch { failed++; }
        }
        temp[chatId] = {};
        return bot.sendMessage(chatId, `📊 Рассылка завершена\n\n👥 Получателей: ${recipients.length}\n✅ Успешно: ${success}\n❌ Ошибки: ${failed}`);
    }
});

console.log('✅ Бот запущен');