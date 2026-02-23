const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const PROMO_FILE = path.join(__dirname, 'promocodes.json');

function loadPromos() {
    if (!fs.existsSync(PROMO_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROMO_FILE));
}

function savePromos(data) {
    fs.writeFileSync(PROMO_FILE, JSON.stringify(data, null, 2));
}
if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    console.log('Второй процесс остановлен');
    process.exit(0);
}

function sendPromoCategory(chatId) {
    bot.sendMessage(chatId,
'Выберите на что действует промокод:',
{
    reply_markup: {
        inline_keyboard: [
            [{ text: 'Обувь', callback_data: 'promo_cat_Обувь' }],
            [{ text: 'Одежда', callback_data: 'promo_cat_Одежда' }],
            [{ text: 'Часы/украшения', callback_data: 'promo_cat_Часы' }],
            [{ text: 'Техника', callback_data: 'promo_cat_Техника' }],
            [{ text: 'Другое', callback_data: 'promo_cat_Другое' }],
            [{ text: 'Свой вариант', callback_data: 'promo_cat_custom' }]
        ]
    }
});
}


const token = '8333995700:AAGd30lumgSxFwuts-EQY4guQOX-gjqjRJI';
const bot = new TelegramBot(token, { polling: true });

const ADMIN_IDS = [8183121320, 8042412556];

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const USERS_FILE = path.join(__dirname, 'users.json');

let temp = {};

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});


function generateTrackNumber(existingOrders) {

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    function randomBlock() {
        let result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    let trackNumber;

    do {
        trackNumber = `${randomBlock()} ${randomBlock()}`;
    } while (existingOrders.some(order => order.track === trackNumber));

    return trackNumber;
}

// ================= УТИЛИТЫ =================

function loadOrders() {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ORDERS_FILE));
}

function saveOrders(data) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}


// ================= МЕНЮ =================

function mainMenu(chatId) {
    bot.sendMessage(chatId, "Главное меню", {
        reply_markup: {
            keyboard: [
                ['🛍 Сделать заказ', '📦 Мои заказы'],
                ['💰 Рассчитать стоимость товара', '💴 Текущий курс юаня'],
                ['📌 FAQ'],
                ['🛠 Поддержка']
            ],
            resize_keyboard: true
        }
    });
}
function adminMenu(chatId) {
    bot.sendMessage(chatId, 'Главное меню', {
        reply_markup: {
            keyboard: [
                ['🖋️ Зарегистрировать заказ'],
                ['📄 База заказов'],
                ['📊 Статистика'],
                ['🎁 Промокоды'],
                ['📢 Акции'],
                ['Поддержка']
            ],
            resize_keyboard: true
        }
    });
}

// ================= START =================

bot.onText(/\/start/, (msg) => {

    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (ADMIN_IDS.includes(chatId)) {
        adminMenu(chatId);
        return;
    }

    if (!username) {
        return bot.sendMessage(chatId, 'Установите username в Telegram.');
    }

    let users = {};
    if (fs.existsSync(USERS_FILE)) {
        users = JSON.parse(fs.readFileSync(USERS_FILE));
    }

    users[username.toLowerCase()] = chatId;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    mainMenu(chatId);
});

// ================= ОСНОВНАЯ ЛОГИКА =================

