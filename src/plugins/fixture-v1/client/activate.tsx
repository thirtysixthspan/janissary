import React from 'react';
import { TAB_PLUGIN_API_VERSION, type TabPluginClientComponentProperties } from '../../api';
import { fixtureV1Manifest } from '../manifest';
import { isFixtureV1Payload } from '../shared';

function FixtureV1View({ payload }: TabPluginClientComponentProperties) {
  if (!isFixtureV1Payload(payload)) throw new Error('fixture v1 payload is invalid');
  return <div data-plugin-fixture="v1">{payload.message}</div>;
}

export function activate() {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: fixtureV1Manifest.payloadSchemaVersion,
    validateTabPayload: isFixtureV1Payload,
    component: FixtureV1View,
  };
}
