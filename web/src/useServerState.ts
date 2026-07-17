import { useEffect, useState } from 'react';
import type React from 'react';
import type { JanusClient } from './ws';
import type { TabView, RouteChooserView, HarnessLaunchView, TaskRow } from '@shared/protocol';
import { useProjectTitle } from './useProjectTitle';

type Setters = {
  setTabs: (tabs: TabView[]) => void;
  setActiveTab: (index: number) => void;
  setRoute: (route: RouteChooserView | null) => void;
  setHarnessLaunch: (view: HarnessLaunchView | null) => void;
  setTabNameMaxLength: (length: number) => void;
  setGlobalHistory: (history: string[]) => void;
  setSyntaxTheme: (theme: string) => void;
  setTheme: (theme: string) => void;
  setTasks: (tasks: TaskRow[]) => void;
  setJanissaryTasksDir: (dir: string) => void;
  setProfiles: (profiles: string[]) => void;
  setRouteIndex: (index: number) => void;
  routeRef: React.RefObject<RouteChooserView | null>;
};

// Subscribes App to server state snapshots, fanning each field out to its setter. Split out of
// App.tsx to keep it under the file-size limit. Also mirrors `projectDir` into the titlebar, since
// that field has no other consumer in `App.tsx`.
export function useServerState(client: JanusClient, setters: Setters): void {
  const {
    setTabs, setActiveTab, setRoute, setHarnessLaunch, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTheme, setTasks, setJanissaryTasksDir, setProfiles, setRouteIndex, routeRef,
  } = setters;
  const [projectDir, setProjectDir] = useState('');
  const [version, setVersion] = useState('');
  useProjectTitle(projectDir, version);
  useEffect(() => client.onState((nextTabs, active, nextRoute, nextTabNameMaxLength, nextGlobalHistory, nextSyntaxTheme, nextTheme, nextTasks, nextJanissaryTasksDir, nextProfiles, nextProjectDir, nextVersion, nextHarnessLaunch) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setRoute(nextRoute);
    setHarnessLaunch(nextHarnessLaunch);
    setTabNameMaxLength(nextTabNameMaxLength);
    setGlobalHistory(nextGlobalHistory);
    setSyntaxTheme(nextSyntaxTheme);
    setTheme(nextTheme);
    setTasks(nextTasks);
    setJanissaryTasksDir(nextJanissaryTasksDir);
    setProfiles(nextProfiles);
    setProjectDir(nextProjectDir);
    setVersion(nextVersion);
    // Highlight the first option when a chooser newly opens (or its command changes).
    const previous = routeRef.current;
    routeRef.current = nextRoute;
    if (nextRoute && (!previous || previous.cmd !== nextRoute.cmd)) setRouteIndex(0);
  }), [
    client, setTabs, setActiveTab, setRoute, setHarnessLaunch, setTabNameMaxLength, setGlobalHistory, setSyntaxTheme, setTheme, setTasks, setJanissaryTasksDir, setProfiles, setRouteIndex, routeRef,
  ]);
}
