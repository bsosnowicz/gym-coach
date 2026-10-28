// Turns a stream of LLM text deltas into fragments worth sending to TTS:
// whole sentences when possible, otherwise word-aligned pieces once the buffer
// grows, so the first audio does not wait for a long sentence to finish.
const MAX_UNFLUSHED_CHARS = 60;

function createSentenceStream(strip = (text) => text) {
  let buffer = "";
  return {
    push(delta) {
      buffer = strip(buffer + delta);
      // A marker may arrive split across deltas ("[SWI" + "TCH]"). Everything
      // from an unclosed "[" is held back so it is never read out loud.
      const markerStart = buffer.lastIndexOf("[");
      const partialMarker = markerStart !== -1 && !buffer.includes("]", markerStart);
      const flushable = partialMarker ? buffer.slice(0, markerStart) : buffer;
      const heldBack = partialMarker ? buffer.slice(markerStart) : "";

      if (/[.!?\n]\s*$/.test(flushable)) {
        buffer = heldBack;
        return flushable.trim() ? [flushable] : [];
      }
      if (flushable.length > MAX_UNFLUSHED_CHARS) {
        const lastSpace = flushable.lastIndexOf(" ");
        if (lastSpace > 0) {
          buffer = flushable.slice(lastSpace + 1) + heldBack;
          return [flushable.slice(0, lastSpace + 1)];
        }
      }
      return [];
    },
    // Whatever is left when the model stops; an unterminated marker is dropped.
    flush() {
      const tail = strip(buffer).replace(/\[[^\]]*$/, "");
      buffer = "";
      return tail.trim() ? tail : "";
    },
  };
}

module.exports = { createSentenceStream };
