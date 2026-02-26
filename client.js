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

function saveAndSendPromo(chatId) {
    const promos = loadPromos();
    promos.push({ code: temp[chatId].code, limit: temp[chatId].limit, used: 0,
        category: temp[chatId].category, expires: temp[chatId].expires || null,
        comment: temp[chatId].comment || null, createdAt: Date.now() });
    savePromos(promos);
    const code = temp[chatId].code;
    temp[chatId] = {};
    return bot.sendMessage(chatId, '✅ Промокод создан\n\n<code>' + code + '</code>', { parse_mode: 'HTML' });
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
    const newOrder = { id: Date.now(), userId: clientId, nickname: data.nickname, items: data.items,
        delivery: data.delivery, address: data.address || null, status: 'В обработке', track, total, createdAt: Date.now() };
    orders.push(newOrder);
    saveOrders(orders);

    let itemsText = '';
    newOrder.items.forEach((item, i) => {
        itemsText += `<blockquote>\n${i+1}. Артикул/ссылка: ${item.article}\nТип: ${item.type||'не указан'}\nРазмер: ${item.size}\nСтоимость: ${item.price} ₽\n</blockquote>\n`;
    });

    bot.sendMessage(chatId,
`📦 <b>Заказ <code>${newOrder.track}</code></b>\n@${newOrder.nickname}\n\n🛍 <b>Товаров:</b> ${newOrder.items.length}\n\n${itemsText}\n🚚 <b>Доставка:</b> ${newOrder.delivery}\n📍 <b>Адрес:</b> ${newOrder.address||'Самовывоз'}\n\n💰 <b>Итого:</b> ${newOrder.total} ₽\n📦 <b>Статус:</b> ${newOrder.status}`,
        { parse_mode: 'HTML' });

    bot.sendMessage(clientId,
`✅ <b>Заказ зарегистрирован!</b>\n\n🛍 Товаров: <b>${newOrder.items.length}</b>\n💰 Сумма: <b>${newOrder.total} ₽</b>\n📦 Статус: <b>${newOrder.status}</b>\n🚚 Трек: <code>${newOrder.track}</code>`,
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
        if (text === 'Главное меню') return adminMenu(chatId);
        if (text === 'Поддержка') return bot.sendMessage(chatId, '📞 Поддержка: @Savelisb');

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
            return bot.sendMessage(chatId, '🎁 Раздел промокодов', { reply_markup: { inline_keyboard: [
                [{ text: '➕ Создать промокод', callback_data: 'create_promo' }],
                [{ text: '🔎 Проверить промокод', callback_data: 'check_promo' }],
                [{ text: '⬅ Главное меню', callback_data: 'admin_back_main' }]
            ]}});
        }

        if (text === '🖋️ Зарегистрировать заказ') {
            temp[chatId] = { step: 'nickname', items: [] };
            return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример:\n@client_username',
                { reply_markup: { inline_keyboard: [[{ text: '❌ Прекратить регистрацию', callback_data: 'cancel_registration' }]] }});
        }

        if (text === '📄 База заказов') {
            return bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: { keyboard: [
                ['Все заказы'], ['Фильтры'], ['Главное меню']
            ], resize_keyboard: true }});
        }

        if (text === 'Все заказы') { temp[chatId] = {}; return sendOrdersWithButtons(chatId, loadOrders()); }

        if (text === 'Фильтры') {
            return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: { inline_keyboard: [
                [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
                [{ text: 'По никнейму',        callback_data: 'filter_nickname' }],
                [{ text: 'По цене',            callback_data: 'filter_price' }],
                [{ text: 'По трек номеру',     callback_data: 'filter_track' }],
                [{ text: '⬅ Назад',            callback_data: 'back_to_orders' }]
            ]}});
        }

        // Order registration steps
        if (state.step === 'nickname') {
            temp[chatId].nickname = text.replace('@', '');
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, 'Товары', { reply_markup: { inline_keyboard: [[{ text: '➕ Добавить товар', callback_data: 'add_product' }]] }});
        }
        if (state.step === 'item_article') { temp[chatId].currentItem.article = text; temp[chatId].step = 'item_type'; return bot.sendMessage(chatId, 'Тип товара (Обувь / Одежда / Другое):'); }
        if (state.step === 'item_type')    { temp[chatId].currentItem.type = text;    temp[chatId].step = 'item_size';  return bot.sendMessage(chatId, 'Размер:'); }
        if (state.step === 'item_size')    { temp[chatId].currentItem.size = text;    temp[chatId].step = 'item_price'; return bot.sendMessage(chatId, 'Стоимость (в рублях):'); }
        if (state.step === 'item_price') {
            const price = Number(text);
            if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Введите корректную стоимость числом');
            temp[chatId].currentItem.price = price;
            temp[chatId].items.push(temp[chatId].currentItem);
            temp[chatId].currentItem = null;
            temp[chatId].step = 'products_menu';
            return bot.sendMessage(chatId, '✅ Товар добавлен', { reply_markup: { inline_keyboard: [
                [{ text: '➕ Добавить товар',         callback_data: 'add_product' }],
                [{ text: '✏ Изменить последний товар', callback_data: 'edit_last_item' }],
                [{ text: '➡ Продолжить регистрацию', callback_data: 'continue_registration' }]
            ]}});
        }
        if (state.step === 'enter_address') { temp[chatId].address = text; return finishOrder(chatId); }

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
            temp[chatId].limit = limit; temp[chatId].promoStep = 'choose_category';
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
            if (!promo) return bot.sendMessage(chatId, '❌ Промокод не найден', { reply_markup: { inline_keyboard: [
                [{ text: 'Проверить другой', callback_data: 'check_promo' }],
                [{ text: 'Главное меню',     callback_data: 'admin_back_main' }]
            ]}});
            const remaining = promo.limit === null ? '∞' : promo.limit - promo.used;
            return bot.sendMessage(chatId,
`🎁 Промокод <code>${promo.code}</code>\n\nПрименений: ${promo.limit||'∞'}\nОсталось: ${remaining}\nДействует на: ${promo.category}\nСрок до: ${promo.expires||'Бессрочно'}\nКомментарий: "${promo.comment||'Нет'}"`,
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                    [{ text: 'Проверить другой', callback_data: 'check_promo' }],
                    [{ text: 'Главное меню',     callback_data: 'admin_back_main' }]
                ]}});
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

        // Filters (filterStatus and filterPrice now handled via inline callbacks - fs_* and fp_*)

        if (state.filterNickname) {
            const nickname = text.replace('@','').toLowerCase().trim();
            const filtered = loadOrders().filter(o => o.nickname && o.nickname.trim().toLowerCase() === nickname);
            temp[chatId] = {};
            if (!filtered.length) return bot.sendMessage(chatId, '❌ Заказы с таким никнеймом не найдены', { reply_markup: { inline_keyboard: [
                [{ text: '🔁 Другой никнейм', callback_data: 'filter_nickname' }],
                [{ text: '⬅ Назад',           callback_data: 'back_to_filters' }]
            ]}});
            sendOrdersWithButtons(chatId, filtered);
            return bot.sendMessage(chatId, 'Действия:', { reply_markup: { inline_keyboard: [
                [{ text: '🔁 Другой никнейм', callback_data: 'filter_nickname' }],
                [{ text: '⬅ Назад',           callback_data: 'back_to_filters' }]
            ]}});
        }

        if (state.filterTrack) {
            const track = text.trim().toUpperCase();
            const filtered = loadOrders().filter(o => o.track === track);
            temp[chatId] = {};
            if (!filtered.length) return bot.sendMessage(chatId, '❌ Заказ с таким трек-номером не найден', { reply_markup: { inline_keyboard: [
                [{ text: '🔁 Другой трек', callback_data: 'filter_track' }],
                [{ text: '⬅ Назад',        callback_data: 'back_to_filters' }]
            ]}});
            sendOrdersWithButtons(chatId, filtered);
            return bot.sendMessage(chatId, 'Действия:', { reply_markup: { inline_keyboard: [
                [{ text: '🔁 Другой трек', callback_data: 'filter_track' }],
                [{ text: '⬅ Назад',        callback_data: 'back_to_filters' }]
            ]}});
        }

        // (filterPrice is now handled via inline callbacks fp_*)

        if (state.changingStatus) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }}); }
            const orders = loadOrders();
            const order = orders.find(o => o.id === state.selectedOrder);
            if (!order) return;
            order.status = text; saveOrders(orders); temp[chatId] = {};
            bot.sendMessage(chatId, '✅ Статус обновлен', { reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }});
            if (order.userId) bot.sendMessage(order.userId, `🚚 Ваш заказ обновлён!\n\nСтатус: <b>${order.status}</b>`, { parse_mode: 'HTML' }).catch(()=>{});
            return;
        }

        if (state.editingField) {
            if (text === 'Назад') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }}); }
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
                { parse_mode: 'HTML', reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }});
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
    if (data === 'back_to_orders') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }}); }
    if (data === 'back_to_filters') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Выберите фильтр:', { reply_markup: { inline_keyboard: [
        [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
        [{ text: 'По никнейму',        callback_data: 'filter_nickname' }],
        [{ text: 'По цене',            callback_data: 'filter_price' }],
        [{ text: 'По трек номеру',     callback_data: 'filter_track' }],
        [{ text: '⬅ Назад',            callback_data: 'back_to_orders' }]
    ]}}); }
    if (data === 'all_orders') { temp[chatId] = {}; return bot.sendMessage(chatId, 'Раздел "База заказов"', { reply_markup: { keyboard: [['Все заказы'],['Фильтры'],['Главное меню']], resize_keyboard: true }}); }

    if (data === 'cancel_registration') { temp[chatId] = {}; return bot.sendMessage(chatId, '❌ Регистрация отменена'); }
    if (data === 'add_product') { temp[chatId].currentItem = {}; temp[chatId].step = 'item_article'; return bot.sendMessage(chatId, 'Артикул / ссылка на товар:'); }
    if (data === 'edit_last_item') {
        if (!temp[chatId].items || !temp[chatId].items.length) return bot.sendMessage(chatId, '❌ Нет товаров для редактирования');
        temp[chatId].currentItem = temp[chatId].items.pop(); temp[chatId].step = 'item_article';
        return bot.sendMessage(chatId, `Артикул / ссылка (сейчас: ${temp[chatId].currentItem.article}):`);
    }
    if (data === 'step_back_to_nickname') { temp[chatId].step = 'nickname'; return bot.sendMessage(chatId, '👤 Юзернейм клиента\n\nПример:\n@client_username'); }
    if (data === 'continue_registration') { temp[chatId].step = 'choose_delivery'; return bot.sendMessage(chatId, 'Способ доставки до получателя:', { reply_markup: { inline_keyboard: [
        [{ text: 'Доставка до двери в пределах Адлера', callback_data: 'delivery_adler' }],
        [{ text: 'Самовывоз из офиса',                  callback_data: 'delivery_pickup' }],
        [{ text: 'Доставка СДЕК/Почта России',          callback_data: 'delivery_post' }]
    ]}}); }
    if (data === 'delivery_adler')  { temp[chatId].delivery = 'Адлер';      temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📍 Адрес получателя:'); }
    if (data === 'delivery_post')   { temp[chatId].delivery = 'Почта/СДЕК'; temp[chatId].step = 'enter_address'; return bot.sendMessage(chatId, '📬 Индекс / адрес доставки:'); }
    if (data === 'delivery_pickup') { temp[chatId].delivery = 'Самовывоз'; return finishOrder(chatId); }

    if (data === 'filter_status') {
        temp[chatId] = { filterStatus: true };
        return bot.sendMessage(chatId, 'Выберите статус:', { reply_markup: { inline_keyboard: [
            [{ text: 'В обработке',               callback_data: 'fs_В обработке' }],
            [{ text: 'Отправлен на склад в Китае', callback_data: 'fs_Отправлен на склад в Китае' }],
            [{ text: 'Отправлен на склад в Сочи',  callback_data: 'fs_Отправлен на склад в Сочи' }],
            [{ text: 'Готов к получению',          callback_data: 'fs_Готов к получению' }],
            [{ text: 'Завершен',                   callback_data: 'fs_Завершен' }],
            [{ text: '⬅ Назад к фильтрам',         callback_data: 'back_to_filters' }]
        ]}});
    }
    if (data === 'filter_nickname') { temp[chatId] = { filterNickname: true }; return bot.sendMessage(chatId, '👤 Введите юзернейм (@никнейм):', { reply_markup: { inline_keyboard: [[{ text: '⬅ Назад', callback_data: 'back_to_filters' }]] }}); }
    if (data === 'filter_price') {
        temp[chatId] = { filterPrice: true };
        return bot.sendMessage(chatId, 'Выберите диапазон цен:', { reply_markup: { inline_keyboard: [
            [{ text: '0 – 5 000 ₽',       callback_data: 'fp_0-5000' }],
            [{ text: '5 000 – 10 000 ₽',  callback_data: 'fp_5000-10000' }],
            [{ text: '10 000 – 15 000 ₽', callback_data: 'fp_10000-15000' }],
            [{ text: '15 000 – 20 000 ₽', callback_data: 'fp_15000-20000' }],
            [{ text: '20 000+ ₽',          callback_data: 'fp_20000+' }],
            [{ text: '⬅ Назад к фильтрам', callback_data: 'back_to_filters' }]
        ]}});
    }
    if (data === 'filter_track') { temp[chatId] = { filterTrack: true }; return bot.sendMessage(chatId, '🔍 Введите трек-номер (например: ABCD EFGH):'); }

    // ===== FILTER BY STATUS (inline, stays open) =====
    if (data.startsWith('fs_')) {
        const status = data.slice(3);
        const filtered = loadOrders().filter(o => o.status === status).sort((a,b) => a.createdAt - b.createdAt);
        const statusKeyboard = { inline_keyboard: [
            [{ text: 'В обработке',               callback_data: 'fs_В обработке' }],
            [{ text: 'Отправлен на склад в Китае', callback_data: 'fs_Отправлен на склад в Китае' }],
            [{ text: 'Отправлен на склад в Сочи',  callback_data: 'fs_Отправлен на склад в Сочи' }],
            [{ text: 'Готов к получению',          callback_data: 'fs_Готов к получению' }],
            [{ text: 'Завершен',                   callback_data: 'fs_Завершен' }],
            [{ text: '⬅ Назад к фильтрам',         callback_data: 'back_to_filters' }]
        ]};
        if (!filtered.length) {
            return bot.sendMessage(chatId, `📭 В статусе "${status}" заказов нет\n\nВыберите другой статус:`, { reply_markup: statusKeyboard });
        }
        sendOrdersWithButtons(chatId, filtered);
        return bot.sendMessage(chatId, `✅ Найдено заказов: ${filtered.length}\n\nВыберите другой статус или вернитесь назад:`, { reply_markup: statusKeyboard });
    }

    // ===== FILTER BY PRICE (inline, stays open) =====
    if (data.startsWith('fp_')) {
        const range = data.slice(3);
        const ranges = {
            '0-5000':      o => (o.total||0) <= 5000,
            '5000-10000':  o => (o.total||0) > 5000  && (o.total||0) <= 10000,
            '10000-15000': o => (o.total||0) > 10000 && (o.total||0) <= 15000,
            '15000-20000': o => (o.total||0) > 15000 && (o.total||0) <= 20000,
            '20000+':      o => (o.total||0) > 20000
        };
        const priceKeyboard = { inline_keyboard: [
            [{ text: '0 – 5 000 ₽',       callback_data: 'fp_0-5000' }],
            [{ text: '5 000 – 10 000 ₽',  callback_data: 'fp_5000-10000' }],
            [{ text: '10 000 – 15 000 ₽', callback_data: 'fp_10000-15000' }],
            [{ text: '15 000 – 20 000 ₽', callback_data: 'fp_15000-20000' }],
            [{ text: '20 000+ ₽',          callback_data: 'fp_20000+' }],
            [{ text: '⬅ Назад к фильтрам', callback_data: 'back_to_filters' }]
        ]};
        const fn = ranges[range];
        if (!fn) return;
        const filtered = loadOrders().filter(fn);
        if (!filtered.length) {
            return bot.sendMessage(chatId, `📭 В диапазоне "${range.replace('-',' – ')} ₽" заказов нет\n\nВыберите другой диапазон:`, { reply_markup: priceKeyboard });
        }
        sendOrdersWithButtons(chatId, filtered);
        return bot.sendMessage(chatId, `✅ Найдено заказов: ${filtered.length}\n\nВыберите другой диапазон или вернитесь назад:`, { reply_markup: priceKeyboard });
    }

    if (data.startsWith('details_')) {
        const id = Number(data.split('_')[1]);
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
        const id = Number(data.split('_')[2]);
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
        const id = Number(data.split('_')[1]);
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
        const id = Number(data.split('_')[1]);
        if (!loadOrders().find(o => o.id === id)) return;
        temp[chatId] = { selectedOrder: id, editingField: true };
        return bot.sendMessage(chatId, 'Какие данные изменить?', { reply_markup: { keyboard: [
            ['Никнейм'],['Тип'],['Цена'],['Модель/артикул/ссылку'],['Назад']
        ], resize_keyboard: true }});
    }

    if (data === 'create_promo') { temp[chatId] = { promoStep: 'enter_name' }; return bot.sendMessage(chatId, 'Введите промокод:\nНапример: "СКИДКА20"\n\nТолько большие буквы и цифры'); }
    if (data === 'check_promo')  { temp[chatId] = { promoCheck: true }; return bot.sendMessage(chatId, '🔍 Введите промокод для проверки:'); }
    if (data === 'promo_unlimited') { temp[chatId].limit = null; temp[chatId].promoStep = 'choose_category'; return sendPromoCategory(chatId); }
    if (data === 'promo_no_date') { temp[chatId].expires = null; temp[chatId].promoStep = 'enter_comment'; return bot.sendMessage(chatId, 'Комментарий к промокоду:', { reply_markup: { inline_keyboard: [[{ text: 'Без комментария', callback_data: 'promo_no_comment' }]] }}); }
    if (data === 'promo_no_comment') { temp[chatId].comment = null; return saveAndSendPromo(chatId); }
    if (data.startsWith('promo_cat_')) {
        if (data === 'promo_cat_custom') { temp[chatId].promoStep = 'custom_category'; return bot.sendMessage(chatId, 'Введите свой вариант категории:'); }
        temp[chatId].category = data.replace('promo_cat_',''); temp[chatId].promoStep = 'enter_date';
        return bot.sendMessage(chatId, 'До какого числа действует промокод?\nФормат: "20.02.2027"', { reply_markup: { inline_keyboard: [[{ text: 'Бессрочно', callback_data: 'promo_no_date' }]] }});
    }

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