bot.on('message', (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text || msg.caption;

    // ===== АДМИН =====
    if (ADMIN_IDS.includes(chatId)) {

        if (text === 'Главное меню') {
            adminMenu(chatId);
            return;
        }

        if (text === 'Поддержка') {
    bot.sendMessage(chatId, '📞 Поддержка: @Savelisb');
    return;
}
if (text === '📢 Акции') {

    temp[chatId] = {
        mailingStep: 'write_text'
    };

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

❗ Все теги должны быть закрыты.`,
{
    parse_mode: 'HTML',
    reply_markup: {
        inline_keyboard: [
            [{ text: '⬅ Назад', callback_data: 'admin_back_main' }]
        ]
    }
});
}
if (text === '📊 Статистика') {

    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE))
        : {};

    const orders = loadOrders();
    const promos = loadPromos();

    const totalUsers = Object.keys(users).length;
    const activeOrders = orders.filter(o => o.status !== 'Завершен').length;
    const completedOrders = orders.filter(o => o.status === 'Завершен').length;

    const totalMailings = promos.reduce((sum, p) => sum + (p.mailingCount || 0), 0);

    const activePromos = promos.filter(p => !p.expired).length;
    const usedPromos = promos.filter(p => p.used > 0).length;

    return bot.sendMessage(chatId,
`📊 Статистика

Пользователей всего: ${totalUsers}
Активные заказы: ${activeOrders}
Завершенные заказы: ${completedOrders}
Рассылок отправлено: ${totalMailings}

Активных промокодов: ${activePromos}
Использованных промокодов: ${usedPromos}`);
}

if (text === '🎁 Промокоды') {

    return bot.sendMessage(chatId,
`🎁 Раздел промокодов`,
{
    reply_markup: {
        inline_keyboard: [
            [{ text: '➕ Создать промокод', callback_data: 'create_promo' }],
            [{ text: '🔎 Проверить промокод', callback_data: 'check_promo' }],
            [{ text: '⬅ Главное меню', callback_data: 'admin_back_main' }]
        ]
    }
});
}

        if (text === '🖋️ Зарегистрировать заказ') {

    temp[chatId] = {
        step: 'nickname',
        items: []
    };

    bot.sendMessage(chatId,
`👤 Юзернейм клиента

Пример:
@client_username`,
{
    reply_markup: {
        inline_keyboard: [
            [{ text: '❌ Прекратить регистрацию', callback_data: 'cancel_registration' }]
        ]
    }
}
);



return;
}

if (temp[chatId]?.step === 'enter_address') {

    temp[chatId].address = text;
    return finishOrder(chatId);
}

if (temp[chatId]?.step === 'nickname') {

    temp[chatId].nickname = text.replace('@', '');
    temp[chatId].step = 'products_menu';

    bot.sendMessage(chatId,
        'Товары',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить товар', callback_data: 'add_product' }]
                ]
            }
        }
    );

    return;
}

if (temp[chatId]?.promoCheck) {

    const promos = loadPromos();
    const promo = promos.find(p => p.code === text.trim());

    if (!promo) {
        return bot.sendMessage(chatId, 'Промокод не найден');
    }

    const remaining = promo.limit === null
        ? '∞'
        : promo.limit - promo.used;

    temp[chatId] = {};

    return bot.sendMessage(chatId,
`🎁 Промокод <code>${promo.code}</code>

Количество применений всего: ${promo.limit || '∞'}
Осталось применений: ${remaining}
Промокод действует на: ${promo.category}
Срок действия до: ${promo.expires || 'Бессрочно'}

Комментарий:
"${promo.comment || 'Нет'}"`,
{
    parse_mode: 'HTML',
    reply_markup: {
        inline_keyboard: [
            [{ text: 'Проверить другой промокод', callback_data: 'check_promo' }],
            [{ text: 'Главное меню', callback_data: 'admin_back_main' }]
        ]
    }
});
}

// ===== РАССЫЛКА: ПОЛУЧЕНИЕ ФОТО =====
if (temp[chatId]?.mailingStep === 'wait_image' && msg.photo) {

    const photo = msg.photo[msg.photo.length - 1].file_id;

    temp[chatId].photo = photo;
    temp[chatId].mailingStep = 'choose_audience';

    return bot.sendMessage(chatId,
        '👥 Кому хотите отправить сообщение?',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Всем', callback_data: 'mail_all' }],
                    [{ text: 'Кто ожидает заказ', callback_data: 'mail_waiting' }],
                    [{ text: 'Кто только включил бот', callback_data: 'mail_new' }],
                    [{ text: 'Кто забрал заказ', callback_data: 'mail_completed' }],
                    [{ text: 'Кто давно не заказывал (2+ мес)', callback_data: 'mail_inactive' }],
                    [{ text: 'Назад', callback_data: 'mail_back_to_image' }],
                    [{ text: 'Отменить рассылку', callback_data: 'mail_cancel' }]
                ]
            }
        }
    );
}


if (temp[chatId]?.step === 'item_article') {

    temp[chatId].currentItem.article = text;
    temp[chatId].step = 'item_size';

    return bot.sendMessage(chatId, 'Размер');
}

if (temp[chatId]?.step === 'item_size') {

    temp[chatId].currentItem.size = text;
    temp[chatId].step = 'item_price';

    return bot.sendMessage(chatId, 'Стоимость');
}

if (temp[chatId]?.step === 'item_price') {

    temp[chatId].currentItem.price = Number(text);

    temp[chatId].items.push(temp[chatId].currentItem);
    temp[chatId].currentItem = null;
    temp[chatId].step = 'products_menu';

    return bot.sendMessage(chatId,
        '✅ Товар добавлен',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить товар', callback_data: 'add_product' }],
                    [{ text: '✏ Изменить данные товара', callback_data: 'edit_last_item' }],
                    [{ text: '➡ Продолжить регистрацию', callback_data: 'continue_registration' }],
                    [{ text: '⬅ Шаг назад', callback_data: 'step_back_to_nickname' }]
                ]
            }
        }
    );
}



        if (text === '📄 База заказов') {
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
    keyboard: [
        ['Все заказы'],
        ['Фильтры'],
        ['Главное меню']
    ],
    resize_keyboard: true
}
            });
            return;
        }

        if (text === 'Все заказы') {
    temp[chatId] = {};
    return sendOrdersWithButtons(chatId, loadOrders());
}

// ===== РАССЫЛКА: ПОЛУЧЕНИЕ ТЕКСТА =====
if (temp[chatId]?.mailingStep === 'write_text') {

    temp[chatId].text = text;
    temp[chatId].mailingStep = 'wait_image';

    return bot.sendMessage(chatId,
        '🖼 Отправьте изображение которое хотите отправить',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Без изображения', callback_data: 'mail_no_image' }],
                    [{ text: 'Переписать текст', callback_data: 'mail_rewrite_text' }]
                ]
            }
        }
    );
}



       if (text === 'Фильтры') {

    bot.sendMessage(chatId, 'Выберите фильтр:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
                [{ text: 'По никнейму', callback_data: 'filter_nickname' }],
                [{ text: 'По цене', callback_data: 'filter_price' }],
                [{ text: 'По трек номеру', callback_data: 'filter_track' }],
                [{ text: 'Назад', callback_data: 'back_to_orders' }]
            ]
        }
    });

    return;
}
        // ===== ИЗМЕНЕНИЕ СТАТУСА =====
        if (temp[chatId]?.changingStatus) {

            // Назад
            if (text === 'Назад') {
                temp[chatId] = {};
                bot.sendMessage(chatId, 'Раздел "База заказов"', {
                    reply_markup: {
                        keyboard: [
                            ['Все заказы'],
                            ['Главное меню']
                        ],
                        resize_keyboard: true
                    }
                });
                return;
            }

            const orders = loadOrders();
            const order = orders.find(o => o.id === temp[chatId].selectedOrder);
            if (!order) return;

            order.status = text;
            saveOrders(orders);

            temp[chatId] = {};

            bot.sendMessage(chatId, '✅ Статус обновлен', {
                reply_markup: {
                    keyboard: [
                        ['Главное меню'],
                        ['База заказов'],
                        ['Назад']
                    ],
                    resize_keyboard: true
                }
            });

            // уведомление клиенту
            if (fs.existsSync(USERS_FILE)) {
                const users = JSON.parse(fs.readFileSync(USERS_FILE));
                const clientId = users[order.nickname.toLowerCase()];

                if (clientId) {
                    bot.sendMessage(clientId,
                        `🚚 Ваш заказ на шаг ближе!

Статус заказа: ${order.status}`);
                }
            }

            return;
        }
        
        // ===== ФИЛЬТР ПО СТАТУСУ =====
if (temp[chatId]?.filterStatus) {

    // ===== НАЗАД В ФИЛЬТРЫ =====
    if (text === 'Назад') {

        temp[chatId] = {};

        return bot.sendMessage(chatId, 'Выберите фильтр:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
                    [{ text: 'По никнейму', callback_data: 'filter_nickname' }],
                    [{ text: 'По цене', callback_data: 'filter_price' }],
                    [{ text: 'По трек номеру', callback_data: 'filter_track' }],
                    [{ text: 'Назад', callback_data: 'back_to_orders' }]
                ]
            }
        });
    }

    const orders = loadOrders()
        .filter(o => o.status === text)
        .sort((a, b) => a.createdAt - b.createdAt);

    // ❗ НЕ СБРАСЫВАЕМ temp
    // temp остаётся { filterStatus: true }

    if (!orders.length) {

        return bot.sendMessage(chatId,
            'В этом статусе заказов нет',
            {
                reply_markup: {
                    keyboard: [
                        ['В обработке'],
                        ['Отправлен на склад в Китае'],
                        ['Отправлен на склад в Сочи'],
                        ['Готов к получению'],
                        ['Завершен'],
                        ['Назад']
                    ],
                    resize_keyboard: true
                }
            }
        );
    }

    return sendOrdersWithButtons(chatId, orders);
}

if (temp[chatId]?.filterNickname) {

    const nickname = text.replace('@', '').toLowerCase();

    const orders = loadOrders()
        .filter(o => o.nickname.toLowerCase() === nickname);

    temp[chatId] = {}; // сбрасываем режим ввода

    if (!orders.length) {
        return bot.sendMessage(chatId,
            'Заказы с таким никнеймом не найдены',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔁 Другой никнейм', callback_data: 'filter_nickname' }],
                        [{ text: '⬅ Назад', callback_data: 'back_to_filters' }]
                    ]
                }
            }
        );
    }

    if (temp[chatId]?.promoStep === 'enter_name') {

    const code = text.trim();

    if (!/^[A-ZА-Я0-9]+$/.test(code)) {
        return bot.sendMessage(chatId, '❌ Только большие буквы и цифры');
    }

    temp[chatId].code = code;
    temp[chatId].promoStep = 'enter_limit';

    return bot.sendMessage(chatId,
`Количество применений:
"1"`,
{
    reply_markup: {
        inline_keyboard: [
            [{ text: '♾ Бесконечно', callback_data: 'promo_unlimited' }]
        ]
    }
});
}

    // отправляем заказы
    sendOrdersWithButtons(chatId, orders);

    // кнопки после списка
    return bot.sendMessage(chatId,
        'Действия:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔁 Другой никнейм', callback_data: 'filter_nickname' }],
                    [{ text: '⬅ Назад', callback_data: 'back_to_filters' }]
                ]
            }
        }
    );
}

if (temp[chatId]?.filterPrice) {

    // ===== НАЗАД В ФИЛЬТРЫ =====
    if (text === 'Назад') {

        temp[chatId] = {};

        return bot.sendMessage(chatId, 'Выберите фильтр:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
                    [{ text: 'По никнейму', callback_data: 'filter_nickname' }],
                    [{ text: 'По цене', callback_data: 'filter_price' }],
                    [{ text: 'По трек номеру', callback_data: 'filter_track' }],
                    [{ text: 'Назад', callback_data: 'back_to_orders' }]
                ]
            }
        });
    }

    const orders = loadOrders();
    let filtered = [];

    if (text === '0-5000')
        filtered = orders.filter(o => (o.total || 0) <= 5000);

    if (text === '5000-10000')
        filtered = orders.filter(o => (o.total || 0) > 5000 && (o.total || 0) <= 10000);

    if (text === '10000-15000')
        filtered = orders.filter(o => (o.total || 0) > 10000 && (o.total || 0) <= 15000);

    if (text === '15000-20000')
        filtered = orders.filter(o => (o.total || 0) > 15000 && (o.total || 0) <= 20000);

    if (text === '20000+')
        filtered = orders.filter(o => (o.total || 0) > 20000);

    // ❗ НЕ СБРАСЫВАЕМ temp !!!
    // temp остаётся { filterPrice: true }

    if (!filtered.length) {

        return bot.sendMessage(chatId,
            'В этом диапазоне заказов нет',
            {
                reply_markup: {
                    keyboard: [
                        ['0-5000'],
                        ['5000-10000'],
                        ['10000-15000'],
                        ['15000-20000'],
                        ['20000+'],
                        ['Назад']
                    ],
                    resize_keyboard: true
                }
            }
        );
    }

    return sendOrdersWithButtons(chatId, filtered);
}


        // ===== ИЗМЕНЕНИЕ ДАННЫХ =====
        if (temp[chatId]?.editingField) {

            if (text === 'Назад') {
                temp[chatId] = {};
                bot.sendMessage(chatId, 'Раздел "База заказов"', {
                    reply_markup: {
                        keyboard: [
                            ['Все заказы'],
                            ['Главное меню']
                        ],
                        resize_keyboard: true
                    }
                });
                return;
            }

            temp[chatId].field = text;
            temp[chatId].editingField = false;
            temp[chatId].waitingNewValue = true;

            if (text === 'Никнейм')
                bot.sendMessage(chatId, 'Введите новый никнейм:');

            if (text === 'Тип')
                bot.sendMessage(chatId, 'Введите новый тип:');

            if (text === 'Цена')
                bot.sendMessage(chatId, 'Введите новую цену:');

            if (text === 'Модель/артикул/ссылку')
                bot.sendMessage(chatId, 'Введите новую модель / артикул / ссылку:');

            return;
        }

        if (temp[chatId]?.waitingNewValue) {

            const orders = loadOrders();
            const order = orders.find(o => o.id === temp[chatId].selectedOrder);
            if (!order) return;

            if (temp[chatId].field === 'Никнейм')
                order.nickname = text.replace('@', '');

            if (temp[chatId].field === 'Тип')
    order.items[0].type = text;

if (temp[chatId].field === 'Цена') {
    order.items[0].price = Number(text);

    // пересчитываем общую сумму
    order.total = order.items.reduce((sum, item) => sum + Number(item.price), 0);
}

if (temp[chatId].field === 'Модель/артикул/ссылку')
    order.items[0].article = text;

            saveOrders(orders);

            temp[chatId] = {};

            bot.sendMessage(chatId,
`✅ Данные обновлены

@${order.nickname}
Тип: ${order.items[0].type || 'не указан'}
Сумма: ${order.total} ₽
Артикул: ${order.items[0].article || 'нет'}
Статус: ${order.status}
Трек: <code>${order.track}</code>`,
{
    parse_mode: 'HTML',
    reply_markup: {
        keyboard: [
            ['Главное меню'],
            ['База заказов']
        ],
        resize_keyboard: true
    }
});

            return;
        }

    }



    // ===== КЛИЕНТ =====

    if (text === 'Главное меню') {
        mainMenu(chatId);
        return;
    }

    if (text === '🛍 Сделать заказ') {

    // 1️⃣ Сообщение с кнопкой менеджера
    bot.sendMessage(chatId,
        `🛍 Сделать заказ

Заказ вам поможет оформить наш менеджер!

Он оформит вам заказ, предложит удобные варианты доставки и оплаты, расскажет как отследить покупку до её прибытия к вам.

Отправьте ему ссылку / скриншот / модель товара, размер и стоимость.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }]
                ]
            }
        }
    );

    return;
}
if (text === '💰 Рассчитать стоимость товара') {

    temp[chatId] = { calcStep: 'chooseType' };

    bot.sendMessage(chatId,
        `💰 Выберите тип товара:`,
        {
            reply_markup: {
                keyboard: [
                    ['Одежда'],
                    ['Обувь'],
                    ['Часы/украшения'],
                    ['Техника'],
                    ['Другое'],
                    ['⬅️ Назад']
                ],
                resize_keyboard: true
            }
        }
    );

    return;
}

    if (text === '⬅️ Назад') {

        // Если был расчет
        if (temp[chatId]?.calcStep === 'waitPrice') {
            temp[chatId] = { calcStep: 'chooseType' };

            bot.sendMessage(chatId,
                `💰 Выберите тип товара:`,
                {
                    reply_markup: {
                        keyboard: [
                            ['Одежда'],
                            ['Обувь'],
                            ['Часы/украшения'],
                            ['Техника'],
                            ['Другое'],
                            ['⬅️ Назад']
                        ],
                        resize_keyboard: true
                    }
                });

            return;
        }

        // Если был выбор категории
        if (temp[chatId]?.calcStep === 'chooseType') {
            temp[chatId] = {};

            bot.sendMessage(chatId,
                `🛍 Сделать заказ

Выберите действие:`,
                {
                    reply_markup: {
                        keyboard: [
                            ['💰 Рассчитать стоимость товара'],
                            ['📌 FAQ'],
                            ['⬅️ Назад']
                        ],
                        resize_keyboard: true
                    }
                });

            return;
        }

        // Во всех остальных случаях — в главное меню
        mainMenu(chatId);
        return;
    }




    if (text === '📦 Мои заказы') {

    bot.sendMessage(chatId,
        'Какие заказы хотите посмотреть?',
        {
            reply_markup: {
                keyboard: [
                    ['📦 Активные'],
                    ['✅ Завершенные'],
                    ['⬅️ Назад']
                ],
                resize_keyboard: true
            }
        }
    );

    return;
}

