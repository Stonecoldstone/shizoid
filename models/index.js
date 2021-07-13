'use strict';

var fs = require('fs');
var path = require('path');
var Sequelize = require('sequelize');
var basename = path.basename(module.filename);
var env = process.env.NODE_ENV || 'development';
var config = require(__dirname + '/../config/config.js').config;
var Chat = require('./chat.js');
var Pair = require('./pair.js');
var Reply = require('./reply.js');
var Word = require('./word.js');
var db = { Chat, Pair, Reply, Word };

var sequelize = new Sequelize(config.dbUrl);

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
}

Object.keys(db).forEach(function (modelName) {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;

module.exports = db;
