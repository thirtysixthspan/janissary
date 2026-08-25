import React from 'react';
import type { FixturePayload } from '@shared/plugins/fixture-v1/shared';
import type { TabPluginClientCapabilities } from '../api';
import './fixture-v1.css';

function FixtureV1({
  payload: fixture,
  capabilities,
}: {
  payload: FixturePayload;
  capabilities: TabPluginClientCapabilities;
}) {
  return <div data-resource={capabilities.resourceUrl(fixture.resource)}>{fixture.text}</div>;
}

export default FixtureV1;
export { isFixturePayload as isPayload } from '@shared/plugins/fixture-v1/shared';
