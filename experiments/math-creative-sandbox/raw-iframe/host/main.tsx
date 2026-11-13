import React from "react";
import { createRoot } from "react-dom/client";
import { RawExperience } from "../RawExperience";

const params = new URLSearchParams(window.location.search);
const source = params.get("src");
const root = createRoot(document.getElementById("root")!);

if (!source) {
  root.render(<div className="error">Missing candidate source.</div>);
} else {
  fetch(source)
    .then((response) => {
      if (!response.ok) throw new Error(`Candidate unavailable: ${response.status}`);
      return response.text();
    })
    .then(async (html) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      document.title = `Raw AI Experience ${hash}`;
      root.render(<RawExperience html={html} />);
    })
    .catch((error) => root.render(<div className="error">{String(error)}</div>));
}
