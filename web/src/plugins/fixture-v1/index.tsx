import React from 'react';
import type { FixturePayload } from '@shared/plugins/fixture-v1/shared';
import type { TabPluginClientCapabilities } from '../api';

function FixtureV1({
  payload,
  capabilities,
}: {
  payload: unknown;
  capabilities: TabPluginClientCapabilities;
}) {
  const fixture = payload as FixturePayload;
  return <div data-resource={capabilities.resourceUrl(fixture.resource)}>{fixture.text}</div>;
}

export default FixtureV1;
export { isFixturePayload as isPayload } from '@shared/plugins/fixture-v1/shared';