if (text === '📦 Активные') {

    const orders = loadOrders();

    const userOrders = orders.filter(order =>
        order.userId === chatId && order.status !== 'Завершен'
    );

    if (!userOrders.length) {
        bot.sendMessage(chatId, 'У вас нет активных заказов.');
        return;
    }

    userOrders.forEach(order => {

        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>  @${order.nickname}

💰 Сумма: ${order.total} ₽
🛍 Товаров: ${order.items.length}
📌 Статус: ${order.status}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]
                ]
            }
        });

    });

    return;
}

if (text === '✅ Завершенные') {

    const orders = loadOrders();

    const userOrders = orders.filter(order =>
        order.userId === chatId && order.status === 'Завершен'
    );

    if (!userOrders.length) {
        bot.sendMessage(chatId, 'У вас нет завершенных заказов.');
        return;
    }

    userOrders.forEach(order => {

        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>  @${order.nickname}

💰 Сумма: ${order.total} ₽
🛍 Товаров: ${order.items.length}
📌 Статус: ${order.status}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]
                ]
            }
        });

    });

    return;
}

    
    // ===== ВЫБОР ТИПА =====
    if (temp[chatId]?.calcStep === 'chooseType') {

        if (text === '⬅️ Назад') {
            temp[chatId] = {};
            bot.sendMessage(chatId,
                `💰 Выберите тип товара:`,
                {
                    reply_markup: {
                        keyboard: [
                            ['Одежда'],
                            ['Обувь'],
                            ['Часы/украшения'],
                            ['Техника'],
                            ['Другое'],
                            ['⬅️ Назад']
                        ],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === 'Одежда') {
            temp[chatId] = { calcStep: 'waitPrice', type: 'clothes' };
            bot.sendMessage(chatId, 'Напишите стоимость товара в юанях');
            return;
        }

        if (text === 'Обувь') {
            temp[chatId] = { calcStep: 'waitPrice', type: 'shoes' };
            bot.sendMessage(chatId, 'Напишите стоимость товара в юанях');
            return;
        }
if (['Часы/украшения', 'Техника', 'Другое'].includes(text)) {

    temp[chatId] = {};

    bot.sendMessage(chatId,
        `Эта категория товаров обсуждается лично с менеджером!`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Связаться с менеджером', url: 'https://t.me/adrlogisticsmanager' }]
                ]
            }
        }
    );

    mainMenu(chatId);
return;
    
}

        }
        
        /// ===== ВВОД ЦЕНЫ =====
