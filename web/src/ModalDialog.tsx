import React from 'react';

export function ModalDialog({ dialogRef, title, children }: { dialogRef: React.RefObject<HTMLDivElement | null>; title: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
