'use strict';
import 'babel-polyfill';
import * as dotenv from 'dotenv';
import { isNil } from 'lodash';
import { Bot } from './core/bot';
import { loadConfig } from './core/config';
import { createDatabase } from './core/database';
import { createLogger } from './core/logger';

import { EchoParser } from './parser/echoParser';
import { SplitParser } from './parser/splitParser';
import { EchoHandler } from './handler/echoHandler';
import { UrbanHandler } from './handler/urbanHandler';
import { UserActionHandler } from '../build/handler/userActionHandler';
import { DefineHandler } from './handler/defineHandler';
import { BadWordFilter } from './filter/badWordFilter';

dotenv.config();

const logger = createLogger();
const config = loadConfig('./build/config.yml');
const database = createDatabase();
const bot = new Bot(logger);

database.sequelize.authenticate().then((errors) => {
  if (!isNil(errors)) {
    logger.error({ errors }, 'Failed to connect to database');
    process.exit();
  }
});

// register parsers
bot.registerService(EchoParser, 'parser', config.parsers.echoParser);
bot.registerService(SplitParser, 'parser', config.parsers.splitParser);

// register handlers
bot.registerService(EchoHandler, 'handler', config.handlers.echoHandler);
bot.registerService(UserActionHandler, 'handler', config.handlers.userActionHandler);
bot.registerService(UrbanHandler, 'handler', config.handlers.urbanHandler);
bot.registerService(DefineHandler, 'handler', config.handlers.defineHandler);

// register filters
bot.registerService(BadWordFilter, 'filter', config.filters.badWordFilter);

if (process.argv[2] === 'sync') {
  try {
    database.sequelize.sync(); 
  } catch (err) {
    logger.error(err);
  }
}

process.on('exit', () => {
  bot.stop();
});

bot.start();
