import React from 'react';

type Properties = {
  dialogRef?: React.RefObject<HTMLDivElement | null>;
  title: string;
  children: React.ReactNode;
  modal?: boolean;
  className?: string;
};

export function ModalDialog({ dialogRef, title, children, modal = true, className }: Properties) {
  const dialog = (
    <div
      ref={dialogRef}
      className={`modal${className ? ` ${className}` : ''}`}
      role={modal ? 'alertdialog' : 'dialog'}
      aria-modal={modal ? 'true' : 'false'}
      tabIndex={modal ? -1 : undefined}
    >
      <div className="modal-title">{title}</div>
      {children}
    </div>
  );
  return modal ? <div className="modal-backdrop">{dialog}</div> : dialog;
}
