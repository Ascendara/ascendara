// The main window loads while hidden (it is shown on ready-to-show). Chromium
// then runs the frame clock (requestAnimationFrame timestamps and
// document.timeline) about a second ahead of performance.now() for the rest of
// the session.
//
// framer-motion sets the startTime of its hardware-accelerated (WAAPI)
// animations from performance.now(). With that skew, every opacity/transform
// animation starts out already finished and snaps to its end state, which
// made page transitions and fades look like hard cuts.
//
// Rebase startTime values onto the document timeline when the skew is present.
// Without it (a normal window) this changes nothing.
const SKEW_THRESHOLD_MS = 50;

export function fixAnimationClock() {
  if (typeof Animation === "undefined" || !document.timeline) return;
  const descriptor = Object.getOwnPropertyDescriptor(Animation.prototype, "startTime");
  if (!descriptor?.get || !descriptor?.set) return;

  Object.defineProperty(Animation.prototype, "startTime", {
    ...descriptor,
    set(value) {
      if (typeof value === "number" && this.timeline === document.timeline) {
        // document.timeline.currentTime is the current frame's time, so in a
        // healthy window this is 0 to -16ms and stays under the threshold.
        const skew = document.timeline.currentTime - performance.now();
        if (skew > SKEW_THRESHOLD_MS) value += skew;
      }
      descriptor.set.call(this, value);
    },
  });
}
