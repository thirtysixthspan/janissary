import React from 'react';
import type { ParsedToolCall } from './activity-text';

export function ToolCallBlock({ calls }: { calls: ParsedToolCall[] }) {
  return (
    <div className="connections-tool-calls">
      {calls.map((call, index) => (
        <div className="connections-tool-call" key={index}>
          <div className="connections-tool-call-name">{call.name}</div>
          {call.parameters.map((parameter, parameterIndex) => (
            <div className="connections-tool-call-parameter" key={parameterIndex}>
              <span className="connections-tool-call-parameter-name">{parameter.name}</span>
              {parameter.value}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
