# BeenJammin

BeenJammin is a web-based music analytics project for exploring listening
history from Last.fm and Spotify. Visitors can analyze their own data without
creating an account or adding it to the site's published example data.

## What you can explore

### Last.fm Dashboard

Enter any public Last.fm username to build an interactive dashboard with:

- listening totals, artists, tracks, and sessions;
- activity timelines and listening-time heatmaps;
- streaks, rediscoveries, seasonal patterns, and lifetime records; and
- an estimated completion time while history is imported.

The import supports up to 500 Last.fm pages, or approximately 100,000 of the
most recent scrobbles. Large histories can take several minutes to process.

### Spotify Deep Dive

Upload a Spotify Extended Streaming History ZIP file—or its JSON files—to
explore details that scrobbles alone do not capture, including:

- exact listening duration;
- skips and completion rates;
- shuffle behavior and playback reasons;
- devices and listening countries;
- session length, variety, and attention; and
- album, track, and replay patterns.

You can request this export from
[Spotify Account Privacy](https://www.spotify.com/account/privacy/). Select
**Extended Streaming History**, download the ZIP when Spotify emails you, and
upload it without extracting it.

## Privacy

- Spotify files are processed locally in a browser Web Worker. Raw events are
  never uploaded or stored by the site.
- Last.fm analysis uses publicly available scrobbles. The resulting history is
  cached only in that visitor's browser.
- A visitor's Spotify or Last.fm results replace the example view in that
  browser; they do not modify the published example data.
- The Last.fm API key remains on the server and is never sent to visitors.

The collapsed examples are published snapshots belonging to the site owner.
They are demonstrations, not live visitor data.
