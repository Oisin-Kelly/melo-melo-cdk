# DynamoDB Access Patterns

This document has been split by domain. See **[docs/data-model/](data-model/README.md)** for the index, the shared table/GSI header, and the cross-cutting conventions (track access rule, counters, fan-out writes, pagination, adding a GSI).

Domain files:

- [users.md](data-model/users.md) — User Profile, Follow Relationship
- [tracks.md](data-model/tracks.md) — Track, Upload Status, Shared Track, Like
- [playlists.md](data-model/playlists.md) — Playlist meta, Playlist Track
- [albums.md](data-model/albums.md) — Album meta, Album Track, Album Share, Album Track Grant, Album Like
- [feed.md](data-model/feed.md) — Feed Item
- [activity.md](data-model/activity.md) — Activity Item, User Progress
