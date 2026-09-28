# Clear the suggestion row when one of its suggestions is used

`record.followUps` was replaced only when a reply landed. Clicking a suggestion sent it as your own words, the tab went busy, and the button stayed where it was for the whole of the reply — which can be a long one, since it may include a source read and a model call. So the row kept offering the question that had just been asked, and asking it twice in a row was one misclick away. The spec already promised otherwise: the suggestion "is gone the moment one is used so the same request cannot be asked twice", and the code did not do it.

`send` in `src/visualizations/manager.ts` removes the suggestion its query matches before the message is accepted, and restores the row if `agent.ask` refuses it — a refused message was never sent, so the button that would have sent it is still accurate. The remaining suggestions stay: the spec promises the used one cannot be asked twice, not that the row empties.

The removal is persisted by the accept-time commit added in the persist-a-message fix, and reaches the browser on the `changed()` that commit path already triggers, so the row updates as the tab goes busy rather than when the answer arrives.

`src/visualizations/manager.test.ts` gains two cases under **sending a message**: one where clicking a suggestion leaves the other in place, and one where clicking a suggestion while another message is in flight is refused and the suggestion is still offered afterwards.
