'use strict';

var fs = require('fs');
var path = require('path');
const _ = require('lodash');
var { Sequelize, DataTypes } = require('sequelize');
var basename = path.basename(module.filename);
var env = process.env.NODE_ENV || 'development';
var config = require(__dirname + '/../config/config.js');
var Reply = require('./reply.js');
var Word = require('./word.js');

var sequelize = new Sequelize(config.config.dbUrl);

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
}

var Chat = sequelize.define(
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
      classMethods: {
        associate: function (models) {
          Chat.hasMany(models.Pair);
        },
        getChat: async function (tg_message) {
          let chat = tg_message.chat;
          let tg_id = chat.id;
          let response = await Chat.findOrCreate({
            where: {
              telegram_id: tg_id.toString(),
            },
          });

          return response[0];
        },
      },
    }
);

var Pair = sequelize.define(
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
            classMethods: {
                associate: function (models) {
                    Pair.belongsTo(models.Chat);
                    Pair.belongsTo(models.Word, { as: 'first' });
                    Pair.belongsTo(models.Word, { as: 'second' });
                    Pair.hasMany(models.Reply);
                },
                learn: async function (message) {
                    let self = this;
                    let Word = sequelize.import('./word');
                    let Reply = sequelize.import('./reply');
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
                        try {
                            let pair = (
                                await self.findOrCreate({
                                    where: {
                                        ChatId: message.chat.get('id'),
                                        firstId: first,
                                        secondId: second,
                                    },
                                    include: [{ model: Reply, all: true }],
                                })
                            )[0];

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
                },
                getPair: async function (chatId, firstId, secondId) {
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
                                model: sequelize.import('./reply'),
                                all: true,
                                nested: true,
                                limit: 3,
                                separate: false,
                            },
                        ],
                        order: [[sequelize.import('./reply'), 'counter', 'DESC']],
                        limit: 3,
                    });

                    return _.sample(pair);
                },
                generate: async function (message) {
                    let self = this;
                    let Word = sequelize.import('./word');
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
                },
            },
        },
);


var Reply = sequelize.define(
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
      classMethods: {
        associate: function (models) {
          Reply.belongsTo(models.Pair);
          Reply.belongsTo(models.Word);
        },
      },
    }
);

var Word = sequelize.define(
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
      classMethods: {
        learn: async function (array) {
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
        },
      },
    }
);


var db = { Chat, Pair, Reply, Word };

Object.keys(db).forEach(function (modelName) {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;

module.exports = db;
