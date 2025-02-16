'use strict';

const _ = require('lodash');
const { Sequelize, DataTypes } = require('sequelize');
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.js').config;


const sequelize = new Sequelize(config.dbUrl, { logging: false });


(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
})();


const Chat = sequelize.define(
    "Chat",
    {
        telegram_id: DataTypes.STRING,
        chat_type: DataTypes.ENUM("private", "group", "supergroup"),
        random_chance: {
            type: DataTypes.INTEGER,
            defaultValue: 10,
        },
    },
    {
        indexes: [
            {
                fields: ["telegram_id"]
            },
        ],
    }
);

Chat.getChat = async function (tg_message) {
    let chat = tg_message.chat;
    let tg_id = chat.id;
    let response = await Chat.findOrCreate({
        where: {
            telegram_id: tg_id.toString(),
        },
    });
    return response[0];
}


const Reply = sequelize.define(
    "Reply",
    {
        counter: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        indexes: [
            {
                fields: ["PairId"],
            },
        ],
    }
);


const Word = sequelize.define(
    "Word",
    {
        word: DataTypes.STRING,
    },
    {
        indexes: [
            {
                unique: true,
                fields: ["word"],
                operator: "varchar_pattern_ops",
            },
        ],
    }
);

Word.learn = async function (array) {
    let uniqArray = array.filter(
        (word, idx) => array.indexOf(word) === idx
    );
    let wordsFromBase = await this.findAll({
        where: {
            word: uniqArray,
        },
    });

    let oldWords = wordsFromBase.reduce((acc, word) => {
        acc[word.get("word")] = word;

        return acc;
    }, {});
    let newWords = uniqArray.filter((word) => !oldWords[word]);

    if (newWords.length) {
        let result = await this.bulkCreate(
            newWords.map((word) => ({ word }))
        );
        return {
            ...oldWords,
            ...result.reduce((acc, word) => {
                acc[word.get("word")] = word;

                return acc;
            }, {}),
        };
    } else {
        return oldWords;
    }
}


const Pair = sequelize.define(
    'Pair',
    {},
    {
        indexes: [
            {
                fields: ['ChatId', 'firstId', 'secondId'],
            },
            {
                fields: ['ChatId'],
            },
        ],
    },
);

Pair.learn = async function (message) {
    let self = this;
    let response = await Word.learn(message.words);
    let words = message.words.reduce(
        (acc, word) => {
            acc.push(response[word].get('id'));
            if (config.punctuation.endSentence.includes(word[word.length - 1])) {
                acc.push(null);
            }

            return acc;
        },
        [null],
    );

    if (words[words.length - 1] !== null) words.push(null);

    while (_.size(words)) {
        let [first, second, last] = _.take(words, 3);
        words.shift();
        second = _.defaultTo(second, null)
        last = _.defaultTo(last, null)
        try {
            let pair = (await self.findOrCreate({
                where: {
                    ChatId: message.chat.get('id'),
                    firstId: first,
                    secondId: second,
                },
                include: [{ model: Reply, all: true }],
            }))[0];

            let reply = _.find(pair.Replies, function (reply) {
                return reply.get('WordId') === last;
            });

            if (!reply) {
                pair.createReply({
                    PairId: pair.get('id'),
                    WordId: last,
                });
            } else {
                reply.increment('counter');
            }
        } catch (e) {
            console.log(e);
        }
    }
}

Pair.getPair = async function (chatId, firstId, secondId) {
    let self = this;
    let pair = null;
    pair = await self.findAll({
        where: {
            ChatId: chatId,
            firstId: firstId,
            secondId: secondId,
        },
        include: [
            {
                model: Reply,
                all: true,
                nested: true,
                limit: 3,
                separate: false,
            },
        ],
        order: [[Reply, 'counter', 'DESC']],
        limit: 3,
    });
    return _.sample(pair);
}

Pair.generate = async function (message) {
    let self = this;
    let usingWords = _.difference(message.words, config.punctuation.endSentence.split(''));

    let response = await Word.findAll({
        where: {
            word: usingWords,
        },
    });
    let wordIds = _.map(response, function (result) {
        return result.get('id');
    });
    let sentences = _.random(0, 3) + 1;
    let result = [];

    let generateSentence = async function (message) {
        let sentence = '';
        let safety_counter = 50;
        let safeGetter = { get: () => null };
        let firstWord = null;
        let secondWord = wordIds;
        let pair = await self.getPair(message.chat.get('id').toString(), firstWord, secondWord);
        while (pair && safety_counter) {
            safety_counter--;
            let reply = _.sample(pair.Replies);
            firstWord = (pair.get('second') || safeGetter).get('id');
            secondWord = (reply.get('Word') || safeGetter).get('id');
            if (!_.size(sentence)) {
                sentence = _.capitalize((pair.get('second') || safeGetter).get('word') + ' ');
                wordIds = _.difference(wordIds, [(pair.get('second') || safeGetter).get('id')]);
            }

            if (_.size((reply.get('Word') || safeGetter).get('word'))) {
                sentence = sentence + reply.get('Word').get('word') + ' ';
            } else {
                break;
            }
            pair = await self.getPair(message.chat.id.toString(), firstWord, secondWord);
        }

        if (_.size(sentence)) {
            sentence = _.trim(sentence);
            if (_.indexOf(config.punctuation.endSentence, _.last(sentence)) < 0) {
                sentence += _.sample(config.punctuation.endSentence.split(''));
            }
        }
        return sentence;
    };

    for (let i = 0; i < sentences; i++) {
        let tempSentence = await generateSentence(message);
        result.push(tempSentence);
    }

    return result;
}


Chat.hasMany(Pair);
Reply.belongsTo(Pair);
Reply.belongsTo(Word);
Pair.belongsTo(Chat);
Pair.belongsTo(Word, { as: 'first' });
Pair.belongsTo(Word, { as: 'second' });
Pair.hasMany(Reply);


module.exports = { Chat, Pair, Reply, Word, sequelize };;
