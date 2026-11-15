# Dialog material, focus modality and thread deletion

Dialogs use the composer's surface, glass filter, fine outline and raised shadow in both themes. The footer is transparent and has no separate divider or fill. Solid-surface preferences apply consistently.

Tab initiates visible keyboard focus on controls; pointer interaction returns to pointer modality. Escape and programmatic focus restoration do not initiate keyboard modality. Inputs retain their focus treatment.

Thread deletion requires explicit product confirmation and moves the validated saved transcript to the OS Recycle Bin. Main-process guards reject deletion of running chats and reject starting a chat while it is being deleted. The router releases cached sessions before the move, so deleted journals cannot be recreated by stale hosts. Archive remains the reversible in-app organization action.
