import { useEffect } from 'react';
import type React from 'react';
import type { JanusClient } from './ws';
import type { TabView, RouteChooserView, TaskRow } from '@shared/protocol';

type Setters = {
  setTabs: (tabs: TabView[]) => void;
  setActiveTab: (index: number) => void;
  setRoute: (route: RouteChooserView | null) => void;
  setTabNameMaxLength: (length: number) => void;
  setGlobalHistory: (history: string[]) => void;
  setSyntaxTheme: (theme: string) => void;
  setTasks: (tasks: TaskRow[]) => void;
  setRouteIndex: (index: number) => void;
  routeRef: React.RefObject<RouteChooserView | null>;
};

// Subscribes App to server state snapshots, fanning each field out to its setter. Split out of
// App.tsx to keep it under the file-size limit.
export function useServerState(client: JanusClient, setters: Setters): void {
  const {
    setTabs, setActiveTab, setRoute, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTasks, setRouteIndex, routeRef,
  } = setters;
  useEffect(() => client.onState((nextTabs, active, nextRoute, nextTabNameMaxLength, nextGlobalHistory, nextSyntaxTheme, nextTasks) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
    setTabNameMaxLength(nextTabNameMaxLength);
    setGlobalHistory(nextGlobalHistory);
    setSyntaxTheme(nextSyntaxTheme);
    setTasks(nextTasks);
    // Highlight the first option when a chooser newly opens (or its command changes).
    const previous = routeRef.current;
    routeRef.current = nextRoute;
    if (nextRoute && (!previous || previous.cmd !== nextRoute.cmd)) setRouteIndex(0);
  }), [
    client, setTabs, setActiveTab, setRoute, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTasks, setRouteIndex, routeRef,
  ]);
}
