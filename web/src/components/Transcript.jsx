import { useEffect, useRef } from "react";

// The conversation as it was said: items from useSession().transcript.
export function Transcript({ items }) {
  const lastRef = useRef(null);
  useEffect(() => {
    lastRef.current?.scrollIntoView({ block: "nearest" });
  }, [items]);
  return (
    <ol className="transcript" aria-live="polite">
      {items.map((item, index) => (
        <li key={item.id} ref={index === items.length - 1 ? lastRef : undefined} className={item.speaker === "user" ? "you" : "avatar"}>
          {item.text}
        </li>
      ))}
    </ol>
  );
}
