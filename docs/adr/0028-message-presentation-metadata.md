# 0028: Message presentation and floating actions

Persist non-model-visible custom turn start/end entries with actual provider, model, effort and elapsed run boundaries. Match queued steering presentation by prompt digest instead of assuming the nearest entry belongs to the next message. Keep original user prompts and SDK image parts intact. Store attachment names, types and sizes as presentation metadata; reuse the existing saved image bytes rather than duplicating them. Older transcripts use their recorded metadata and never invent elapsed duration.

Use one workspace overlay for message actions, outside the transcript scroll layout. User actions anchor below the bubble; completed agent actions belong to the whole run and copy every response segment. Live agent turns do not show that toolbar. Share attachment cards and the existing image viewer between composer and sent messages. Thumbnail edge lighting does not affect the full preview.
