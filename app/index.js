require('dotenv').config();

const Telegraf = require('telegraf');
const { config } = require('../config/config.js');
const models = require('../models');
const forgetMiddleware = require('./middlewares/forgetMiddleware.js');
const setupCommands = require('./commands/index.js');
const { setupMessageProcessor } = require('./helpers/messageProcessor.js');

const bot = new Telegraf(config.token);

bot.use(async (_, next) => {
    try {
        await next();
    } catch (e) {
        console.log('uncaught', e);
    }
})
bot.use(forgetMiddleware);

console.log('Setting up commands.');
setupCommands(bot);
console.log('Setting up message processor');
setupMessageProcessor(bot);

const init = async () => {
    console.log('before sync');
    await models.sequelize.sync();
    console.log('DB init');
    bot.launch();
}

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
//process.on('uncaughtException', exitHandler);

function exitHandler() {
    console.log('Exit handler');
    models.sequelize.close();
    process.exit(0);
}

init();
