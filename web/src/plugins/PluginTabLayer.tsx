import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { tabBodyBorder } from '../tab-body-border';
import { PluginBody } from './PluginBody';

// The host-owned frame around one plugin tab: the `.tab-body` element, its focus border, its split
// grid column, and the display toggle that keeps a hidden plugin tab mounted. A plugin never renders
// or styles any of this, and its own body is confined to the children of this element.
export function PluginTabLayer({
  tab,
  index,
  current,
  visible,
  client,
  onSplit,
}: {
  tab: TabView;
  index: number;
  current: TabView;
  visible: boolean;
  client: JanusClient;
  onSplit?: () => void;
}) {
  return (
    <div
      className="tab-body"
      data-pane-index={index}
      style={{
        borderLeft: tabBodyBorder(tab.dotColor, tab.label === current.label),
        display: visible ? 'flex' : 'none',
        gridColumn: tab.pane === 'right' ? 2 : 1,
        gridRow: 2,
      }}
    >
      {tab.plugin && (
        <PluginBody plugin={tab.plugin} label={tab.label} client={client} onSplit={onSplit} />
      )}
    </div>
  );
}
