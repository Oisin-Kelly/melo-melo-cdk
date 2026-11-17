// What a loader says while something loads: a phrase picked at random per load from the
// screen's pool (so it reads a little differently each time), warm and lightly
// music-themed. Long waits move on to STILL_LOADING.
export const LOADING_PHRASES = {
  generic: ['Loading', 'Just a moment', 'Getting things ready'],
  home: ["Catching up on what's new", 'Seeing what your friends shared', 'Dusting off the turntable'],
  liked: ['Finding the ones you loved', 'Gathering your likes', 'Pulling out your favourites'],
  playlist: ['Queuing up your playlist', 'Lining up the tracks'],
  playlists: ['Fetching your playlists', 'Stacking up your playlists'],
  album: ['Opening the album', 'Lining up the tracks', 'Sliding the record out of its sleeve'],
  albums: ['Pulling out your albums', 'Flipping through the sleeves'],
  track: ['Fetching the track', 'Cueing it up'],
  tracks: ['Lining up the tracks', 'Flipping through the crate'],
  profile: ['Looking them up', 'Flipping through their crate'],
  people: ['Finding people', 'Checking the guest list'],
  activity: ["Checking what's happened", 'Catching up on your notifications'],
  sharedWith: ['Checking who has it'],
  likes: ['Seeing who liked it'],
  settings: ['Getting your details'],
} as const

export type LoadingWhat = keyof typeof LOADING_PHRASES

/** After 4s, then 10s: honest "it's taking a while" lines instead of the same phrase. */
export const STILL_LOADING = [
  { afterMs: 4_000, phrase: 'Still going' },
  { afterMs: 10_000, phrase: 'Nearly there' },
] as const