if (temp[chatId]?.calcStep === 'waitPrice') {

    const price = Number(text);
    if (isNaN(price)) return;

    let total = 0;

    if (temp[chatId].type === 'clothes') {
        total = price * 12 + 500 + 1000;
    }

    if (temp[chatId].type === 'shoes') {
        total = price * 12 + 1500 + 1000;
    }

    temp[chatId] = {};

    bot.sendMessage(chatId,
        `🚚 Расчет стоимости:

${total} ₽ (Доставка до Сочи)

Это цена с доставкой до Сочи.
В эту стоимость не входит дополнительная доставка СДЕК / Почта России в ваш регион.

Доставка в пределах Адлерского района бесплатная

Самовывоз из офиса по предварительной записи!`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }
                    ],
                    [
                        { text: '⬅️ Назад', callback_data: 'back_to_menu' }
                    ]
                ]
            }
        }
    );

    return;
}


        // ===== КУРС ЮАНЯ =====
if (text === '💴 Текущий курс юаня') {

    bot.sendMessage(chatId,
        `💴 Текущий курс равен 12.5₽ = 1¥

_Расчет цены делается исходя из цены товара помноженной на курс юаня_`,
        {
            parse_mode: 'Markdown'
        });
    

    

    return;
}

        // ===== ПОДДЕРЖКА =====
        if (text === '🛠 Поддержка') {
            bot.sendMessage(chatId,
                `🛠 Поддержка

Отправьте менеджеру номер заказа и опишите вашу проблему.
Если требуется — прикрепите фото.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Решить проблему', url: 'https://t.me/adrlogisticsmanager' }]
                        ]
                    }
                });
            return;
        }

        function sendClientOrders(chatId, username) {

            const orders = loadOrders()
                .filter(o => o.nickname.toLowerCase() === username.toLowerCase())
                .sort((a, b) => b.createdAt - a.createdAt);

            if (!orders.length) {
                bot.sendMessage(chatId, 'У вас пока нет заказов.');
                return;

            }


            orders.forEach(order => {

                bot.sendMessage(chatId,
                    `📦 Ваш заказ

Тип: ${order.type}
Модель: ${order.model}
Сумма: ${order.price} ₽
Статус: ${order.status}
Трек: ${order.track}`);
            });
        }

        if (text === '📌 FAQ') {

            bot.sendMessage(chatId,
                `📌 FAQ

Выберите интересующий раздел.`,
                {
                    reply_markup: {
                        keyboard: [
                            ['🚚 Доставка'],
                            ['↩️ Возврат'],
                            ['📦 Как отследить заказ?'],
                            ['✅ Оригинал или нет?'],
                            ['🕒 Время работы Менеджеров'],
                            ['⬅️ Назад']
                        ],
                        resize_keyboard: true
                    }
                });

            return;
        }

        if (text === '🚚 Доставка') {
            bot.sendMessage(chatId,
                `🚚 Доставка

Все товары перед тем как отправится клиенту попадают на склад в Адлере.

Получить товар можно 3 способами:

- Отправка СДЕК / ПОЧТА РОССИИ  
_доставку оплачивает клиент_

- Бесплатная доставка по Адлерскому району  
_нужно написать менеджеру @adrlogisticsmanager_

- Самовывоз со склада  
_исключительно в будни с 12:00 до 19:00_`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['Назад в FAQ'], ['Главное меню']],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === '↩️ Возврат') {
            bot.sendMessage(chatId,
                `↩️ Возврат

*Возврат не осуществляется!*

Товар проходит тщательную проверку на нашем складе в Китае.

Если товар бракованный или неоригинальный — мы его заменим и до вас дойдет исключительно оригинальный и качественный товар.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['Назад в FAQ'], ['Главное меню']],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === '📦 Как отследить заказ?') {
            bot.sendMessage(chatId,
                `📦 Как отследить заказ?

*Отслеживать товар вы сможете в разделе "Мои заказы" на главном меню.*

Также товар проходит 4 этапа доставки, об изменении статуса доставки вас уведомит бот.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['Назад в FAQ'], ['Главное меню']],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === '✅ Оригинал или нет?') {
            bot.sendMessage(chatId,
                `✅ Оригинал или нет?

*Товар исключительно оригинальный.*

Мы получаем ваш товар на складе в Китае и проводим тщательную проверку на подлинность и наличие брака.

Если товар окажется не подлежащим — мы его заменим и отправим вам.

В конечном итоге вам дойдет оригинальный и качественный товар.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['Назад в FAQ'], ['Главное меню']],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === '🕒 Время работы Менеджеров') {
            bot.sendMessage(chatId,
                `🕒 Время работы Менеджеров

Наши менеджеры обычно отвечают на вопросы и регистрируют заказы без выходных:


с 10:00 до 22:00`,
                {
                    reply_markup: {
                        keyboard: [['Назад в FAQ'], ['Главное меню']],
                        resize_keyboard: true
                    }
                });
            return;
        }

        if (text === 'Назад в FAQ') {

    bot.sendMessage(chatId,
        `📌 FAQ

Выберите интересующий раздел.`,
        {
            reply_markup: {
                keyboard: [
                    ['🚚 Доставка'],
                    ['↩️ Возврат'],
                    ['📦 Как отследить заказ?'],
                    ['✅ Оригинал или нет?'],
                    ['🕒 Время работы Менеджеров'],
                    ['⬅️ Назад']
                ],
                resize_keyboard: true
            }
        });

    return;
}

