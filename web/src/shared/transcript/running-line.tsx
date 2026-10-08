import React from 'react';

export function RunningLine({ children, hitProps }: {
  children: React.ReactNode;
  hitProps: Record<string, unknown>;
}) {
  return (
    <div className="line output running" {...hitProps}>
      {children}
    </div>
  );
}
