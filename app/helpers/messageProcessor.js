const models = require("../../models");

class MessageProcessor {
  ctx = null;
  words = null;
  chat = null;
  text = null;
  message = null;

  constructor(ctx, text) {
    this.ctx = ctx;
    this.message = ctx.message;
    this.text = text || this.message.text;
    this.words = this.getWords();
  }

  getWords() {
    let text = this.text.slice();
    if (this.message.entities) {
      const { entities } = this.message;
      for (const entity of entities) {
        text = text.replace(this.text.substr(entity.offset, entity.length), "");
      }
    }

    return text.split(/\s+|\n/).map((word) => word.toLowerCase());
  }

  isReplyToBot() {
    return (
      this.ctx.message.reply_to_message &&
      this.ctx.message.reply_to_message.from.id === this.ctx.botInfo.id
    );
  }

  hasAnchors() {
    return this.notEmpty() && this.text.toLowerCase().includes("шизик");
  }

  notEmpty() {
    return this.text.length > 0;
  }

  async process() {
    this.chat = await models.Chat.getChat(this.message);
    if (this.notEmpty()) {
      await models.Pair.learn(this);
      console.log('Processing msg');
      if (this.hasAnchors() || this.isReplyToBot() || this.randomOK()) {
        console.log('Generating answer');
        this.ctx.replyWithChatAction("typing");
        let replyArray = await this.generateAnswer();
        if (!replyArray.length || !replyArray[0].length) {
          return;
        }

        let reply = replyArray.join(" ");

        if (reply) {
          this.ctx.reply(reply);
        }
      }
    }
  }

  randomOK() {
    const rng = Math.floor(Math.random() * 100);
    let chance = parseInt(this.chat.random_chance);
    console.log(rng);
    console.log(chance);
    return rng <= chance;
  }

  async generateAnswer() {
    if (!this.chat) {
      this.chat = await models.Chat.getChat(this.message);
    }

    return models.Pair.generate(this);
  }
}

const setupMessageProcessor = (bot) => {
  bot.on("text", (ctx) => {
    let mp = new MessageProcessor(ctx);
    mp.process();
  });
};

module.exports = { MessageProcessor, setupMessageProcessor };