if (temp[chatId]?.filterTrack) {

    const track = text.trim();

    const orders = loadOrders()
        .filter(o => o.track === track);

    temp[chatId] = {};

    if (!orders.length) {
        return bot.sendMessage(chatId,
            'Заказ с таким трек номером не найден',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔁 Другой трек номер', callback_data: 'filter_track' }],
                        [{ text: '⬅ Назад', callback_data: 'back_to_filters' }]
                    ]
                }
            }
        );
    }

    sendOrdersWithButtons(chatId, orders);

    return bot.sendMessage(chatId,
        'Действия:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔁 Другой трек номер', callback_data: 'filter_track' }],
                    [{ text: '⬅ Назад', callback_data: 'back_to_filters' }]
                ]
            }
        }
    );
}

   });

console.log('Единый бот запущен');

bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    bot.answerCallbackQuery(query.id);

   if (data === 'back_main') {
    temp[chatId] = {};
    if (ADMIN_IDS.includes(chatId)) {
        return adminMenu(chatId);
    } else {
        return mainMenu(chatId);
    }
}



    // ===== НАЗАД В РАЗДЕЛ ЗАКАЗА =====
    if (data === 'back_order') {
        return bot.sendMessage(chatId,
            `🛍 Сделать заказ

Выберите действие:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📩 Оформить заказ', url: 'https://t.me/adrlogisticsmanager' }],
                        [{ text: '💰 Рассчитать стоимость товара', callback_data: 'calc' }],
                        [{ text: '📌 FAQ', callback_data: 'faq' }],
                        [{ text: '⬅️ Назад', callback_data: 'back_main' }]
                    ]
                }
            }
        );
    }

    if (data === 'back_to_orders') {
    temp[chatId] = {};
    return bot.sendMessage(chatId, 'Раздел "База заказов"', {
        reply_markup: {
            keyboard: [
                ['Все заказы'],
                ['Фильтры'],
                ['Главное меню']
            ],
            resize_keyboard: true
        }
    });
}

// ===== НАЗАД К ЗАКАЗАМ (КЛИЕНТ) =====
if (data === 'back_client_orders') {

    const orders = loadOrders();
    const userOrders = orders.filter(o => o.userId === chatId);

    userOrders.forEach(order => {

        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>  @${order.nickname}

💰 Сумма: ${order.total} ₽
🛍 Товаров: ${order.items.length}
📌 Статус: ${order.status}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подробнее', callback_data: `client_details_${order.id}` }]
                ]
            }
        });

    });

    return;
}

if (data === 'filter_nickname') {

    temp[chatId] = { filterNickname: true };

    return bot.sendMessage(chatId,
        'Введите юзернейм (@никнейм):',
        {
            reply_markup: {
                remove_keyboard: true, // ❗ УБИРАЕМ ОБЫЧНУЮ КЛАВИАТУРУ
                inline_keyboard: [
                    [{ text: '⬅ Назад', callback_data: 'back_to_filters' }]
                ]
            }
        }
    );
}

if (data === 'back_to_filters') {
    temp[chatId] = {};

    return bot.sendMessage(chatId, 'Выберите фильтр:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'По статусу заказа', callback_data: 'filter_status' }],
                [{ text: 'По никнейму', callback_data: 'filter_nickname' }],
                [{ text: 'По цене', callback_data: 'filter_price' }],
                [{ text: 'По трек номеру', callback_data: 'filter_track' }],
                [{ text: '⬅ Назад', callback_data: 'back_to_orders' }]
            ]
        }
    });
}

if (data === 'filter_price') {
    temp[chatId] = { filterPrice: true };

    return bot.sendMessage(chatId, 'Выберите диапазон:', {
        reply_markup: {
            keyboard: [
                ['0-5000'],
                ['5000-10000'],
                ['10000-15000'],
                ['15000-20000'],
                ['20000+'],
                ['Назад']
            ],
            resize_keyboard: true
        }
    });
}



    // ===== ВЫБОР ТИПА =====
    if (data === 'type_clothes') {

        temp[chatId] = {
            calcStep: 'waitPrice',
            type: 'clothes'
        };

        return bot.sendMessage(chatId, 'Напишите стоимость товара в юанях');
    }

if (data === 'cancel_registration') {
    temp[chatId] = {};
    return bot.sendMessage(chatId, 'Регистрация отменена');
}

if (data === 'add_product') {

    temp[chatId].currentItem = {};
    temp[chatId].step = 'item_article';

    return bot.sendMessage(chatId, 'Артикул / ссылка на товар');
}

if (data === 'step_back_to_nickname') {
    temp[chatId].step = 'nickname';

    return bot.sendMessage(chatId,
`👤 Юзернейм клиента

Пример:
@client_username`);
}

if (data === 'admin_back_main') {
    temp[chatId] = {};
    return adminMenu(chatId);
}

if (data === 'continue_registration') {

    temp[chatId].step = 'choose_delivery';

    return bot.sendMessage(chatId,
        'Способ доставки до получателя',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Доставка до двери в пределах Адлера', callback_data: 'delivery_adler' }],
                    [{ text: 'Самовывоз из офиса', callback_data: 'delivery_pickup' }],
                    [{ text: 'Доставка СДЕК/Почта России', callback_data: 'delivery_post' }]
                ]
            }
        }
    );
}

if (data === 'mail_no_image') {

    temp[chatId].mailingStep = 'choose_audience';

    return bot.sendMessage(chatId,
        '👥 Кому хотите отправить сообщение?',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Всем', callback_data: 'mail_all' }],
                    [{ text: 'Кто ожидает заказ', callback_data: 'mail_waiting' }],
                    [{ text: 'Кто только включил бот', callback_data: 'mail_new' }],
                    [{ text: 'Кто забрал заказ', callback_data: 'mail_completed' }],
                    [{ text: 'Кто давно не заказывал (2+ мес)', callback_data: 'mail_inactive' }],
                    [{ text: 'Назад', callback_data: 'mail_back_to_image' }],
                    [{ text: 'Отменить рассылку', callback_data: 'mail_cancel' }]
                ]
            }
        }
    );
}

if (data === 'mail_rewrite_text') {

    temp[chatId].mailingStep = 'write_text';

    return bot.sendMessage(chatId,
        '✍️ Напишите новый текст рассылки');
}

if (data === 'mail_cancel') {

    temp[chatId] = {};
    return adminMenu(chatId);
}

if (data.startsWith('mail_') && temp[chatId]?.mailingStep === 'choose_audience') {

    temp[chatId].audience = data;
    temp[chatId].mailingStep = 'confirm';

    // ===== ПРЕДПРОСМОТР =====
    if (temp[chatId].photo) {

        await bot.sendPhoto(chatId, temp[chatId].photo, {
            caption: temp[chatId].text,
            parse_mode: 'HTML'
        });

    } else {

        await bot.sendMessage(chatId, temp[chatId].text, {
            parse_mode: 'HTML'
        });
    }

    return bot.sendMessage(chatId,
        '📨 Так сообщение увидит клиент. Отправить?',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Да', callback_data: 'mail_send' }],
                    [{ text: 'Изменить изображение', callback_data: 'mail_back_to_image' }],
                    [{ text: 'Изменить текст', callback_data: 'mail_rewrite_text' }],
                    [{ text: 'Изменить получателей', callback_data: 'mail_change_audience' }],
                    [{ text: 'Отменить рассылку', callback_data: 'mail_cancel' }]
                ]
            }
        }
    );
}

if (data === 'mail_send') {

    const orders = loadOrders();
    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE))
        : {};

    const now = Date.now();
    let recipients = [];

    const allUserIds = Object.values(users);

    switch (temp[chatId].audience) {

        case 'mail_all':
            recipients = allUserIds;
            break;

        case 'mail_waiting':
            recipients = orders
                .filter(o => o.status !== 'Завершен')
                .map(o => o.userId);
            break;

        case 'mail_completed':
            recipients = orders
                .filter(o => o.status === 'Завершен')
                .map(o => o.userId);
            break;

        case 'mail_new':
            recipients = allUserIds.filter(id =>
                !orders.some(o => o.userId === id)
            );
            break;

        case 'mail_inactive':
            recipients = allUserIds.filter(id => {
                const userOrders = orders.filter(o => o.userId === id);
                if (!userOrders.length) return false;

                const lastOrder = Math.max(...userOrders.map(o => o.createdAt));
                return (now - lastOrder) > (60 * 24 * 60 * 60 * 1000);
            });
            break;
    }

    recipients = [...new Set(recipients)];

    let success = 0;
    let failed = 0;

    for (const id of recipients) {

        try {

            if (temp[chatId].photo) {

                await bot.sendPhoto(id, temp[chatId].photo, {
                    caption: temp[chatId].text,
                    parse_mode: 'HTML'
                });

            } else {

                await bot.sendMessage(id, temp[chatId].text, {
                    parse_mode: 'HTML'
                });
            }

            success++;

            // ⏳ задержка 50мс чтобы Telegram не банил
            await new Promise(res => setTimeout(res, 50));

        } catch (err) {
            failed++;
        }
    }

    const report =
`📊 Рассылка завершена

👥 Получателей: ${recipients.length}
✅ Успешно: ${success}
❌ Ошибки: ${failed}`;

    temp[chatId] = {};

    return bot.sendMessage(chatId, report);
}

if (data === 'filter_track') {
    temp[chatId] = { filterTrack: true };
    return bot.sendMessage(chatId, 'Введите трек номер:');
}

if (data === 'delivery_adler') {
    temp[chatId].delivery = 'Адлер';
    temp[chatId].step = 'enter_address';

    return bot.sendMessage(chatId, 'Адрес получателя');
}

if (data === 'delivery_post') {
    temp[chatId].delivery = 'Почта';
    temp[chatId].step = 'enter_address';

    return bot.sendMessage(chatId, 'Индекс / адрес доставки');
}

if (data === 'delivery_pickup') {
    temp[chatId].delivery = 'Самовывоз';
    return finishOrder(chatId);
}

if (data === 'filter_status') {

    temp[chatId] = { filterStatus: true };

    return bot.sendMessage(chatId,
        'Выберите статус:',
        {
            reply_markup: {
                keyboard: [
                    ['В обработке'],
                    ['Отправлен на склад в Китае'],
                    ['Отправлен на склад в Сочи'],
                    ['Готов к получению'],
                    ['Завершен'],
                    ['Назад']
                ],
                resize_keyboard: true
            }
        }
    );
}

if (data === 'promo_unlimited') {

    temp[chatId].limit = null;
    temp[chatId].promoStep = 'choose_category';

    return sendPromoCategory(chatId);
}

if (temp[chatId]?.promoStep === 'enter_limit') {

    const limit = Number(text);
    if (isNaN(limit) || limit <= 0)
        return bot.sendMessage(chatId, 'Введите корректное число');

    temp[chatId].limit = limit;
    temp[chatId].promoStep = 'choose_category';

    return sendPromoCategory(chatId);
}

if (temp[chatId]?.promoStep === 'finish_promo') {

    const promos = loadPromos();

    promos.push({
        code: temp[chatId].code,
        limit: temp[chatId].limit,
        used: 0,
        category: temp[chatId].category,
        expires: temp[chatId].expires,
        comment: temp[chatId].comment || null,
        createdAt: Date.now()
    });

    savePromos(promos);

    const createdCode = temp[chatId].code;

    temp[chatId] = {};

    return bot.sendMessage(chatId,
`✅ Промокод создан

<code>${createdCode}</code>`,
{
    parse_mode: 'HTML'
});
}

if (data.startsWith('promo_cat_')) {

    if (data === 'promo_cat_custom') {
        temp[chatId].promoStep = 'custom_category';
        return bot.sendMessage(chatId,
`Введите свой вариант:
"на Лего"

(не виден пользователю)`);
    }

    temp[chatId].category = data.replace('promo_cat_', '');
    temp[chatId].promoStep = 'enter_date';

    return bot.sendMessage(chatId,
`До какого числа действует промокод?
Формат:
"20.02.2027"`,
{
    reply_markup: {
        inline_keyboard: [
            [{ text: 'Бессрочно', callback_data: 'promo_no_date' }]
        ]
    }
});
}

if (data === 'check_promo') {

    temp[chatId] = { promoCheck: true };

    return bot.sendMessage(chatId,
'Введите промокод который хотите проверить');
}



    // ===== ИЗМЕНИТЬ СТАТУС =====
    if (data.startsWith('status_')) {

        const orders = loadOrders();
        const id = Number(data.split('_')[1]);
        const order = orders.find(o => o.id === id);
        if (!order) return;

        temp[chatId] = { selectedOrder: id, changingStatus: true };

        const allStatuses = [
            'Отправлен на склад в Китае',
            'Отправлен на склад в Сочи',
            'Готов к получению',
            'Завершен'
        ];

        const available = allStatuses.filter(s => s !== order.status);

        return bot.sendMessage(chatId, 'Выберите новый статус:', {
            reply_markup: {
                keyboard: [
                    ...available.map(s => [s]),
                    ['Назад']
                ],
                resize_keyboard: true
            }
        });
    }

    // ===== КАЛЬКУЛЯТОР =====
    if (data === 'calc') {
        return bot.sendMessage(chatId,
            `💰 Калькулятор стоимости

Функция расчета будет доступна в ближайшее время.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Назад', callback_data: 'back_order' }]
                    ]
                }
            }
        );
    }

    // ===== FAQ =====
    if (data === 'faq') {
        return bot.sendMessage(chatId,
            `📌 FAQ

Выберите раздел:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚚 Доставка', callback_data: 'faq_delivery' }],
                        [{ text: '↩️ Возврат', callback_data: 'faq_return' }],
                        [{ text: '📦 Как отследить заказ?', callback_data: 'faq_track' }],
                        [{ text: '⬅️ Назад', callback_data: 'back_order' }]
                    ]
                }
            }
        );
    }

    // ===== ПОДРОБНО ДЛЯ КЛИЕНТА =====
if (data.startsWith('client_details_')) {

    const orders = loadOrders();
    const id = Number(data.split('_')[2]);
    const order = orders.find(o => o.id === id);

    if (!order || order.userId !== chatId) return;

    let itemsText = '';

    order.items.forEach((item, index) => {
    itemsText +=
`<blockquote>
${index + 1}. Артикул/ссылка: ${item.article}
Тип: ${item.type || 'не указан'}
Размер: ${item.size}
Стоимость: ${item.price} ₽
</blockquote>\n`;
});

    return bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>
@${order.nickname}

🛍 Товаров: ${order.items.length}

${itemsText}
🚚 Способ доставки: ${order.delivery}
📍 Адрес: ${order.address || 'Самовывоз'}

💰 Итого: ${order.total} ₽
📦 Статус: ${order.status}`,
    {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅ Назад к заказам', callback_data: 'back_client_orders' }]
            ]
        }
    });
}

    // ===== РЕДАКТИРОВАНИЕ =====
    if (data.startsWith('edit_')) {

        const orders = loadOrders();
        const id = Number(data.split('_')[1]);
        const order = orders.find(o => o.id === id);
        if (!order) return;

        temp[chatId] = { selectedOrder: id, editingField: true };

        return bot.sendMessage(chatId, 'Какие данные изменить?', {
            reply_markup: {
                keyboard: [
                    ['Никнейм'],
                    ['Тип'],
                    ['Цена'],
                    ['Модель/артикул/ссылку'],
                    ['Назад']
                ],
                resize_keyboard: true
            }
        });
    }

