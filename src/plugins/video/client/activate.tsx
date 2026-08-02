import React from 'react';
import { TAB_PLUGIN_API_VERSION, type TabPluginClientComponentProperties } from '../../api';
import { videoManifest } from '../manifest';
import { isVideoPayload } from '../shared';
import { VideoTab } from './VideoTab';
import './video.css';

function VideoPluginView({ payload, capabilities }: TabPluginClientComponentProperties) {
  if (!isVideoPayload(payload)) throw new Error('video tab payload is invalid');
  return <VideoTab video={payload} capabilities={capabilities} />;
}

export function activate() {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: videoManifest.payloadSchemaVersion,
    validateTabPayload: isVideoPayload,
    component: VideoPluginView,
  };
}
