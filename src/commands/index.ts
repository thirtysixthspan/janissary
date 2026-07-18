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
import { command as newFile } from './new-file.js';
import { command as send } from './send.js';
import { command as queue } from './queue.js';
import { command as rename } from './rename.js';
import { command as search } from './search.js';
import { command as files } from './files.js';
import { command as notifications } from './notifications.js';
import { command as schedules } from './schedules.js';
import { command as notify } from './notify.js';
import { command as syntax } from './syntax.js';
import { command as theme } from './theme.js';
import { command as tasks } from './tasks.js';
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
  newFile,
  send,
  queue,
  rename,
  search,
  files,
  notifications,
  schedules,
  notify,
  syntax,
  theme,
  tasks,
  monitors,
  monitor,
  unmonitor,
];

export type { Command } from './types.js';
