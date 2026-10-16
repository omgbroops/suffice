First, I'm not sure if this issue is limited to bindMethods, but that's what shows up in my profile, so I'm reporting it that way.

I observed that a huge number of sets were being created by emittery and never being cleaned up. Upon investigating, it looks like these sets are being created to store the various event-handler functions for event names but these sets are never destroyed and the map keys never cleared out when all of the handlers are removed.

For example, here's a snapshot of my memory profile:
![image](https://user-images.githubusercontent.com/2933207/184464319-c0486bf3-d988-40b9-8618-054db10389d8.png)
