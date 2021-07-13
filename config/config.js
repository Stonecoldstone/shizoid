module.exports.config = {
  token: process.env.TELEGRAMTOKEN,
  myId: parseInt(process.env.TELEGRAMTOKEN.split(":")[0]),
  punctuation: {
    endSentence: ".!?",
    all: ".!?;:,",
  },
  dbUrl: `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:5432/${process.env.DB_DBNAME}`,
  //db: {
  //  dialect: "postgres",
  //  username: process.env.DB_USERNAME,
  //  password: process.env.DB_PASSWORD,
  //  database: process.env.DB_DBNAME,
  //  host: process.env.DB_HOST,
  //  port: 5432,
  //  logging: console.log,
  //},
  debug: true,
};
