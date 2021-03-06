'use strict';
import { Client } from 'discord.js';
import { Subject } from 'rxjs';
import { Message } from '../model/message';

export class Bot {
  constructor(logger) {
    this.logger = logger;
    this.logger.debug('Creating bot.');

    this.commands = new Subject();
    this.incoming = new Subject();

    this.parsers = [];
    this.handlers = [];
    this.filters = [];

    this.client = new Client();
  }

  /**
   * Starts the bot service, attaches event handlers.
   */
  async start() {
    this.logger.debug('Starting bot.');

    const streamError = (err) => {
      this.logger.error(err, 'bot stream did not handle error');
    };

    this.commands.subscribe((next) => this.handleCommand(next).catch(streamError));
    this.incoming.subscribe((next) => this.handleIncoming(next).catch(streamError));

    this.client.on('ready', () => this.logger.debug('Discord listener is ready'));
    this.client.on('message', (input) => this.convertMessage(input).then((msg) => this.incoming.next(msg)));

    this.client.login(process.env.DISCORD_TOKEN);
  }

  /**
   * Stops the bot, completes the observables, removes event listeners.
   */
  async stop() {
    this.commands.complete();
    this.incoming.complete();

    this.client.removeAllListeners('ready');
    this.client.removeAllListeners('message');
    await this.client.destroy();
  }

  /**
   * Runs the message through parsers, pushes generated commands to the observable.
   * @param {*} msg message to parse
   */
  async handleIncoming(msg) {
    await Promise.all(this.filters.forEach(async (filter) => {
      if (await filter.check(msg)) {
        return;
      }
    }));

    this.parsers.forEach(async (parser) => {
      if (await parser.check(msg)) {
        try {
          await msg.save();
          const command = await parser.parse(msg);
          this.commands.next(command);
          return;
        } catch (err) {
          console.log(err);
          this.logger.error('Parser failed to parse the message');
        }
      }
    });

    this.logger.debug({ msg }, 'Message did not produce any commands');
  }

    /**
   * Runs the message through handlers.
   * @param {*} cmd command to handle
   */
  async handleCommand(cmd) {
    this.handlers.forEach(async (handler) => {
      if (await handler.check(cmd)) {
        try {
          return await handler.handle(cmd);
        } catch (err) {
          console.log(err);
          this.logger.error('Handler failed to handle the message');
        }
      }
    });

    this.logger.debug({ cmd }, 'Command was not handled');
  }

  /**
   * Converts the discord message to a message entity.
   * @param {*} msg message to convert
   */
  async convertMessage(msg) {
    this.logger.debug({ msg }, 'Converting discord message');

    return await new Message({
      author: msg.author.id,
      body: msg.content,
      channel: msg.channel.id,
      createdAt: msg.createdAt,
      id: msg.id,
      reactions: msg.reactions.map((r) => r.emoji.name)
    });
  }

  /**
   * Registers a service in the bot
   * @param {*} serviceDefinition service definition to register
   * @param {*} options service options
   */
  registerService(serviceDefinition, serviceType, options) {
    const service = new serviceDefinition(this.client, this.logger, options);
    switch(serviceType) {
      case 'parser':
        this.parsers.push(service);
        break;
      case 'handler':
        this.handlers.push(service);
        break;
      case 'filter':
        this.filters.push(service);
        break;
    }

    this.logger.debug(`Registered service: ${service.options.name}`);
  }
}
