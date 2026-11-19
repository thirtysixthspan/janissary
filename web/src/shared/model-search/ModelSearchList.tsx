import { highlightRanges } from '../line-find/LineFind';

export type ModelSearchRow = { id: string; ranges: [number, number][] };

type Properties = {
  rows: ModelSearchRow[];
  highlighted: number | null;
  blank: boolean;
  onHover: (index: number) => void;
  onPick: (id: string) => void;
};

export function ModelSearchList({ rows, highlighted, blank, onHover, onPick }: Properties) {
  if (rows.length === 0) {
    return (
      <div className="model-search-list">
        <div className="model-search-row model-search-muted">
          {blank ? 'type to search' : 'No matching models'}
        </div>
      </div>
    );
  }
  return (
    <div className="model-search-list">
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`model-search-row${index === highlighted ? ' highlighted' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(row.id)}
          onMouseEnter={() => onHover(index)}
        >
          {highlightRanges(row.id, row.ranges)}
        </div>
      ))}
    </div>
  );
}
