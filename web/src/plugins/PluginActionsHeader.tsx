import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const DockedActionsContext = createContext<HTMLSpanElement | null | undefined>(undefined);

export function PluginActionsHeader({ children, className }: {
  children: ReactNode;
  className: string;
}) {
  const target = useContext(DockedActionsContext);
  if (target === null) return null;
  if (target !== undefined) return createPortal(children, target);
  return <div className={className}>{children}</div>;
}
