import type { Command } from './types.js';
import { command as agent } from './agent.js';
import { command as next } from './next.js';
import { command as message } from './msg.js';
import { command as broadcast } from './broadcast.js';
import { command as acp } from './acp.js';
import { command as acpReset } from './acp-reset.js';
import { command as database } from './db.js';
import { command as browser } from './browser.js';
import { command as connection } from './connection.js';
import { command as clear } from './clear.js';
import { command as state } from './state.js';
import { command as hist } from './hist.js';
import { command as close } from './close.js';
import { command as quit } from './quit.js';
import { command as schedule } from './schedule.js';
import { command as profile } from './profile.js';
import { command as open } from './open.js';
import { command as edit } from './edit.js';
import { command as send } from './send.js';
import { command as rename } from './rename.js';
import { monitor, unmonitor, monitors } from './monitor.js';

export const commands: Command[] = [
  agent,
  next,
  message,
  broadcast,
  acpReset,
  acp,
  database,
  browser,
  connection,
  clear,
  state,
  hist,
  close,
  quit,
  schedule,
  profile,
  open,
  edit,
  send,
  rename,
  monitors,
  monitor,
  unmonitor,
];

export type { Command } from './types.js';
