// The dialog's field values, assembled into the equivalent `schedule …` command.
export type ScheduleType = 'at' | 'on' | 'every' | 'everyDay' | 'everyWeekday';
export type ScheduleTarget = { kind: 'tab'; label: string } | { kind: 'system' };

export type ScheduleFields = {
  name: string;
  target: ScheduleTarget;
  activeTarget: string;
  command: string;
  script: string;
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
  if (fields.target.kind === 'system') {
    return ['schedule', 'system', fields.name, ...formParts(fields), 'script', fields.script].join(' ');
  }
  const inClause = fields.target.label === fields.activeTarget ? [] : ['in', fields.target.label];
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
