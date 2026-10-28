// In-band markers: the model signals an intent by writing e.g. "[SWITCH]" in its
// reply. The engine removes the marker before speech synthesis and calls the
// handler registered by the domain layer. The model only RECOGNISES the intent;
// what happens next is decided in code.
function createMarkerStripper(markers = []) {
  for (const marker of markers) {
    if (!marker.pattern.global) throw new Error(`Marker ${marker.pattern} musi mieć flagę "g".`);
  }
  return {
    // Removes complete markers and fires their handlers. Each occurrence fires
    // once, because it is gone from the buffer afterwards.
    strip(text, session) {
      let result = text;
      for (const marker of markers) {
        result = result.replace(marker.pattern, (match, ...rest) => {
          marker.handle?.(session, [match, ...rest.slice(0, -2)]);
          return "";
        });
      }
      return result;
    },
    // Same removal without side effects, plus an unterminated "[..." tail.
    clean(text) {
      let result = text;
      for (const marker of markers) result = result.replace(marker.pattern, "");
      return result.replace(/\[[^\]]*$/, "").replace(/\s{2,}/g, " ").trim();
    },
  };
}

module.exports = { createMarkerStripper };
