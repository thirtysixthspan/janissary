import { useEffect, useRef, useState, type FocusEvent, type RefObject } from 'react';

type FocusableRef = RefObject<HTMLElement | null>;

export function useRolePickerFocus(canOpen: boolean, fallbackRef: FocusableRef) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const openerHadFocus = useRef(false);
  const wasOpen = useRef(false);
  const wasAvailable = useRef(canOpen);

  useEffect(() => {
    if (open) {
      firstControlRef.current?.focus();
    } else if (wasOpen.current) {
      if (canOpen && openerRef.current?.isConnected) openerRef.current.focus();
      else {
        openerHadFocus.current = false;
        fallbackRef.current?.focus();
      }
    } else if (wasAvailable.current && !canOpen && openerHadFocus.current) {
      openerHadFocus.current = false;
      fallbackRef.current?.focus();
    }
    wasOpen.current = open;
    wasAvailable.current = canOpen;
  }, [canOpen, fallbackRef, open]);

  useEffect(() => {
    if (open && !canOpen) setOpen(false);
  }, [canOpen, open]);

  const onOpenerBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.relatedTarget !== null) openerHadFocus.current = false;
  };

  return {
    open,
    openerRef,
    firstControlRef,
    openPicker: () => {
      if (canOpen) setOpen(true);
    },
    closePicker: () => setOpen(false),
    onOpenerFocus: () => { openerHadFocus.current = true; },
    onOpenerBlur,
  };
}
