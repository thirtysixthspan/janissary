// The dialog's field values, assembled into the equivalent `schedule …` command.
export type ScheduleType = 'at' | 'on' | 'every' | 'everyDay' | 'everyWeekday';

export type ScheduleFields = {
  name: string;
  target: string;
  activeTarget: string;
  command: string;
  type: ScheduleType;
  time: string;
  date: string;
  interval: string;
  weekday: string;
};

// Assemble the `schedule NAME [in TAB] <form> COMMAND` command string from the dialog's field
// values, submitted through the normal `command` RPC so the server's existing parsing/validation/
// firing runs unchanged.
//
// Values are inserted verbatim, NOT shell-quoted, matching `buildHarnessLaunchCommand`'s contract:
// this string is re-parsed by the server's whitespace-splitting `parseScheduleCommand`, which does
// not unquote — so quoting a value would corrupt it rather than protect an embedded space.
export function buildScheduleCommand(fields: ScheduleFields): string {
  const inClause = fields.target === fields.activeTarget ? [] : ['in', fields.target];
  const parts = ['schedule', fields.name, ...inClause, ...formParts(fields), fields.command];
  return parts.join(' ');
}

function formParts(fields: ScheduleFields): string[] {
  switch (fields.type) {
    case 'at': { return ['at', fields.time];
    }
    case 'on': { return fields.time ? ['on', fields.date, 'at', fields.time] : ['on', fields.date];
    }
    case 'every': { return ['every', fields.interval];
    }
    case 'everyDay': { return ['every', 'day', 'at', fields.time];
    }
    case 'everyWeekday': { return ['every', fields.weekday, 'at', fields.time];
    }
  }
}