// ===== ПОДРОБНО О ЗАКАЗЕ =====
if (data.startsWith('details_')) {

    const orders = loadOrders();
    const id = Number(data.split('_')[1]);
    const order = orders.find(o => o.id === id);
    if (!order) return;

    let itemsText = '';

    order.items.forEach((item, index) => {
        itemsText +=
`<blockquote>
${index + 1}. Артикул/ссылка: ${item.article}
Тип: ${item.type || 'не указан'}
Размер: ${item.size}
Стоимость: ${item.price} ₽
</blockquote>\n`;
    });

    return bot.sendMessage(chatId,
`📦 <b>Заказ <code>${order.track}</code></b>
@${order.nickname}

🛍 <b>Товаров:</b> ${order.items.length}

${itemsText}
🚚 <b>Способ доставки:</b> ${order.delivery}
📍 <b>Адрес:</b> ${order.address || 'Самовывоз'}

💰 <b>Итого:</b> ${order.total} ₽
📦 <b>Статус:</b> ${order.status}`,
    {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Изменить статус заказа', callback_data: `status_${order.id}` }],
                [{ text: 'Изменить данные заказа', callback_data: `edit_${order.id}` }],
                [{ text: '⬅ Назад', callback_data: 'all_orders' }]
            ]
        }
    });
}

