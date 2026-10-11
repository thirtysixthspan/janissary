# Message bus

The application delivers named events to the listeners subscribed to that event. Delivery is synchronous and uses a snapshot: a listener added during delivery receives the next event, while a listener removed during delivery may still receive the event already being delivered.

A listener that throws does not prevent other listeners from receiving the event. The failure is reported once for that listener while it keeps failing; a successful delivery clears the reported failure so a later failure is reported again. If a listener is removed, its failure-reporting state is cleared. A listener removed during delivery still has its current failure reported, but that report does not keep it registered. Clearing the bus removes all listeners and their failure-reporting state.
