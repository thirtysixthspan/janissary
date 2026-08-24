import { statSync } from 'node:fs';
import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import { humanSize } from '../../openers/size.js';
import { audioManifest } from './manifest.js';
import {
  appendTrack, emptyPlaylist, removeTrack, selectTrack, trackIndex,
} from './playlist.js';
import {
  AUDIO_TAB_KEY,
  isAudioPayload,
  isRemoveTrackPayload,
  isSelectTrackPayload,
  type AudioPayload,
  type AudioTrack,
} from './shared.js';

function isPlayable(file: string): boolean {
  const extension = path.extname(file).toLowerCase();
  return audioManifest.fileExtensions[extension as keyof typeof audioManifest.fileExtensions]
    !== undefined;
}

function sizeOf(file: string): string {
  try {
    return humanSize(statSync(file).size);
  } catch {
    // The dispatcher checks existence first; a race with deletion still yields a usable playlist.
    return 'unknown';
  }
}

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  const name = path.basename(file);
  const player = capabilities.configuredViewer();
  if (player && capabilities.openExternally(file, player)) {
    capabilities.note(`Opening ${name} in ${player}…`);
    return;
  }
  if (capabilities.openExternally(file)) {
    capabilities.note(`Opening ${name} in your default audio player…`);
    return;
  }
  capabilities.note(`No audio player available. The file is at ${file}`);
}

export function activate(): TabPluginActivation {
  // The plugin's own record of the singleton tab's queue, so an `open` that appends knows what it is
  // appending to — an `updateTab` factory is handed no current payload. It is refreshed from the
  // host's own `tabPayload` on every intent, and reset whenever the opener actually creates the tab,
  // so a tab the user closed and reopened starts from an empty queue rather than a stale one.
  let playlist = emptyPlaylist();

  const queue = (file: string, capabilities: TabPluginServerCapabilities): void => {
    const name = path.basename(file);
    const size = sizeOf(file);
    const track = (url: string): AudioTrack => ({ name, path: file, url });
    let created = false;
    capabilities.openOrFocusTab(AUDIO_TAB_KEY, (resources) => {
      created = true;
      playlist = appendTrack(emptyPlaylist(), track(resources.registerFile(file)), size);
      return { title: 'audio', payload: playlist };
    });
    if (created) return;
    capabilities.updateTab(AUDIO_TAB_KEY, (resources) => {
      playlist = appendTrack(playlist, track(resources.registerFile(file)), size);
      return { payload: playlist };
    });
  };

  const push = (
    next: AudioPayload, capabilities: TabPluginServerCapabilities,
  ): null => {
    playlist = next;
    capabilities.updateTab(AUDIO_TAB_KEY, () => ({ payload: next }));
    return null;
  };

  return {
    isPayload: isAudioPayload,
    // `audio <path>` is a second route into this plugin's own opener, not a second behavior: the
    // host runs its ordinary open pipeline pinned to the audio opener, so path resolution, wildcard
    // expansion, the ten-file limit, and missing-file errors are all identical to `open <path>`.
    command: (argument, capabilities) => {
      if (!argument) return capabilities.rejectRequest('Usage: audio <path>');
      capabilities.openClaimedFiles(argument);
    },
    // The navigator's "Add to playlist" for a multi-row selection. Each path goes through the same
    // open pipeline a wildcard does, so queueing several rows and queueing a glob are one behavior.
    selectionAction: (paths, capabilities) => {
      for (const file of paths) capabilities.openClaimedFiles(file);
    },
    opener: {
      external: openExternal,
      inline: (file, capabilities) => {
        if (isPlayable(file)) queue(file, capabilities);
        else openExternal(file, capabilities);
      },
    },
    intent: (request, capabilities) => {
      const tabPayload = request.tabPayload;
      if (!isAudioPayload(tabPayload)) {
        // The tab payload is the host's own record, not client input, so a bad one means this plugin
        // produced something invalid — a real failure rather than a request worth answering.
        return capabilities.reportFailure('invalid audio tab payload');
      }
      if (request.intent === 'select-track') {
        if (!isSelectTrackPayload(request.payload)) {
          return capabilities.rejectRequest('invalid select-track payload');
        }
        const index = trackIndex(tabPayload, request.payload.path);
        if (index === -1) return capabilities.rejectRequest('select-track names no queued track');
        return push(selectTrack(tabPayload, index, sizeOf(tabPayload.tracks[index].path)), capabilities);
      }
      if (request.intent === 'remove-track') {
        const payload = request.payload;
        if (!isRemoveTrackPayload(payload)) {
          return capabilities.rejectRequest('invalid remove-track payload');
        }
        const index = trackIndex(tabPayload, payload.path);
        if (index === -1) return capabilities.rejectRequest('remove-track names no queued track');
        // The one thing that separates a dropped track from a hand removal: the queue takes the
        // identical path either way, and the drop additionally names itself in the notifications
        // feed. The player stays silent, so a playlist shedding a file never interrupts playback.
        if (payload.unplayable) {
          capabilities.notifyUser(`Dropped ${tabPayload.tracks[index].name} — it could not be played.`);
        }
        return push(removeTrack(tabPayload, index, (track) => sizeOf(track.path)), capabilities);
      }
      return capabilities.rejectRequest(`unknown audio intent "${request.intent}"`);
    },
  };
}