if (data === 'all_orders') {

    temp[chatId] = {};

    return sendOrdersWithButtons(chatId, loadOrders());
}

if (data === 'create_promo') {

    temp[chatId] = { promoStep: 'enter_name' };

    return bot.sendMessage(chatId,
`Введите промокод:
"СКИДКА20"

Используются только:
"Кириллица, латиница, цифры, БОЛЬШИЕ буквы"`);
}

});

function sendOrdersWithButtons(chatId, orders) {

    if (!orders.length) {
        return bot.sendMessage(chatId, 'Заказов не найдено');
    }

    orders.forEach(order => {

        bot.sendMessage(chatId,
`📦 Заказ <code>${order.track}</code>

👤 @${order.nickname}
💰 Сумма: ${order.total || 0} ₽
🛍 Товаров: ${order.items.length}
📌 Статус: ${order.status}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подробнее', callback_data: `details_${order.id}` }]
                ]
            }
        });

    });
}

function finishOrder(chatId) {

    const data = temp[chatId];
    const orders = loadOrders();

    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE))
        : {};

    const clientId = users[data.nickname.toLowerCase()];
    if (!clientId) {
        bot.sendMessage(chatId, '❌ Клиент не найден');
        temp[chatId] = {};
        return;
    }

    const track = generateTrackNumber(orders);

    // считаем сумму всех товаров
    const total = data.items.reduce((sum, item) => sum + Number(item.price), 0);

    const newOrder = {
        id: Date.now(),
        userId: clientId,
        nickname: data.nickname,
        items: data.items,
        delivery: data.delivery,
        address: data.address || null,
        status: 'В обработке',
        track: track,
        total: total,
        createdAt: Date.now()
    };

    orders.push(newOrder);
    saveOrders(orders);

    // ===== ФОРМИРУЕМ СПИСОК ТОВАРОВ ДЛЯ АДМИНА =====
let itemsText = '';

newOrder.items.forEach((item, index) => {
    itemsText +=
`<blockquote>
${index + 1}. Артикул/ссылка: ${item.article}
Тип: ${item.type || 'не указан'}
Размер: ${item.size}
Стоимость: ${item.price} ₽
</blockquote>\n`;
});

// ===== СООБЩЕНИЕ АДМИНУ =====
bot.sendMessage(chatId,
`📦 <b>Заказ <code>${newOrder.track}</code></b>
@${newOrder.nickname}

🛍 <b>Товаров:</b> ${newOrder.items.length}

${itemsText}
🚚 <b>Способ доставки:</b> ${newOrder.delivery}
📍 <b>Адрес:</b> ${newOrder.address || 'Самовывоз'}

💰 <b>Итого:</b> ${newOrder.total} ₽
📦 <b>Статус:</b> ${newOrder.status}`,
{
    parse_mode: 'HTML'
});
     // ===== СООБЩЕНИЕ КЛИЕНТУ =====
    bot.sendMessage(clientId,
`✅ <b>Заказ зарегистрирован!</b>

🛍 Количество товаров: <b>${newOrder.items.length}</b>
💰 Сумма: <b>${newOrder.total} ₽</b>
📦 Статус: <b>${newOrder.status}</b>
🚚 Трек: <code>${newOrder.track}</code>`,
{
    parse_mode: 'HTML'
});

    temp[chatId] = {};
}