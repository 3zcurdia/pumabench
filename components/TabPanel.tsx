"use client";

import { useState } from "react";

export default function TabPanel({
  tabs,
  children,
}: {
  tabs: string[];
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);

  return (
    <>
      <div className="tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`tab${i === active ? " active" : ""}`}
            onClick={() => setActive(i)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="tab-content">{children[active]}</div>
    </>
  );
}
