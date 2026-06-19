import React from 'react';
import { render, Text } from 'ink';

export const App = () => <Text>Hello, World</Text>;

if (!process.env.VITEST) {
  render(<App />);
}
