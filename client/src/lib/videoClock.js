/* The lesson video's time, shared outside the player.
 *
 * The classroom shows the playhead a second time, between the previous and
 * next lesson buttons under the title. The player publishes its time here
 * several times a second; only the small timeline that subscribes re-renders,
 * not the whole lesson page around it. Seeking goes the other way: the
 * timeline asks, and the player (which registered a handler) moves.
 *
 * One clock per lesson: a fresh one when the lesson changes, so a new video
 * never starts out showing the last one's time.
 */
export function createVideoClock() {
  let state = { time: 0, duration: 0 };
  const subscribers = new Set();
  let seeker = null;
  let pauser = null;

  return {
    get: () => state,
    set(time, duration) {
      if (time === state.time && duration === state.duration) return;
      state = { time, duration };
      subscribers.forEach((fn) => fn());
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** The player registers how to move; returns the unregister. */
    onSeek(fn) {
      seeker = fn;
      return () => { if (seeker === fn) seeker = null; };
    },
    /** Move to a fraction (0..1) of the video, if a player is listening. */
    seek(fraction) {
      seeker?.(fraction);
    },
    /** The player registers how to pause; returns the unregister. */
    onPause(fn) {
      pauser = fn;
      return () => { if (pauser === fn) pauser = null; };
    },
    /** Pause the video, if a player is listening. */
    pause() {
      pauser?.();
    },
  };
}
