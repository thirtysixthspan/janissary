# Field notes

A small document that exercises the renderer: headings, a list, a table, and a code block.

## Observations

- The harbor lights come on at dusk, north pier first.
- Gulls prefer the fishing boats to the ferries.
- Nobody has explained the third bell.

## Tide table

| Day | High | Low |
| --- | ---- | --- |
| Mon | 06:12 | 12:40 |
| Tue | 07:03 | 13:29 |
| Wed | 07:55 | 14:17 |

## Sampling script

```js
const readings = tides.filter((t) => t.height > 1.5);
console.log(`kept ${readings.length} of ${tides.length}`);
```

> Data collected between March and June. Treat Wednesday's numbers with suspicion.
