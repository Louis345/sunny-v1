import React from "react";

export function RawExperience({ html }: { html: string }) {
  return (
    <iframe
      title="Raw AI experience"
      srcDoc={html}
      sandbox="allow-scripts"
      allow="autoplay"
    />
  );
}
