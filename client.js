const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = '8333995700:AAGd30lumgSxFwuts-EQY4guQOX-gjqjRJI';
const bot = new TelegramBot(token, { polling: true });

const ADMIN_CHAT_ID = 8183121320; // ← ВСТАВЬ СВОЙ ID

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
    } while (existingOrders.some(order => order.trackNumber === trackNumber));

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



function sendOrdersWithButtons(chatId, orders) {

    if (!orders.length) {
        bot.sendMessage(chatId, 'Заказы не найдены.');
        return;
    }

    orders.forEach(order => {

        bot.sendMessage(chatId,
            `@${order.nickname}
Тип: ${order.type}
Сумма: ${order.price} ₽
Модель: ${order.model}
Статус: ${order.status}
Трек: <code>${order.track}</code>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Изменить статус заказа', callback_data: `status_${order.id}` }
                        ],
                        [
                            { text: 'Изменить данные заказа', callback_data: `edit_${order.id}` }
                        ]
                    ]
                }
            });

    });
}

// ================= МЕНЮ =================

function mainMenu(chatId) {
    bot.sendMessage(chatId, 'Главное меню:', {
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
    bot.sendMessage(chatId,
        '👑 Админ панель',
        {
            reply_markup: {
                keyboard: [
                    ['Зарегистрировать заказ'],
                    ['База заказов'],
                    ['Главное меню']
                ],
                resize_keyboard: true
            }
        }
    );
}

// ================= START =================

bot.onText(/\/start/, (msg) => {

    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (chatId === ADMIN_CHAT_ID) {
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
    const text = msg.text;
    if (!text) return;

    // ===== АДМИН =====
    if (chatId === ADMIN_CHAT_ID) {

        if (text === 'Главное меню') {
            adminMenu(chatId);
            return;
        }

        if (text === 'Зарегистрировать заказ') {
            temp[chatId] = { step: 'nickname' };
            bot.sendMessage(chatId, 'Никнейм клиента (@ник):');
            return;
        }

        if (temp[chatId]?.step === 'nickname') {
            temp[chatId].nickname = text.replace('@', '');
            temp[chatId].step = 'type';
            bot.sendMessage(chatId, 'Тип заказа:');
            return;
        }

        if (temp[chatId]?.step === 'type') {
            temp[chatId].type = text;
            temp[chatId].step = 'price';
            bot.sendMessage(chatId, 'Цена:');
            return;
        }

        if (temp[chatId]?.step === 'price') {
            temp[chatId].price = text;
            temp[chatId].step = 'model';
            bot.sendMessage(chatId, 'Модель / ссылка:');
            return;
        }

        if (temp[chatId]?.step === 'model') {

    const orders = loadOrders();
    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE))
        : {};

    const clientId = users[temp[chatId].nickname.toLowerCase()];

    if (!clientId) {
        bot.sendMessage(chatId, '❌ Пользователь не найден. Он должен сначала нажать /start');
        temp[chatId] = {};
        return;
    }

    const track = generateTrackNumber(orders);

    const newOrder = {
        id: Date.now(),
        userId: clientId, // 🔥 ВАЖНО
        nickname: temp[chatId].nickname,
        type: temp[chatId].type,
        price: Number(temp[chatId].price),
        model: text,
        status: 'В обработке',
        track: track,
        createdAt: Date.now()
    };

    orders.push(newOrder);
    saveOrders(orders);

    bot.sendMessage(chatId,
        `✅ Заказ создан

@${newOrder.nickname}
Тип: ${newOrder.type}
Цена: ${newOrder.price} ₽
Статус: ${newOrder.status}
Трек: ${newOrder.track}`);

    // уведомление клиенту
    bot.sendMessage(clientId,
        `✅ Заказ зарегистрирован

💰 Сумма: ${newOrder.price} ₽
📍 Статус: ${newOrder.status}
🔎 Трек: ${newOrder.track}`);

    temp[chatId] = {};
    return;
}



        if (text === 'База заказов') {
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

            const orders = loadOrders();

            if (!orders.length) {
                bot.sendMessage(chatId, 'Заказов нет.');
                return;
            }

            orders.forEach(order => {

                bot.sendMessage(chatId,
                    `@${order.nickname}
Тип: ${order.type}
Сумма: ${order.price} ₽
Модель: ${order.model}
Статус: ${order.status}
Трек: <code>${order.track}</code>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Изменить статус заказа', callback_data: `status_${order.id}` }
                                ],
                                [
                                    { text: 'Изменить данные заказа', callback_data: `edit_${order.id}` }
                                ]
                            ]
                        }
                    });

            });

            return;
        }

        if (text === 'Фильтры') {
            bot.sendMessage(chatId, 'Выберите фильтр:', {
                reply_markup: {
                    keyboard: [
                        ['По статусу заказа'],
                        ['По никнейму'],
                        ['По цене'],
                        ['Сначала старые'],
                        ['Сначала новые'],
                        ['Назад']
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }

        if (text === 'По статусу заказа') {

            temp[chatId] = { filterStatus: true };

            bot.sendMessage(chatId, 'Выберите статус:', {
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
            });

            return;
        }

        if (temp[chatId]?.filterStatus) {

            // Кнопка назад
            if (text === 'Назад') {

                bot.sendMessage(chatId, 'Раздел "База заказов"', {
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

            const validStatuses = [
                'В обработке',
                'Отправлен на склад в Китае',
                'Отправлен на склад в Сочи',
                'Готов к получению',
                'Завершен'
            ];

            // Если нажали не статус — игнорируем
            if (!validStatuses.includes(text)) return;

            const orders = loadOrders()
                .filter(o => o.status === text)
                .sort((a, b) => a.createdAt - b.createdAt);

            sendOrdersWithButtons(chatId, orders);

            // 👇 НЕ СБРАСЫВАЕМ temp !!!
            // temp остаётся filterStatus: true

            return;
        }

        if (text === 'По никнейму') {
            temp[chatId] = { filterNickname: true };
            bot.sendMessage(chatId, 'Введите юзернейм пользователя (@никнейм):');
            return;
        }

        if (temp[chatId]?.filterNickname) {

            const nickname = text.replace('@', '').toLowerCase();

            const orders = loadOrders()
                .filter(o => o.nickname.toLowerCase() === nickname)
                .sort((a, b) => a.createdAt - b.createdAt);

            temp[chatId] = {};

            sendOrdersWithButtons(chatId, orders);

            return;
        }

        if (text === 'По цене') {

            temp[chatId] = { filterPrice: true };

            bot.sendMessage(chatId, 'Выберите диапазон:', {
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

            return;
        }

        if (temp[chatId]?.filterPrice) {

            if (text === 'Назад') {
                temp[chatId] = {};
                return;
            }

            const orders = loadOrders();
            let filtered = [];

            if (text === '0-5000')
                filtered = orders.filter(o => o.price >= 0 && o.price <= 5000);

            if (text === '5000-10000')
                filtered = orders.filter(o => o.price > 5000 && o.price <= 10000);

            if (text === '10000-15000')
                filtered = orders.filter(o => o.price > 10000 && o.price <= 15000);

            if (text === '15000-20000')
                filtered = orders.filter(o => o.price > 15000 && o.price <= 20000);

            if (text === '20000+')
                filtered = orders.filter(o => o.price > 20000);

            filtered.sort((a, b) => a.createdAt - b.createdAt);

            temp[chatId] = {};

            sendOrdersWithButtons(chatId, filtered);

            return;
        }

        if (text === 'Сначала старые') {

            const orders = loadOrders()
                .sort((a, b) => a.createdAt - b.createdAt);

            sendOrdersWithButtons(chatId, orders);
            return;
        }

        if (text === 'Сначала новые') {

            const orders = loadOrders()
                .sort((a, b) => b.createdAt - a.createdAt);

            sendOrdersWithButtons(chatId, orders);
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
                order.type = text;

            if (temp[chatId].field === 'Цена')
                order.price = text;

            if (temp[chatId].field === 'Модель/артикул/ссылку')
                order.model = text;

            saveOrders(orders);

            temp[chatId] = {};

            bot.sendMessage(chatId,
                `✅ Данные обновлены

@${order.nickname}
Тип: ${order.type}
Сумма: ${order.price} ₽
Модель: ${order.model}
Статус: ${order.status}
Трек: <code>${order.track}</code>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [
                            ['Главное меню'],
                            ['База заказов'],
                            ['Назад']
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
        mainMenu(chatId);
        return;
    }

    userOrders.forEach(order => {
    bot.sendMessage(chatId,
        `📦 Заказ <code>${order.track}</code>

💰 Сумма: ${order.price} ₽
📍 Статус: ${order.status}`,
        {
            parse_mode: 'HTML'
        }
    );
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
        mainMenu(chatId);
        return;
    }

    userOrders.forEach(order => {
    bot.sendMessage(chatId,
        `📦 Заказ <code>${order.track}</code>

💰 Сумма: ${order.price} ₽
📍 Статус: ${order.status}`,
        {
            parse_mode: 'HTML'
        }
    );
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
                        { text: '📩 Оформить заказ', url: 'https://t.me/MDSDru' }
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
                            [{ text: 'Решить проблему', url: 'https://t.me/MDSDru' }]
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
_нужно написать менеджеру @MDSDru_

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

   });

console.log('Единый бот запущен');

bot.on('callback_query', (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

bot.on('callback_query', (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    bot.answerCallbackQuery(query.id);

    // 🔹 КНОПКА НАЗАД
    if (data === 'back_to_menu') {
        return mainMenu(chatId);
    }

    // 🔹 ВЫБОР ТИПА
    if (data === 'type_clothes') {

        bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: chatId,
                message_id: query.message.message_id
            }
        );

        temp[chatId] = {
            calcStep: 'waitPrice',
            type: 'clothes'
        };

        return bot.sendMessage(chatId, 'Напишите стоимость товара в юанях');
    }

    // 🔹 ИЗМЕНЕНИЕ СТАТУСА
    if (data.startsWith('status_')) {
        const orderId = data.split('_')[1];
        console.log('Меняем статус заказа', orderId);
        return;
    }

    // 🔹 РЕДАКТИРОВАНИЕ
    if (data.startsWith('edit_')) {
        const orderId = data.split('_')[1];
        console.log('Редактируем заказ', orderId);
        return;
    }
});


    // ===== ИЗМЕНИТЬ СТАТУС =====
    if (data.startsWith('status_')) {

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

        bot.sendMessage(chatId, 'Выберите новый статус:', {
            reply_markup: {
                keyboard: [
                    ...available.map(s => [s]),
                    ['Назад']
                ],
                resize_keyboard: true
            }
        });

        return;
    }

    if (data === 'calc') {

        bot.sendMessage(chatId,
            `💰 Калькулятор стоимости

Функция расчета будет доступна в ближайшее время.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Назад', callback_data: 'back_order' }]
                    ]
                }
            });

        return;
    }

    if (data === 'faq') {

        bot.sendMessage(chatId,
            `📌 FAQ

Выберите раздел:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚚 Доставка', callback_data: 'faq_delivery' }],
                        [{ text: '↩️ Возврат', callback_data: 'faq_return' }],
                        [{ text: '📦 Как отследить заказ?', callback_data: 'faq_track' }],
                        { text: '⬅️ Назад', callback_data: 'back_order' }
                    ]
                }
            });

        return;
    }

    if (data === 'back_order') {

        bot.sendMessage(chatId,
            `🛍 Сделать заказ

Выберите действие:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📩 Оформить заказ', url: 'https://t.me/MDSDru' }],
                        [{ text: '💰 Рассчитать стоимость товара', callback_data: 'calc' }],
                        [{ text: '📌 FAQ', callback_data: 'faq' }],
                        [{ text: '⬅️ Назад', callback_data: 'back_main' }]
                    ]
                }
            });

        return;
    }

    // ===== ИЗМЕНИТЬ ДАННЫЕ =====
    if (data.startsWith('edit_')) {

        const id = Number(data.split('_')[1]);
        const order = orders.find(o => o.id === id);
        if (!order) return;

        temp[chatId] = { selectedOrder: id, editingField: true };

        bot.sendMessage(chatId, 'Какие данные изменить?', {
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

        return;
    }

});