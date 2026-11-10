export type DocumentRead = {
  isCurrent: () => boolean;
  cancel: () => void;
};

// Tracks which read of the editor's file is the live one. Starting a read supersedes every earlier
// one, so a slow response for an older read can tell it must not touch the buffer.
export class DocumentReads {
  private generation = 0;

  begin(): DocumentRead {
    const mine = ++this.generation;
    return {
      isCurrent: () => this.generation === mine,
      cancel: () => {
        if (this.generation === mine) this.generation += 1;
      },
    };
  }
}
